import { Router } from 'express';
import { downloadController } from '../controllers/download.controller';

/**
 * Routes for the media download feature, mounted under `/api`.
 */
const router = Router();

/**
 * POST /api/video
 * Accepts `{ "url": "https://..." }` and returns the public Cloudinary URL.
 */
router.post('/video', (req, res, next) => downloadController.downloadVideo(req, res, next));

/**
 * POST /api/audio
 * Accepts `{ "url": "https://...", "format": "opus" | "mp3" }` and returns
 * Cloudinary delivery links for the extracted audio. `format` is optional and
 * defaults to the server's configured default (`opus`).
 */
router.post('/audio', (req, res, next) => downloadController.downloadAudio(req, res, next));

export default router;
