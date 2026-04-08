process.env.SPOTIFY_CLIENT_ID = 'test-client-id';
process.env.SPOTIFY_CLIENT_SECRET = 'test-secret';
process.env.REDIRECT_URI = 'http://localhost/callback';
process.env.APP_CODE = 'secret123';
process.env.APP_URL = 'http://localhost';

import request from 'supertest';
import { app, server } from '../index';

afterAll(() => server.close());

describe('GET /verify', () => {
  it('returns ok:true for the correct code', async () => {
    const res = await request(app).get('/verify?code=secret123');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns ok:false for a wrong code', async () => {
    const res = await request(app).get('/verify?code=wrongcode');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: false });
  });

  it('returns ok:false when no code is given', async () => {
    const res = await request(app).get('/verify');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: false });
  });
});

describe('GET /rooms/single', () => {
  it('returns null when no rooms exist', async () => {
    const res = await request(app).get('/rooms/single');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ roomId: null });
  });
});

describe('GET /auth/spotify/url', () => {
  it('returns 404 for an unknown room', async () => {
    const res = await request(app).get('/auth/spotify/url?roomId=XXXXX');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Room not found');
  });
});

describe('GET /auth/spotify/callback', () => {
  it('returns 400 when code or state is missing', async () => {
    const res = await request(app).get('/auth/spotify/callback');
    expect(res.status).toBe(400);
  });
});
