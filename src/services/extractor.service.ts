import path from 'path';
import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';
import youtubeDl from 'youtube-dl-exec';

import { DownloadedFile, IExtractorService, MediaInfo } from '../types/api.types';
import { ApiError } from '../middlewares/error.middleware';
import { logger } from '../utils/logger';
import { config } from '../config/env';

/**
 * yt-dlp powered media extractor.
 *
 * Resolves a social media page URL (TikTok, Instagram, X/Twitter, Facebook,
 * YouTube, etc.) into a finished media file on local disk.
 *
 * The extraction is isolated behind {@link IExtractorService}, so swapping in
 * a different provider later requires no changes to the business logic.
 *
 * Notes:
 *  - YouTube (and increasingly other sites) no longer serve a single
 *    progressive file containing both video and audio. yt-dlp therefore
 *    downloads the best video and best audio streams separately and merges
 *    them with ffmpeg, which MUST be installed on the host. The merged file is
 *    written to the temp directory and its path is returned.
 *  - If the URL already points straight at a media file, yt-dlp is skipped
 *    entirely as a fast path ({@link resolveDirect}) so the caller can stream
 *    it directly without spawning a subprocess.
 */
export class ExtractorService implements IExtractorService {
  /**
   * Map of known media extensions to their MIME types. Used by the direct
   * fast path to recognise URLs that already point at a media file.
   */
  private static readonly MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    m4v: 'video/x-m4v',
    // Audio-only containers.
    m4a: 'audio/mp4',
    mp3: 'audio/mpeg',
    opus: 'audio/opus',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    aac: 'audio/aac',
    wav: 'audio/wav',
  };

  /**
   * yt-dlp video format selector: best video + best audio merged, capped at
   * 1080p to keep file sizes and merge times sane, with a progressive
   * single-file fallback for sources that still provide one.
   */
  private static readonly VIDEO_FORMAT_SELECTOR =
    'bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b';

  /**
   * yt-dlp audio format selector: best audio-only stream, falling back to the
   * single best format. No merge needed — Cloudinary transcodes to the
   * requested delivery format later.
   */
  private static readonly AUDIO_FORMAT_SELECTOR = 'ba/b';

  /**
   * If the URL already references a downloadable media file, build the
   * {@link MediaInfo} from it. Returns `null` when the URL is not a direct
   * media link and full extraction is required.
   */
  public resolveDirect(url: string): MediaInfo | null {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }

    const lastSegment = parsed.pathname.split('/').filter(Boolean).pop() ?? '';
    const dotIndex = lastSegment.lastIndexOf('.');
    if (dotIndex === -1) {
      return null;
    }

    const extension = lastSegment.slice(dotIndex + 1).toLowerCase();
    const mimeType = ExtractorService.MIME_BY_EXTENSION[extension];
    if (mimeType === undefined) {
      return null;
    }

    logger.debug('Resolved direct media URL (fast path)', { url });
    return {
      directUrl: url,
      filename: this.sanitizeFilename(lastSegment),
      mimeType,
    };
  }

  /**
   * Download a video (merging separate video/audio streams as needed).
   */
  public async downloadVideo(url: string, outputDir: string): Promise<DownloadedFile> {
    logger.debug('Downloading video via yt-dlp', { url });
    return this.runDownload(url, outputDir, ExtractorService.VIDEO_FORMAT_SELECTOR, {
      // Merge the separate streams into a single mp4 container.
      mergeOutputFormat: 'mp4',
    });
  }

  /**
   * Download the best available audio-only stream.
   */
  public async downloadAudio(url: string, outputDir: string): Promise<DownloadedFile> {
    logger.debug('Downloading audio via yt-dlp', { url });
    return this.runDownload(url, outputDir, ExtractorService.AUDIO_FORMAT_SELECTOR, {});
  }

  /**
   * Run yt-dlp to download `url` into `outputDir` using the supplied format
   * selector, then locate and return the finished file.
   *
   * Each download is written under a unique id prefix so concurrent requests
   * never collide and the produced file can be found unambiguously afterwards.
   */
  private async runDownload(
    url: string,
    outputDir: string,
    formatSelector: string,
    extraOptions: Record<string, unknown>
  ): Promise<DownloadedFile> {
    await fs.ensureDir(outputDir);

    const id = uuidv4();
    const outputTemplate = path.join(outputDir, `${id}.%(ext)s`);

    // Base flags, plus optional auth/anti-bot flags pulled from config.
    // `cookies` is the reliable way past YouTube's "confirm you're not a bot"
    // wall on datacenter IPs; `extractorArgs` forces a specific player client
    // as a fallback. Both are omitted entirely when not configured.
    const options: Record<string, unknown> = {
      format: formatSelector,
      output: outputTemplate,
      noPlaylist: true,
      noWarnings: true,
      noCheckCertificates: true,
      // Don't leave .part files around if a download is interrupted.
      noPart: true,
      // Abort before/while downloading if the source advertises a size over
      // the limit (a post-download stat check below catches the rest).
      maxFilesize: `${config.maxFileSizeMb}M`,
      ...extraOptions,
    };

    if (config.ytdlp.cookiesFile !== undefined) {
      options.cookies = config.ytdlp.cookiesFile;
    }
    if (config.ytdlp.playerClient !== undefined) {
      options.extractorArgs = `youtube:player_client=${config.ytdlp.playerClient}`;
    }

    try {
      await youtubeDl(url, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('yt-dlp download failed', error);

      // Size cap hit — surface as the dedicated 413 rather than a generic 502.
      if (message.includes('max-filesize') || message.includes('larger than')) {
        throw new ApiError(
          413,
          `Media exceeds the maximum allowed size of ${config.maxFileSizeMb} MB`,
          message
        );
      }
      // ffmpeg missing is the most common deployment mistake for the merge
      // path — call it out explicitly so it's actionable.
      if (message.includes('ffmpeg') || message.includes('ffprobe')) {
        throw new ApiError(
          502,
          'Media extraction failed: ffmpeg is required to merge video and audio. ' +
            'Install it on the server (e.g. `apt install ffmpeg`).',
          message
        );
      }
      throw new ApiError(
        502,
        'Failed to extract media from the provided URL. The link may be ' +
          'private, unsupported, region-locked, or expired.',
        message
      );
    }

    const produced = await this.locateProducedFile(outputDir, id);
    if (produced === null) {
      throw new ApiError(502, 'Could not resolve a downloadable media stream for this URL.');
    }

    // Final safety net: enforce the size limit on the file actually written,
    // since --max-filesize cannot always know the size up front.
    const stat = await fs.stat(produced);
    if (stat.size > config.maxFileSizeBytes) {
      await this.safeRemove(produced);
      throw new ApiError(
        413,
        `Media exceeds the maximum allowed size of ${config.maxFileSizeMb} MB`
      );
    }

    logger.info('Media downloaded via yt-dlp', { filePath: produced, bytes: stat.size });
    return { filePath: produced, filename: path.basename(produced) };
  }

  /**
   * Find the file yt-dlp wrote for a given id prefix. yt-dlp may briefly
   * create per-stream fragment files (`<id>.f137.mp4`, `<id>.f140.m4a`) before
   * merging; after a successful run only the merged file remains, but we pick
   * the largest matching file defensively in case any sidecar lingers.
   */
  private async locateProducedFile(outputDir: string, id: string): Promise<string | null> {
    const entries = await fs.readdir(outputDir);
    const matches = entries.filter((name) => name.startsWith(`${id}.`));
    if (matches.length === 0) {
      return null;
    }

    let best: { filePath: string; size: number } | null = null;
    for (const name of matches) {
      const filePath = path.join(outputDir, name);
      const { size } = await fs.stat(filePath);
      if (best === null || size > best.size) {
        best = { filePath, size };
      }
    }
    return best?.filePath ?? null;
  }

  /**
   * Remove a file if it exists, swallowing (but logging) any error.
   */
  private async safeRemove(filePath: string): Promise<void> {
    try {
      await fs.remove(filePath);
    } catch (error) {
      logger.error('Failed to remove file', { filePath, error });
    }
  }

  /**
   * Remove characters that are unsafe for filesystem paths.
   */
  private sanitizeFilename(filename: string): string {
    const cleaned = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return cleaned.length > 0 ? cleaned : 'media';
  }
}

/**
 * Singleton extractor instance used throughout the application.
 *
 * To swap providers later, implement {@link IExtractorService} in a new
 * class and assign an instance of it here.
 */
export const extractorService: IExtractorService = new ExtractorService();
