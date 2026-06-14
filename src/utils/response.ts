import { Response } from 'express';
import { SuccessResponse } from '../types/api.types';

/**
 * Helpers that enforce a single, consistent response shape across the API.
 */

/**
 * Send a standardized success response.
 *
 * @param res         Express response object.
 * @param data        Payload to return under the `data` key.
 * @param message     Human-readable message.
 * @param statusCode  HTTP status code (defaults to 200).
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  message = 'Success',
  statusCode = 200
): Response<SuccessResponse<T>> {
  const body: SuccessResponse<T> = {
    success: true,
    message,
    data,
  };
  return res.status(statusCode).json(body);
}
