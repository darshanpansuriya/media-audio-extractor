import { NextFunction, Request, Response } from 'express';
import { downloadService } from '../services/download.service';
import { validateAudioRequest, validateDownloadRequest } from '../utils/validator';
import { sendSuccess } from '../utils/response';
import { AudioRequestBody, DownloadRequestBody } from '../types/api.types';

/**
 * HTTP layer for the download feature. Controllers stay thin: validate input,
 * delegate to the service, format the response. All errors bubble to the
 * centralized error middleware via `next`.
 */
export class DownloadController {
  /**
   * Handle `POST /api/video`.
   */
  public async downloadVideo(
    req: Request<unknown, unknown, DownloadRequestBody>,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const input = validateDownloadRequest(req.body);
      const result = await downloadService.process(input);
      sendSuccess(res, result, 'Video uploaded successfully', 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Handle `POST /api/audio`.
   *
   * Accepts `{ url, format? }` where `format` is `opus` (default) or `mp3`,
   * and returns Cloudinary delivery links for the audio.
   */
  public async downloadAudio(
    req: Request<unknown, unknown, AudioRequestBody>,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const input = validateAudioRequest(req.body);
      const result = await downloadService.processAudio(input);
      sendSuccess(res, result, 'Audio extracted successfully', 200);
    } catch (error) {
      next(error);
    }
  }
}

export const downloadController = new DownloadController();
