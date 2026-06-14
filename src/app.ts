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
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan('combined'));

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
