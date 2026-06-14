import {
  AUDIO_FORMATS,
  AudioInput,
  AudioRequestBody,
  DownloadInput,
  DownloadRequestBody,
} from '../types/api.types';
import { config } from '../config/env';
import { ApiError } from '../middlewares/error.middleware';

/**
 * Input validation helpers.
 *
 * Validation lives here (rather than inline in the controller) so the rules
 * are reusable and independently testable.
 */

/**
 * Determine whether a string is a syntactically valid HTTP(S) URL.
 */
export function isValidHttpUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}

/**
 * Validate and normalize the `url` field shared by every download endpoint.
 *
 * @throws {ApiError} 400 when the URL is missing, not a string, empty, or not
 *                    a valid HTTP(S) URL.
 */
function validateUrlField(url: unknown): string {
  if (url === undefined || url === null || url === '') {
    throw new ApiError(400, 'The "url" field is required');
  }

  if (typeof url !== 'string') {
    throw new ApiError(400, 'The "url" field must be a string');
  }

  const trimmed = url.trim();

  if (trimmed === '') {
    throw new ApiError(400, 'The "url" field cannot be empty');
  }

  if (!isValidHttpUrl(trimmed)) {
    throw new ApiError(400, 'The "url" field must be a valid http(s) URL');
  }

  return trimmed;
}

/**
 * Validate and normalize the body of a download request.
 *
 * @throws {ApiError} 400 when the body is empty, the URL is missing,
 *                    not a string, or not a valid HTTP(S) URL.
 */
export function validateDownloadRequest(body: DownloadRequestBody | undefined): DownloadInput {
  if (body === undefined || body === null || typeof body !== 'object') {
    throw new ApiError(400, 'Request body is required');
  }

  return { url: validateUrlField(body.url) };
}

/**
 * Validate and normalize the body of an audio request.
 *
 * The `url` is validated identically to a download request. The optional
 * `format` is validated against the supported set; when omitted it falls back
 * to the server's configured default ({@link config.defaultAudioFormat}).
 *
 * @throws {ApiError} 400 when the body or URL is invalid, or when `format` is
 *                    present but not one of the supported values.
 */
export function validateAudioRequest(body: AudioRequestBody | undefined): AudioInput {
  if (body === undefined || body === null || typeof body !== 'object') {
    throw new ApiError(400, 'Request body is required');
  }

  const url = validateUrlField(body.url);
  const { format } = body;

  if (format === undefined || format === null || format === '') {
    return { url, format: config.defaultAudioFormat };
  }

  if (typeof format !== 'string') {
    throw new ApiError(400, 'The "format" field must be a string');
  }

  const normalized = format.trim().toLowerCase();
  const match = AUDIO_FORMATS.find((supported) => supported === normalized);
  if (match === undefined) {
    throw new ApiError(400, `The "format" field must be one of [${AUDIO_FORMATS.join(', ')}]`);
  }

  return { url, format: match };
}
