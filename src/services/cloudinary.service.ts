import { cloudinary } from '../config/cloudinary';
import { AudioFormat, CloudinaryUploadResult } from '../types/api.types';
import { ApiError } from '../middlewares/error.middleware';
import { logger } from '../utils/logger';

/**
 * Folder under which all downloaded videos are stored in Cloudinary.
 */
const CLOUDINARY_FOLDER = 'social-media-downloads';

/**
 * Folder under which extracted audio is stored in Cloudinary. Audio assets
 * use the `video` resource type (Cloudinary treats audio as a sub-type of
 * video), so they are namespaced into their own folder for clarity.
 */
const CLOUDINARY_AUDIO_FOLDER = 'social-media-downloads/audio';

/**
 * Thin, well-typed wrapper around the Cloudinary SDK.
 *
 * Keeping all Cloudinary interaction here means the rest of the app never
 * touches the SDK directly, which keeps the business logic provider-agnostic.
 */
export class CloudinaryService {
  /**
   * Upload a local video file to Cloudinary.
   *
   * @param filePath Absolute path to the local file to upload.
   * @returns        The Cloudinary public id and secure URL.
   * @throws {ApiError} 502 when the upload fails.
   */
  public async uploadVideo(filePath: string): Promise<CloudinaryUploadResult> {
    logger.debug('Uploading file to Cloudinary', { filePath });

    try {
      const result = await cloudinary.uploader.upload(filePath, {
        resource_type: 'video',
        folder: CLOUDINARY_FOLDER,
        use_filename: true,
        unique_filename: true,
        overwrite: false,
      });

      logger.info('Cloudinary upload succeeded', { publicId: result.public_id });

      return {
        publicId: result.public_id,
        secureUrl: result.secure_url,
      };
    } catch (error) {
      logger.error('Cloudinary upload failed', error);
      throw new ApiError(
        502,
        'Failed to upload media to Cloudinary',
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * Upload a local audio file to Cloudinary.
   *
   * Audio is stored under the `video` resource type — Cloudinary's model for
   * all time-based media — which is also what enables on-the-fly transcoding
   * to other audio formats at delivery time (see {@link buildAudioUrl}).
   *
   * @param filePath Absolute path to the local audio file to upload.
   * @returns        The Cloudinary public id and secure URL.
   * @throws {ApiError} 502 when the upload fails.
   */
  public async uploadAudio(filePath: string): Promise<CloudinaryUploadResult> {
    logger.debug('Uploading audio to Cloudinary', { filePath });

    try {
      const result = await cloudinary.uploader.upload(filePath, {
        resource_type: 'video',
        folder: CLOUDINARY_AUDIO_FOLDER,
        use_filename: true,
        unique_filename: true,
        overwrite: false,
      });

      logger.info('Cloudinary audio upload succeeded', { publicId: result.public_id });

      return {
        publicId: result.public_id,
        secureUrl: result.secure_url,
      };
    } catch (error) {
      logger.error('Cloudinary audio upload failed', error);
      throw new ApiError(
        502,
        'Failed to upload audio to Cloudinary',
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * Build a secure Cloudinary delivery URL for an uploaded audio asset in the
   * requested format. Cloudinary transcodes the stored audio to the requested
   * format on the fly, so the same upload can be delivered as opus, mp3, etc.
   *
   * @param publicId The Cloudinary public id of the uploaded audio.
   * @param format   The audio format to deliver.
   */
  public buildAudioUrl(publicId: string, format: AudioFormat): string {
    return cloudinary.url(publicId, {
      resource_type: 'video',
      format,
      secure: true,
    });
  }

  /**
   * Delete a previously uploaded video from Cloudinary.
   *
   * Used for cleanup/compensation if a later step fails. Failures here are
   * logged but not re-thrown, since deletion is best-effort cleanup.
   *
   * @param publicId The Cloudinary public id to remove.
   */
  public async deleteFile(publicId: string): Promise<void> {
    logger.debug('Deleting file from Cloudinary', { publicId });

    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
      logger.info('Cloudinary asset deleted', { publicId });
    } catch (error) {
      logger.error('Failed to delete Cloudinary asset', { publicId, error });
    }
  }
}

/**
 * Singleton Cloudinary service instance.
 */
export const cloudinaryService = new CloudinaryService();
