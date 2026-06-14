import youtubeDl from 'youtube-dl-exec';

import { IExtractorService, MediaInfo } from '../types/api.types';
import { ApiError } from '../middlewares/error.middleware';
import { logger } from '../utils/logger';

/**
 * Subset of the yt-dlp JSON payload that this extractor relies on.
 * yt-dlp returns far more fields; only the ones we read are typed here.
 */
interface YtDlpDownload {
  url?: string;
  ext?: string;
  http_headers?: Record<string, string>;
}

interface YtDlpInfo {
  url?: string;
  ext?: string;
  title?: string;
  http_headers?: Record<string, string>;
  requested_downloads?: YtDlpDownload[];
  requested_formats?: YtDlpDownload[];
}

/**
 * yt-dlp powered media extractor.
 *
 * Resolves a social media page URL (TikTok, Instagram, X/Twitter, Facebook,
 * YouTube, etc.) into a single, directly-downloadable progressive media URL
 * plus any HTTP headers the source CDN requires.
 *
 * The extraction is isolated behind {@link IExtractorService}, so swapping in
 * a different provider later requires no changes to the business logic.
 *
 * Notes:
 *  - A *progressive* (already-muxed) HTTP(S) format is requested so the file
 *    can be streamed directly to disk by the download service without needing
 *    ffmpeg to merge separate audio/video tracks.
 *  - If the URL already points straight at a media file, yt-dlp is skipped
 *    entirely as a fast path.
 */
export class ExtractorService implements IExtractorService {
  /**
   * Map of known media extensions to their MIME types.
   */
  private static readonly MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    m4v: 'video/x-m4v',
    // Audio-only containers (yt-dlp `bestaudio` output).
    m4a: 'audio/mp4',
    mp3: 'audio/mpeg',
    opus: 'audio/opus',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    aac: 'audio/aac',
    wav: 'audio/wav',
  };

  /**
   * yt-dlp format selector: prefer a progressive mp4 over plain HTTP, then any
   * progressive HTTP format, then fall back to the single best format.
   */
  private static readonly FORMAT_SELECTOR = 'b[ext=mp4][protocol^=http]/b[protocol^=http]/b';

  /**
   * yt-dlp format selector for audio: prefer an HTTP audio-only stream, then
   * any best audio, then fall back to the single best format.
   */
  private static readonly AUDIO_FORMAT_SELECTOR = 'ba[protocol^=http]/ba/b';

  /**
   * Resolve a source URL into directly downloadable media information.
   */
  public async getMediaInfo(url: string): Promise<MediaInfo> {
    logger.debug('Resolving media info', { url });

    const directInfo = this.tryResolveDirectMedia(url);
    if (directInfo !== null) {
      logger.debug('Resolved direct media URL (fast path)', directInfo);
      return directInfo;
    }

    return this.resolveWithYtDlp(url, ExtractorService.FORMAT_SELECTOR);
  }

  /**
   * Resolve a source URL into a directly downloadable audio-only stream.
   *
   * Unlike {@link getMediaInfo} there is no direct-media fast path: an audio
   * request should always go through yt-dlp so it can isolate the best
   * audio-only track from a page that primarily hosts video.
   */
  public async getAudioInfo(url: string): Promise<MediaInfo> {
    logger.debug('Resolving audio info', { url });
    return this.resolveWithYtDlp(url, ExtractorService.AUDIO_FORMAT_SELECTOR);
  }

  /**
   * Use yt-dlp to extract a downloadable media URL from a page URL using the
   * supplied format selector.
   */
  private async resolveWithYtDlp(url: string, formatSelector: string): Promise<MediaInfo> {
    let info: YtDlpInfo;
    try {
      info = (await youtubeDl(url, {
        dumpSingleJson: true,
        noWarnings: true,
        noPlaylist: true,
        noCheckCertificates: true,
        preferFreeFormats: true,
        format: formatSelector,
      })) as unknown as YtDlpInfo;
    } catch (error) {
      logger.error('yt-dlp extraction failed', error);
      throw new ApiError(
        502,
        'Failed to extract media from the provided URL. The link may be ' +
          'private, unsupported, region-locked, or expired.',
        error instanceof Error ? error.message : undefined
      );
    }

    const selected = this.selectDownload(info);
    if (selected.url === undefined || selected.url === '') {
      throw new ApiError(502, 'Could not resolve a downloadable media stream for this URL.');
    }

    const extension = (selected.ext ?? 'mp4').toLowerCase();
    const mimeType = ExtractorService.MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
    const baseName = info.title ?? 'video';

    const mediaInfo: MediaInfo = {
      directUrl: selected.url,
      filename: this.sanitizeFilename(`${baseName}.${extension}`),
      mimeType,
    };

    const headers = selected.http_headers ?? info.http_headers;
    if (headers !== undefined) {
      mediaInfo.headers = headers;
    }

    logger.info('Resolved media via yt-dlp', {
      filename: mediaInfo.filename,
      mimeType: mediaInfo.mimeType,
    });
    return mediaInfo;
  }

  /**
   * Pick the concrete download (URL + ext + headers) from a yt-dlp payload,
   * preferring the explicit top-level fields and falling back to the
   * `requested_downloads` / `requested_formats` arrays.
   */
  private selectDownload(info: YtDlpInfo): YtDlpDownload {
    if (info.url !== undefined && info.url !== '') {
      return { url: info.url, ext: info.ext, http_headers: info.http_headers };
    }

    const fromDownloads = info.requested_downloads?.[0];
    if (fromDownloads?.url) {
      return fromDownloads;
    }

    const fromFormats = info.requested_formats?.[0];
    if (fromFormats?.url) {
      return fromFormats;
    }

    return {};
  }

  /**
   * If the URL already references a downloadable media file, build the
   * {@link MediaInfo} from it. Returns `null` when the URL is not a direct
   * media link.
   */
  private tryResolveDirectMedia(url: string): MediaInfo | null {
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

    return {
      directUrl: url,
      filename: this.sanitizeFilename(lastSegment),
      mimeType,
    };
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
