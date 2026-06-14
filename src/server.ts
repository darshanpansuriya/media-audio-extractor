import fs from 'fs-extra';

import { createApp } from './app';
import { config } from './config/env';
import { logger } from './utils/logger';

/**
 * Application entry point.
 *
 * Ensures required runtime directories exist, starts the HTTP server, and
 * wires up graceful shutdown and last-resort error handlers.
 */
async function bootstrap(): Promise<void> {
  // Make sure the temp directory exists before any request is served.
  await fs.ensureDir(config.tempDirectory);

  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info(`Social Media Downloader API listening on port ${config.port}`);
    logger.info(`Health check available at http://localhost:${config.port}/health`);
  });

  /**
   * Gracefully shut the server down on termination signals.
   */
  const shutdown = (signal: string): void => {
    logger.warn(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      logger.info('HTTP server closed. Exiting.');
      process.exit(0);
    });

    // Force-exit if connections do not drain in time.
    setTimeout(() => {
      logger.error('Forced shutdown after timeout.');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', reason);
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    process.exit(1);
  });
}

bootstrap().catch((error) => {
  logger.error('Failed to start server', error);
  process.exit(1);
});
