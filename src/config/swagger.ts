import { config } from './env';

/**
 * OpenAPI 3.0 specification for the Social Media Downloader API.
 *
 * Defined as a plain object (rather than generated from JSDoc) so it stays
 * fully typed and dependency-light. Served via swagger-ui-express at `/docs`
 * and as raw JSON at `/docs.json`.
 */
export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Social Media Downloader API',
    version: '1.0.0',
    description:
      'Accepts a social media video URL, downloads the media temporarily, ' +
      'uploads it to Cloudinary, removes the local file, and returns a public ' +
      'Cloudinary URL.',
    license: { name: 'MIT' },
  },
  servers: [
    {
      url: `http://localhost:${config.port}`,
      description: 'Local development server',
    },
  ],
  tags: [
    { name: 'System', description: 'Service health and status' },
    { name: 'Download', description: 'Media download and upload operations' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        description: 'Returns 200 while the server is running.',
        responses: {
          '200': {
            description: 'Server is running',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' },
                example: {
                  success: true,
                  message: 'Server is running',
                  data: { status: 'ok' },
                },
              },
            },
          },
        },
      },
    },
    '/api/video': {
      post: {
        tags: ['Download'],
        summary: 'Download a video and upload it to Cloudinary',
        description:
          'Resolves the media via the extractor, downloads it to a temp file, ' +
          'uploads it to Cloudinary, deletes the temp file, and returns the ' +
          'public Cloudinary URL.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/DownloadRequest' },
              example: { url: 'https://example.com/video.mp4' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Video uploaded successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DownloadResponse' },
                example: {
                  success: true,
                  message: 'Video uploaded successfully',
                  data: {
                    sourceUrl: 'https://example.com/video.mp4',
                    cloudinaryUrl:
                      'https://res.cloudinary.com/demo/video/upload/v1700000000/social-media-downloads/abc123.mp4',
                    publicId: 'social-media-downloads/abc123',
                  },
                },
              },
            },
          },
          '400': {
            description: 'Validation error (missing/invalid URL or empty body)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  success: false,
                  message: 'The "url" field is required',
                  error: { name: 'ApiError', statusCode: 400 },
                },
              },
            },
          },
          '413': {
            description: 'Media exceeds the maximum allowed size',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  success: false,
                  message: 'Media exceeds the maximum allowed size of 500 MB',
                  error: { name: 'ApiError', statusCode: 413 },
                },
              },
            },
          },
          '501': {
            description: 'No extraction provider configured for this URL',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '502': {
            description: 'Failed to download from source or upload to Cloudinary',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '500': {
            description: 'Unexpected internal error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/audio': {
      post: {
        tags: ['Download'],
        summary: 'Extract audio and upload it to Cloudinary',
        description:
          'Resolves the best audio-only stream via the extractor, downloads it ' +
          'to a temp file, uploads it to Cloudinary, deletes the temp file, and ' +
          'returns delivery links. `format` is optional and defaults to `opus`; ' +
          'pass `mp3` to switch. The response also includes a `formats` map with ' +
          'a ready link for every supported format.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AudioRequest' },
              example: { url: 'https://example.com/video', format: 'opus' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Audio extracted successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AudioResponse' },
                example: {
                  success: true,
                  message: 'Audio extracted successfully',
                  data: {
                    sourceUrl: 'https://example.com/video',
                    format: 'opus',
                    audioUrl:
                      'https://res.cloudinary.com/demo/video/upload/social-media-downloads/audio/abc123.opus',
                    publicId: 'social-media-downloads/audio/abc123',
                    formats: {
                      opus: 'https://res.cloudinary.com/demo/video/upload/social-media-downloads/audio/abc123.opus',
                      mp3: 'https://res.cloudinary.com/demo/video/upload/social-media-downloads/audio/abc123.mp3',
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Validation error (invalid URL, body, or format)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  success: false,
                  message: 'The "format" field must be one of [opus, mp3]',
                  error: { name: 'ApiError', statusCode: 400 },
                },
              },
            },
          },
          '413': {
            description: 'Media exceeds the maximum allowed size',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '502': {
            description: 'Failed to extract/download from source or upload to Cloudinary',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '500': {
            description: 'Unexpected internal error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      DownloadRequest: {
        type: 'object',
        required: ['url'],
        properties: {
          url: {
            type: 'string',
            format: 'uri',
            description: 'A valid http(s) social media video URL.',
            example: 'https://example.com/video.mp4',
          },
        },
      },
      DownloadData: {
        type: 'object',
        properties: {
          sourceUrl: { type: 'string', format: 'uri' },
          cloudinaryUrl: { type: 'string', format: 'uri' },
          publicId: { type: 'string' },
        },
        required: ['sourceUrl', 'cloudinaryUrl', 'publicId'],
      },
      DownloadResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Video uploaded successfully' },
          data: { $ref: '#/components/schemas/DownloadData' },
        },
        required: ['success', 'message', 'data'],
      },
      AudioRequest: {
        type: 'object',
        required: ['url'],
        properties: {
          url: {
            type: 'string',
            format: 'uri',
            description: 'A valid http(s) media URL.',
            example: 'https://example.com/video',
          },
          format: {
            type: 'string',
            enum: ['opus', 'mp3'],
            default: 'opus',
            description: 'Delivery format. Optional; defaults to `opus`.',
            example: 'opus',
          },
        },
      },
      AudioData: {
        type: 'object',
        properties: {
          sourceUrl: { type: 'string', format: 'uri' },
          format: { type: 'string', enum: ['opus', 'mp3'] },
          audioUrl: { type: 'string', format: 'uri' },
          publicId: { type: 'string' },
          formats: {
            type: 'object',
            properties: {
              opus: { type: 'string', format: 'uri' },
              mp3: { type: 'string', format: 'uri' },
            },
            required: ['opus', 'mp3'],
          },
        },
        required: ['sourceUrl', 'format', 'audioUrl', 'publicId', 'formats'],
      },
      AudioResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Audio extracted successfully' },
          data: { $ref: '#/components/schemas/AudioData' },
        },
        required: ['success', 'message', 'data'],
      },
      HealthResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Server is running' },
          data: {
            type: 'object',
            properties: { status: { type: 'string', example: 'ok' } },
          },
        },
        required: ['success', 'message', 'data'],
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'The "url" field is required' },
          error: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'ApiError' },
              statusCode: { type: 'integer', example: 400 },
              details: {
                description: 'Optional extra context about the error.',
                nullable: true,
              },
            },
            required: ['name', 'statusCode'],
          },
        },
        required: ['success', 'message', 'error'],
      },
    },
  },
} as const;
