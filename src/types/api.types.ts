/**
 * Shared application type definitions.
 *
 * These types describe the public contract of the API as well as the
 * internal data structures that flow between services.
 */

/**
 * The standard success envelope returned by every successful endpoint.
 */
export interface SuccessResponse<T> {
  success: true;
  message: string;
  data: T;
}

/**
 * The standard error envelope returned by the centralized error middleware.
 */
export interface ErrorResponse {
  success: false;
  message: string;
  error: {
    name: string;
    statusCode: number;
    details?: unknown;
  };
}

/**
 * Body of the `POST /api/video` request.
 */
export interface DownloadRequestBody {
  url?: unknown;
}

/**
 * Validated download input passed to the service layer.
 */
export interface DownloadInput {
  url: string;
}

/**
 * Audio delivery formats supported by the `POST /api/audio` endpoint.
 *
 * `opus` is the high-efficiency default; `mp3` is offered for maximum
 * compatibility with older players.
 */
export type AudioFormat = 'opus' | 'mp3';

/**
 * All audio formats the API can deliver, in preference order. Used both for
 * validation and to generate the per-format link map in the response.
 */
export const AUDIO_FORMATS: readonly AudioFormat[] = ['opus', 'mp3'];

/**
 * Body of the `POST /api/audio` request.
 */
export interface AudioRequestBody {
  url?: unknown;
  /** Optional delivery format; defaults to the server's configured default. */
  format?: unknown;
}

/**
 * Validated audio input passed to the service layer.
 */
export interface AudioInput {
  url: string;
  format: AudioFormat;
}

/**
 * Information returned by an extractor implementation. It contains
 * everything required to fetch the raw media bytes.
 */
export interface MediaInfo {
  /** A directly-downloadable URL pointing at the raw media file. */
  directUrl: string;
  /** Suggested filename (including extension) for the downloaded media. */
  filename: string;
  /** MIME type of the media, e.g. `video/mp4`. */
  mimeType: string;
  /**
   * Optional HTTP headers required to fetch {@link directUrl}. Some CDNs
   * reject requests that lack the original referer/user-agent.
   */
  headers?: Record<string, string>;
}

/**
 * A media file that an extractor has already downloaded to local disk
 * (e.g. via yt-dlp, which merges separate video/audio streams). The caller
 * is responsible for uploading and then removing the file.
 */
export interface DownloadedFile {
  /** Absolute path to the downloaded file on local disk. */
  filePath: string;
  /** The file's name (including extension). */
  filename: string;
}

/**
 * Result of a successful Cloudinary upload.
 */
export interface CloudinaryUploadResult {
  publicId: string;
  secureUrl: string;
}

/**
 * The `data` payload returned by `POST /api/video`.
 */
export interface DownloadResult {
  sourceUrl: string;
  cloudinaryUrl: string;
  publicId: string;
}

/**
 * The `data` payload returned by `POST /api/audio`.
 *
 * The audio is uploaded to Cloudinary once; `audioUrl` is the link in the
 * requested (or default) format, while `formats` provides a ready-made link
 * for every supported format so callers can switch without another request.
 */
export interface AudioResult {
  sourceUrl: string;
  /** The format `audioUrl` points at. */
  format: AudioFormat;
  /** Cloudinary delivery URL in the requested/default format. */
  audioUrl: string;
  publicId: string;
  /** A delivery URL for every supported format, keyed by format name. */
  formats: Record<AudioFormat, string>;
}

/**
 * Contract that every media extractor must implement. Isolating the
 * extraction behind this interface lets a real provider be swapped in
 * later without touching the business logic.
 */
export interface IExtractorService {
  /**
   * Fast path for URLs that already point straight at a media file: returns
   * the info needed to stream it directly. Returns `null` when the URL needs
   * full extraction (e.g. a YouTube/TikTok page), in which case the caller
   * should use {@link downloadVideo} / {@link downloadAudio}.
   */
  resolveDirect(url: string): MediaInfo | null;
  /**
   * Download a video into `outputDir`, merging YouTube's now-separate video
   * and audio streams into a single file (requires ffmpeg). Returns the path
   * to the finished local file.
   */
  downloadVideo(url: string, outputDir: string): Promise<DownloadedFile>;
  /**
   * Download the best available *audio-only* stream into `outputDir`. Format
   * conversion is handled downstream at delivery time, so the returned file is
   * whatever container the source provides. Returns the local file path.
   */
  downloadAudio(url: string, outputDir: string): Promise<DownloadedFile>;
}
