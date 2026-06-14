import dotenv from 'dotenv';
import path from 'path';

import { AUDIO_FORMATS, AudioFormat } from '../types/api.types';

dotenv.config();

/**
 * Strongly-typed, validated view of the process environment.
 *
 * Loading and validation happen once at startup so the rest of the
 * application can rely on these values being present and well-formed.
 */
export interface AppConfig {
  port: number;
  cloudinary: {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
  };
  tempDirectory: string;
  maxFileSizeMb: number;
  maxFileSizeBytes: number;
  /**
   * Format used by `POST /api/audio` when the request omits `format`.
   * Defaults to `opus`; set `DEFAULT_AUDIO_FORMAT=mp3` to flip it.
   */
  defaultAudioFormat: AudioFormat;
}

/**
 * Read a required environment variable, throwing if it is missing or empty.
 */
function requireEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}

/**
 * Read an optional environment variable, falling back to a default.
 */
function optionalEnv(key: string, fallback: string): string {
  const value = process.env[key];
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  return value.trim();
}

/**
 * Parse a numeric environment value, throwing on invalid input.
 */
function parseNumber(key: string, raw: string): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${key} must be a positive number, received: "${raw}"`);
  }
  return parsed;
}

/**
 * Parse the default audio format, accepting only the supported values.
 */
function parseAudioFormat(key: string, raw: string): AudioFormat {
  const normalized = raw.toLowerCase();
  const match = AUDIO_FORMATS.find((format) => format === normalized);
  if (match === undefined) {
    throw new Error(
      `Environment variable ${key} must be one of [${AUDIO_FORMATS.join(', ')}], received: "${raw}"`
    );
  }
  return match;
}

const maxFileSizeMb = parseNumber('MAX_FILE_SIZE_MB', optionalEnv('MAX_FILE_SIZE_MB', '500'));
const tempDirectory = path.resolve(optionalEnv('TEMP_DIRECTORY', './temp'));
const defaultAudioFormat = parseAudioFormat(
  'DEFAULT_AUDIO_FORMAT',
  optionalEnv('DEFAULT_AUDIO_FORMAT', 'opus')
);

export const config: AppConfig = {
  port: parseNumber('PORT', optionalEnv('PORT', '3000')),
  cloudinary: {
    cloudName: requireEnv('CLOUDINARY_CLOUD_NAME'),
    apiKey: requireEnv('CLOUDINARY_API_KEY'),
    apiSecret: requireEnv('CLOUDINARY_API_SECRET'),
  },
  tempDirectory,
  maxFileSizeMb,
  maxFileSizeBytes: maxFileSizeMb * 1024 * 1024,
  defaultAudioFormat,
};
