import { earliestYearFromRecordings } from './gameLogic';
import type { Card, Room, MusicBrainzRecording } from './types';

export const ENRICH_TIMEOUT_MS = 5000;
const MAX_YEAR_CACHE_SIZE = 500;
export const yearCache = new Map<string, number | null>();

export async function getSpotifyToken(): Promise<string> {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = process.env;
  const creds = Buffer.from(
    `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Spotify token error: ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function getMusicBrainzYear(
  title: string,
  artist: string
): Promise<{ year: number; via: string } | null> {
  try {
    const primaryArtist = artist.split(',')[0].trim();
    const query = `recording:"${title.replace(/"/g, '')}" AND artist:"${primaryArtist.replace(/"/g, '')}"`;
    const res = await fetch(
      `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=10`,
      {
        headers: {
          'User-Agent':
            'MusicQuiz/1.0 (+https://github.com/music-quiz-party-game)',
        },
      }
    );
    if (!res.ok) throw new Error(`MusicBrainz error: ${res.status}`);
    const data = (await res.json()) as { recordings?: MusicBrainzRecording[] };
    const year = earliestYearFromRecordings(
      (data.recordings || []).filter((r) => r.score >= 90)
    );
    if (year) return { year, via: `search "${title}" / "${primaryArtist}"` };
  } catch {
    // search failed
  }
  return null;
}

export async function getPlaylistTracks(
  playlistId: string,
  token: string
): Promise<Card[]> {
  let tracks: Card[] = [];
  let url: string | null =
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Spotify playlist error: ${res.status}`);
    const data = (await res.json()) as {
      items: {
        track: {
          id: string;
          name: string;
          artists: Array<{ name: string }>;
          album: {
            release_date?: string;
            images?: Array<{ url: string }>;
          };
        } | null;
      }[];
      next: string | null;
    };
    tracks = tracks.concat(
      data.items
        .filter((i) => i.track && i.track.album?.release_date)
        .map(
          (i): Card => ({
            trackId: i.track!.id,
            title: i.track!.name,
            artist: i.track!.artists.map((a) => a.name).join(', '),
            year: parseInt(i.track!.album.release_date!.substring(0, 4)),
            albumArt: i.track!.album.images?.[1]?.url || null,
          })
        )
    );
    url = data.next;
  }
  return tracks;
}

export async function enrichCurrentCardYear(
  room: Room,
  track: Card
): Promise<void> {
  let mbYear: number | null;
  if (yearCache.has(track.trackId)) {
    mbYear = yearCache.get(track.trackId)!;
  } else {
    const result = await getMusicBrainzYear(track.title, track.artist);
    mbYear = result ? result.year : null;
    if (yearCache.size >= MAX_YEAR_CACHE_SIZE) {
      const firstKey = yearCache.keys().next().value;
      if (firstKey !== undefined) yearCache.delete(firstKey);
    }
    yearCache.set(track.trackId, mbYear);
    const spotifyYear = track.year;
    if (mbYear) {
      console.log(
        `[Year] "${track.title}" – Spotify: ${spotifyYear}, MusicBrainz: ${mbYear} (via ${result!.via}) → ${Math.min(spotifyYear, mbYear)}`
      );
    } else {
      console.log(
        `[Year] "${track.title}" – Spotify: ${spotifyYear} (MusicBrainz: kein Treffer)`
      );
    }
  }
  if (mbYear && room.currentCard?.trackId === track.trackId) {
    const finalYear = Math.min(track.year, mbYear);
    room.currentCard.year = finalYear;
    const playlistTrack = room.playlist?.tracks.find(
      (t) => t.trackId === track.trackId
    );
    if (playlistTrack) playlistTrack.year = finalYear;
  }
}
