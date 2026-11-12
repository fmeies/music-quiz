import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { serveClient } from '../staticClient';

const INDEX_HTML = '<!doctype html><title>Music Quiz</title>';
const ASSET_JS = 'console.log("app");';

let clientDir: string;

beforeAll(() => {
  clientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'music-quiz-client-'));
  fs.writeFileSync(path.join(clientDir, 'index.html'), INDEX_HTML);
  fs.mkdirSync(path.join(clientDir, 'assets'));
  fs.writeFileSync(path.join(clientDir, 'assets', 'app.js'), ASSET_JS);
  // A file named like an API route must not shadow it
  fs.writeFileSync(path.join(clientDir, 'verify'), 'static file');
});

afterAll(() => fs.rmSync(clientDir, { recursive: true, force: true }));

function appWithClient() {
  const app = express();
  app.get('/verify', (_req, res) => res.json({ ok: true }));
  serveClient(app, clientDir, { required: true });
  return app;
}

describe('serveClient', () => {
  it('serves index.html at the root', async () => {
    const res = await request(appWithClient()).get('/');
    expect(res.status).toBe(200);
    expect(res.type).toBe('text/html');
    expect(res.text).toBe(INDEX_HTML);
  });

  it('serves built assets', async () => {
    const res = await request(appWithClient()).get('/assets/app.js');
    expect(res.status).toBe(200);
    expect(res.type).toBe('application/javascript');
    expect(res.text).toBe(ASSET_JS);
  });

  it('does not shadow API routes registered before it', async () => {
    const res = await request(appWithClient()).get('/verify');
    expect(res.body).toEqual({ ok: true });
  });

  it('returns 404 for unknown paths instead of falling back to index.html', async () => {
    const res = await request(appWithClient()).get('/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('throws when the build is required but missing', () => {
    const missingDir = path.join(clientDir, 'missing');
    expect(() =>
      serveClient(express(), missingDir, { required: true })
    ).toThrow(/Client build not found/);
  });

  it('skips silently when the build is optional and missing (dev mode)', async () => {
    const app = express();
    serveClient(app, path.join(clientDir, 'missing'), { required: false });
    const res = await request(app).get('/');
    expect(res.status).toBe(404);
  });
});
