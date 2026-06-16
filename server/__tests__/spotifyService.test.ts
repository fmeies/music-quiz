import { describe, it, expect, vi, afterEach } from 'vitest';
import { getPlaylistTracks } from '../spotifyService';

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

const sampleTrack = {
  id: 't1',
  name: 'Song One',
  artists: [{ name: 'Artist A' }, { name: 'Artist B' }],
  album: {
    release_date: '1991-05-01',
    images: [{ url: 'big' }, { url: 'medium' }],
  },
};

afterEach(() => vi.restoreAllMocks());

describe('getPlaylistTracks', () => {
  it('requests the /items endpoint with a bearer token', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse({ items: [{ item: sampleTrack }], next: null })
      );

    await getPlaylistTracks('PL123', 'user-token');

    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(
      'https://api.spotify.com/v1/playlists/PL123/items?limit=100'
    );
    expect((init as { headers: Record<string, string> }).headers).toEqual({
      Authorization: 'Bearer user-token',
    });
  });

  it('maps a new-style `item` entry to a Card', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ items: [{ item: sampleTrack }], next: null })
    );

    const cards = await getPlaylistTracks('PL', 'tok');

    expect(cards).toEqual([
      {
        trackId: 't1',
        title: 'Song One',
        artist: 'Artist A, Artist B',
        year: 1991,
        albumArt: 'medium',
      },
    ]);
  });

  it('still accepts the legacy `track` field', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ items: [{ track: sampleTrack }], next: null })
    );

    const cards = await getPlaylistTracks('PL', 'tok');

    expect(cards).toHaveLength(1);
    expect(cards[0].trackId).toBe('t1');
  });

  it('skips entries without a track or release date', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        items: [
          { item: null },
          { item: { ...sampleTrack, album: {} } },
          { item: sampleTrack },
        ],
        next: null,
      })
    );

    const cards = await getPlaylistTracks('PL', 'tok');

    expect(cards).toHaveLength(1);
  });

  it('follows pagination via next', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          items: [{ item: sampleTrack }],
          next: 'https://api.spotify.com/v1/playlists/PL/items?offset=100',
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [{ item: { ...sampleTrack, id: 't2' } }],
          next: null,
        })
      );

    const cards = await getPlaylistTracks('PL', 'tok');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(cards.map((c) => c.trackId)).toEqual(['t1', 't2']);
  });

  it('throws with the status code on a failed response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    } as Response);

    await expect(getPlaylistTracks('PL', 'tok')).rejects.toThrow(
      'Spotify playlist error: 403'
    );
  });
});
