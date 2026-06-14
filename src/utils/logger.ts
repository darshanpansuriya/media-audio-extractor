/**
 * Minimal, dependency-free structured logger.
 *
 * Using a tiny wrapper keeps logging consistent across the codebase and
 * makes it trivial to swap in a richer logger (pino, winston) later without
 * touching call sites.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function timestamp(): string {
  return new Date().toISOString();
}

function format(level: LogLevel, message: string, meta?: unknown): string {
  const base = `[${timestamp()}] [${level.toUpperCase()}] ${message}`;
  if (meta === undefined) {
    return base;
  }
  if (meta instanceof Error) {
    return `${base} ${meta.stack ?? meta.message}`;
  }
  try {
    return `${base} ${JSON.stringify(meta)}`;
  } catch {
    return `${base} ${String(meta)}`;
  }
}

export const logger = {
  info(message: string, meta?: unknown): void {
    console.log(format('info', message, meta));
  },
  warn(message: string, meta?: unknown): void {
    console.warn(format('warn', message, meta));
  },
  error(message: string, meta?: unknown): void {
    console.error(format('error', message, meta));
  },
  debug(message: string, meta?: unknown): void {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(format('debug', message, meta));
    }
  },
};
