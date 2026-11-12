import fs from 'fs';
import path from 'path';
import express, { Express } from 'express';

// In the Docker image the compiled server lives in /app/dist and the client build in /app/public
export const CLIENT_BUILD_DIR = path.join(__dirname, '..', 'public');

/**
 * Serves the built client from the same origin as the API, so one container and
 * one reverse-proxy rule suffice. Must be registered after the API routes so a
 * stray file in the build can never shadow them.
 */
export function serveClient(
  app: Express,
  clientDir: string,
  { required }: { required: boolean }
): void {
  const indexFile = path.join(clientDir, 'index.html');
  if (!fs.existsSync(indexFile)) {
    if (required) {
      throw new Error(
        `[Config] Client build not found: ${indexFile} is missing`
      );
    }
    // In dev, Vite serves the client and proxies API calls here
    return;
  }
  app.use(express.static(clientDir));
}
