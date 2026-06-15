# Social Media Downloader API

A production-ready **Node.js + Express + TypeScript** REST API that accepts a
social media video URL, downloads the media temporarily, uploads it to
**Cloudinary**, cleans up the local file, and returns a public, downloadable
Cloudinary URL.

The media extraction logic is isolated behind an interface
(`IExtractorService`) so a real extraction provider (e.g. a `yt-dlp` wrapper or
a third-party API) can be plugged in later **without changing any business
logic**.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Architecture](#architecture)
- [Folder Structure](#folder-structure)
- [Installation](#installation)
- [Environment Setup](#environment-setup)
- [Cloudinary Setup](#cloudinary-setup)
- [Running Locally](#running-locally)
- [API Reference](#api-reference)
  - [Health Check](#health-check)
  - [Download Video](#download-video)
- [Example Requests & Responses](#example-requests--responses)
- [Error Responses](#error-responses)
- [Plugging in a Real Extractor](#plugging-in-a-real-extractor)
- [Deployment (Ubuntu VPS + PM2 + Nginx)](#deployment-ubuntu-vps--pm2--nginx)

---

## Project Overview

The download flow:

```
Client → POST /api/video
        ↓
   Controller (validate input)
        ↓
   DownloadService.process()
        ↓
   ExtractorService.getMediaInfo()   → { directUrl, filename, mimeType }
        ↓
   Download media to ./temp
        ↓
   Upload media to Cloudinary (resource_type: "video")
        ↓
   Delete local temp file (always, even on error)
        ↓
   Return public Cloudinary URL
```

**Highlights**

- Clean architecture: routes → controllers → services, with shared utils/types.
- TypeScript **strict mode** end to end.
- No database, no Redis, no queue, no Docker, no auth — simple and maintainable.
- Centralized error handling with a consistent JSON envelope.
- Guaranteed temp-file cleanup to prevent orphaned files.
- Configurable max file size.

---

## Architecture

| Layer          | Responsibility                                                        |
| -------------- | --------------------------------------------------------------------- |
| `routes/`      | Map HTTP verbs/paths to controllers.                                  |
| `controllers/` | Validate input, call services, format responses. Stay thin.          |
| `services/`    | Business logic: extraction, downloading, Cloudinary upload, cleanup.  |
| `middlewares/` | Centralized error + 404 handling, `ApiError`.                         |
| `config/`      | Environment validation and Cloudinary SDK setup.                      |
| `utils/`       | Response envelope, logger, validators.                                |
| `types/`       | Shared TypeScript contracts (including `IExtractorService`).          |

---

## Folder Structure

```
.
├── package.json
├── tsconfig.json
├── .env.example
├── .eslintrc.json
├── .gitignore
├── README.md
├── temp/                      # transient downloads (auto-created)
└── src/
    ├── app.ts                 # Express app factory
    ├── server.ts              # entry point / bootstrap
    ├── config/
    │   ├── env.ts             # validated environment config
    │   └── cloudinary.ts      # configured Cloudinary SDK
    ├── controllers/
    │   └── download.controller.ts
    ├── routes/
    │   └── download.route.ts
    ├── services/
    │   ├── download.service.ts
    │   ├── extractor.service.ts
    │   └── cloudinary.service.ts
    ├── middlewares/
    │   └── error.middleware.ts
    ├── utils/
    │   ├── response.ts
    │   ├── logger.ts
    │   └── validator.ts
    ├── types/
    │   └── api.types.ts
    └── temp/
        └── .gitkeep
```

---

## Installation

Requires **Node.js 22+** and **ffmpeg**.

> **ffmpeg is required at runtime.** YouTube (and increasingly other sites) no
> longer serve a single file containing both video and audio — yt-dlp downloads
> the streams separately and uses ffmpeg to merge them. Without ffmpeg, those
> downloads fail. Install it:
>
> ```bash
> # Ubuntu/Debian
> sudo apt-get install -y ffmpeg
> # macOS (Homebrew)
> brew install ffmpeg
> ```

```bash
# Clone / enter the project
cd social-media-downloader-api

# Install dependencies
npm install
```

---

## Environment Setup

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

`.env` variables:

| Variable                 | Required | Default  | Description                              |
| ------------------------ | -------- | -------- | ---------------------------------------- |
| `PORT`                   | no       | `3000`   | HTTP port the server listens on.         |
| `CLOUDINARY_CLOUD_NAME`  | **yes**  | —        | Cloudinary cloud name.                   |
| `CLOUDINARY_API_KEY`     | **yes**  | —        | Cloudinary API key.                      |
| `CLOUDINARY_API_SECRET`  | **yes**  | —        | Cloudinary API secret.                   |
| `TEMP_DIRECTORY`         | no       | `./temp` | Directory for transient downloads.       |
| `MAX_FILE_SIZE_MB`       | no       | `500`    | Maximum allowed media size (megabytes).  |
| `YTDLP_COOKIES_FILE`     | no       | —        | Path to a Netscape `cookies.txt`; needed to get past YouTube's bot check on server IPs. |
| `YTDLP_PLAYER_CLIENT`    | no       | —        | Optional yt-dlp `youtube:player_client` override (e.g. `web_safari`). Fallback when cookies aren't used. |

The app validates these at startup and exits with a clear error if a required
value is missing.

---

## Cloudinary Setup

1. Create a free account at <https://cloudinary.com>.
2. Open the [Cloudinary Console](https://console.cloudinary.com).
3. From the **Dashboard**, copy your **Cloud name**, **API Key**, and
   **API Secret**.
4. Paste them into `.env` as shown above.

Uploaded videos are stored under the `social-media-downloads/` folder in your
Cloudinary media library with `resource_type: "video"`.

---

## Running Locally

```bash
# Development (auto-reload via ts-node-dev)
npm run dev

# Production build + run
npm run build
npm start

# Lint
npm run lint
```

Once running, verify with the health check:

```bash
curl http://localhost:3000/health
```

---

## API Reference

Base URL: `http://localhost:3000`

### Health Check

```
GET /health
```

**Response `200 OK`**

```json
{
  "success": true,
  "message": "Server is running",
  "data": { "status": "ok" }
}
```

### Download Video

```
POST /api/video
Content-Type: application/json
```

**Request body**

```json
{
  "url": "https://example.com/video.mp4"
}
```

**Response `200 OK`**

```json
{
  "success": true,
  "message": "Video uploaded successfully",
  "data": {
    "sourceUrl": "https://example.com/video.mp4",
    "cloudinaryUrl": "https://res.cloudinary.com/<cloud>/video/upload/v1700000000/social-media-downloads/abc123.mp4",
    "publicId": "social-media-downloads/abc123"
  }
}
```

---

## Example Requests & Responses

### cURL

```bash
curl -X POST http://localhost:3000/api/video \
  -H "Content-Type: application/json" \
  -d '{ "url": "https://example.com/video.mp4" }'
```

### HTTPie

```bash
http POST :3000/api/video url=https://example.com/video.mp4
```

### JavaScript (fetch)

```js
const res = await fetch('http://localhost:3000/api/video', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'https://example.com/video.mp4' }),
});
const json = await res.json();
console.log(json.data.cloudinaryUrl);
```

---

## Error Responses

All errors share a single envelope:

```json
{
  "success": false,
  "message": "Human-readable description",
  "error": {
    "name": "ApiError",
    "statusCode": 400,
    "details": "optional extra context"
  }
}
```

| Status | When                                                                 |
| ------ | -------------------------------------------------------------------- |
| `400`  | Missing body, missing `url`, non-string `url`, or invalid URL.       |
| `404`  | Unknown route.                                                       |
| `413`  | Media exceeds `MAX_FILE_SIZE_MB`.                                    |
| `501`  | No extraction provider configured for the supplied (non-direct) URL. |
| `502`  | Failed to download from source or upload to Cloudinary.             |
| `500`  | Unexpected internal error.                                          |

**Example — missing URL (`400`)**

```json
{
  "success": false,
  "message": "The \"url\" field is required",
  "error": { "name": "ApiError", "statusCode": 400 }
}
```

---

## Plugging in a Real Extractor

The default `ExtractorService` only resolves URLs that already point directly
at a media file. To support real social platforms, implement the
`IExtractorService` contract and register your implementation:

```ts
// src/services/extractor.service.ts
import { IExtractorService, MediaInfo } from '../types/api.types';

export class MyProviderExtractor implements IExtractorService {
  public async getMediaInfo(url: string): Promise<MediaInfo> {
    // Call your provider / yt-dlp wrapper here and return:
    return {
      directUrl: 'https://cdn.example.com/resolved.mp4',
      filename: 'resolved.mp4',
      mimeType: 'video/mp4',
    };
  }
}

// Swap the exported singleton:
export const extractorService: IExtractorService = new MyProviderExtractor();
```

No other file needs to change — the controller and `DownloadService` depend
only on the interface.

---

## Deployment (Ubuntu VPS + PM2 + Nginx)

### 1. Install Node.js 22, ffmpeg, and PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs ffmpeg
sudo npm install -g pm2

# Verify ffmpeg is on PATH (required to merge video + audio):
ffmpeg -version
```

### 2. Deploy the app

```bash
git clone <your-repo-url> social-downloader
cd social-downloader

npm install
cp .env.example .env   # then edit .env with real values
npm run build
```

### 3. Start with PM2

```bash
pm2 start dist/server.js --name social-downloader
pm2 save
pm2 startup
```

`pm2 startup` prints a command — run it (with sudo) so PM2 relaunches on boot.

Useful PM2 commands:

```bash
pm2 status
pm2 logs social-downloader
pm2 restart social-downloader
```

### 4. Nginx reverse proxy

Create `/etc/nginx/sites-available/social-downloader`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Allow large uploads to pass through to the API.
    client_max_body_size 600M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/social-downloader /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. (Optional) HTTPS with Let's Encrypt

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

Your API is now available at `https://your-domain.com/api/video`.

---

## License

MIT
