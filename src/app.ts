import path from 'path';
import express, { Application, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';

import downloadRoutes from './routes/download.route';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import { sendSuccess } from './utils/response';
import { openApiSpec } from './config/swagger';

/**
 * Build and configure the Express application.
 *
 * Kept separate from server bootstrapping so the app can be imported into
 * tests or alternative runtimes without binding to a port.
 */
export function createApp(): Application {
  const app = express();

  // ---- Security & infrastructure middleware ----
  app.use(
    helmet({
      contentSecurityPolicy: {
        // Drop only the default `upgrade-insecure-requests` directive. It
        // rewrites every http:// asset request to https://, which breaks the
        // front-end when the app is deployed behind a bare server IP:port with
        // no TLS (assets silently fail to load). All other helmet defaults stay.
        // Remove this override once HTTPS terminates in front of the app.
        directives: {
          upgradeInsecureRequests: null,
        },
      },
    })
  );
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan('combined'));

  // ---- Static web UI ----
  // Serves the simple downloader front-end (index.html, styles.css, app.js)
  // at the root. Lives one level up from this file in both src/ (dev) and
  // dist/ (build), so resolve relative to __dirname.
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // ---- API documentation (Swagger UI + raw OpenAPI JSON) ----
  app.get('/docs.json', (_req: Request, res: Response) => {
    res.json(openApiSpec);
  });
  app.use(
    '/docs',
    // Swagger UI ships inline styles/scripts that the default CSP blocks, so
    // relax the policy for this route only — strict headers remain elsewhere.
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          // Same fix as the global helmet config: helmet merges these with its
          // defaults (useDefaults: true), which would otherwise re-add
          // `upgrade-insecure-requests` and break Swagger's assets over plain
          // HTTP. Drop it here too. Remove once HTTPS is in front.
          upgradeInsecureRequests: null,
        },
      },
    }),
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, {
      customSiteTitle: 'Social Media Downloader API Docs',
    })
  );

  // ---- Health check ----
  app.get('/health', (_req: Request, res: Response) => {
    sendSuccess(res, { status: 'ok' }, 'Server is running', 200);
  });

  // ---- Feature routes ----
  app.use('/api', downloadRoutes);

  // ---- 404 + centralized error handling (must be last) ----
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
