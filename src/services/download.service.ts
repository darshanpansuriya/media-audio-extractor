import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import fs from 'fs-extra';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

import { config } from '../config/env';
import { logger } from '../utils/logger';
import { ApiError } from '../middlewares/error.middleware';
import {
  AUDIO_FORMATS,
  AudioFormat,
  AudioInput,
  AudioResult,
  DownloadInput,
  DownloadResult,
  IExtractorService,
  MediaInfo,
} from '../types/api.types';
import { extractorService } from './extractor.service';
import { cloudinaryService, CloudinaryService } from './cloudinary.service';

/**
 * Orchestrates the full download → upload → cleanup flow.
 *
 * This is the single piece of business logic in the application. It depends
 * only on abstractions ({@link IExtractorService}, {@link CloudinaryService})
 * so each collaborator can evolve or be replaced independently.
 */
export class DownloadService {
  constructor(
    private readonly extractor: IExtractorService,
    private readonly cloudinary: CloudinaryService
  ) {}

  /**
   * Process a download request end-to-end.
   *
   *   1. Resolve direct media info via the extractor.
   *   2. Stream the media into the temp directory.
   *   3. Upload the temp file to Cloudinary.
   *   4. Delete the temp file (always, even on failure).
   *   5. Return the public Cloudinary URL.
   */
  public async process(input: DownloadInput): Promise<DownloadResult> {
    const tempFilePath = await this.fetchVideoToTemp(input.url);

    try {
      const upload = await this.cloudinary.uploadVideo(tempFilePath);

      return {
        sourceUrl: input.url,
        cloudinaryUrl: upload.secureUrl,
        publicId: upload.publicId,
      };
    } finally {
      // Always remove the temp file — on success and on failure — to
      // prevent orphaned files from accumulating on disk.
      await this.safeRemove(tempFilePath);
    }
  }

  /**
   * Process an audio request end-to-end.
   *
   *   1. Resolve the best audio-only stream via the extractor.
   *   2. Stream it into the temp directory.
   *   3. Upload the temp file to Cloudinary.
   *   4. Delete the temp file (always, even on failure).
   *   5. Return delivery links — the requested format plus every supported
   *      format — so the caller can switch formats without re-uploading.
   */
  public async processAudio(input: AudioInput): Promise<AudioResult> {
    const { filePath: tempFilePath } = await this.extractor.downloadAudio(
      input.url,
      config.tempDirectory
    );

    try {
      const upload = await this.cloudinary.uploadAudio(tempFilePath);

      // Build a delivery link for every supported format up front; Cloudinary
      // transcodes on the fly, so this costs nothing extra and lets callers
      // flip between opus and mp3 freely.
      const formats = AUDIO_FORMATS.reduce(
        (acc, format) => {
          acc[format] = this.cloudinary.buildAudioUrl(upload.publicId, format);
          return acc;
        },
        {} as Record<AudioFormat, string>
      );

      return {
        sourceUrl: input.url,
        format: input.format,
        audioUrl: formats[input.format],
        publicId: upload.publicId,
        formats,
      };
    } finally {
      await this.safeRemove(tempFilePath);
    }
  }

  /**
   * Obtain a local temp file for a video request.
   *
   * Direct media URLs (a CDN link straight to an .mp4 etc.) are streamed with
   * the size-guarded HTTP path. Everything else (YouTube, TikTok, …) goes
   * through yt-dlp, which merges separate video/audio streams into one file.
   *
   * @returns Absolute path to the downloaded temp file.
   */
  private async fetchVideoToTemp(url: string): Promise<string> {
    const direct = this.extractor.resolveDirect(url);
    if (direct !== null) {
      return this.streamDirectToTemp(direct);
    }

    const { filePath } = await this.extractor.downloadVideo(url, config.tempDirectory);
    return filePath;
  }

  /**
   * Stream a directly-downloadable media URL into a unique temp file.
   *
   * The download is size-guarded: it aborts if the stream exceeds the
   * configured maximum file size.
   *
   * @returns Absolute path to the downloaded temp file.
   */
  private async streamDirectToTemp(mediaInfo: MediaInfo): Promise<string> {
    await fs.ensureDir(config.tempDirectory);

    const extension = path.extname(mediaInfo.filename) || '.mp4';
    const tempFileName = `${uuidv4()}${extension}`;
    const tempFilePath = path.join(config.tempDirectory, tempFileName);

    logger.info('Downloading media to temp', {
      directUrl: mediaInfo.directUrl,
      tempFilePath,
    });

    let response;
    try {
      response = await axios.get<Readable>(mediaInfo.directUrl, {
        responseType: 'stream',
        maxRedirects: 5,
        timeout: 60_000,
        // Forward any headers (referer/user-agent) the source CDN requires.
        ...(mediaInfo.headers !== undefined ? { headers: mediaInfo.headers } : {}),
        // Let us enforce our own size limit via the stream guard below.
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
    } catch (error) {
      logger.error('Failed to fetch media from source', error);
      throw new ApiError(
        502,
        'Failed to download media from the source URL',
        error instanceof Error ? error.message : undefined
      );
    }

    // Reject early if the server advertises a content-length over the limit.
    const contentLength = Number(response.headers['content-length']);
    if (Number.isFinite(contentLength) && contentLength > config.maxFileSizeBytes) {
      throw new ApiError(
        413,
        `Media exceeds the maximum allowed size of ${config.maxFileSizeMb} MB`
      );
    }

    const source = response.data;
    let downloadedBytes = 0;

    source.on('data', (chunk: Buffer) => {
      downloadedBytes += chunk.length;
      if (downloadedBytes > config.maxFileSizeBytes) {
        source.destroy(
          new ApiError(413, `Media exceeds the maximum allowed size of ${config.maxFileSizeMb} MB`)
        );
      }
    });

    try {
      await pipeline(source, fs.createWriteStream(tempFilePath));
    } catch (error) {
      await this.safeRemove(tempFilePath);
      if (error instanceof ApiError) {
        throw error;
      }
      logger.error('Failed while streaming media to disk', error);
      throw new ApiError(
        502,
        'Failed while saving downloaded media',
        error instanceof Error ? error.message : undefined
      );
    }

    logger.info('Media downloaded', { tempFilePath, bytes: downloadedBytes });
    return tempFilePath;
  }

  /**
   * Remove a temp file if it exists, swallowing (but logging) any error so
   * cleanup never masks the original outcome.
   */
  private async safeRemove(filePath: string): Promise<void> {
    try {
      await fs.remove(filePath);
      logger.debug('Temp file removed', { filePath });
    } catch (error) {
      logger.error('Failed to remove temp file', { filePath, error });
    }
  }
}

/**
 * Singleton download service wired with the default collaborators.
 */
export const downloadService = new DownloadService(extractorService, cloudinaryService);
