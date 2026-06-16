import { earliestYearFromRecordings } from './gameLogic';
import type {
  Card,
  Room,
  MusicBrainzRecording,
  MusicBrainzReleaseGroupSearchResult,
} from './types';
import { log } from './log';

export const ENRICH_TIMEOUT_MS = 5000;
const MAX_YEAR_CACHE_SIZE = 500;
export const yearCache = new Map<string, number | null>();

const MB_HEADERS = {
  'User-Agent': 'MusicQuiz/1.0 (+https://github.com/music-quiz-party-game)',
};

// Strip common suffixes that confuse MusicBrainz text search
function normalizeTitle(title: string): string {
  return title
    .replace(/\s*[-–]\s*([\d]{4}\s+)?remaster(ed)?(\s+version)?/gi, '')
    .replace(/\s*\(([\d]{4}\s+)?remaster(ed)?(\s+version)?\)/gi, '')
    .replace(/\s*\(radio edit\)/gi, '')
    .replace(/\s*[-–]\s*radio edit/gi, '')
    .replace(/\s*\(single version\)/gi, '')
    .replace(/\s*[-–]\s*single version/gi, '')
    .replace(/\s*\(album version\)/gi, '')
    .replace(/\s*\(feat\..*?\)/gi, '')
    .replace(/\s*ft\..*$/gi, '')
    .trim();
}

export async function getMusicBrainzYear(
  title: string,
  artist: string
): Promise<{ year: number; via: string } | null> {
  const primaryArtist = artist.split(',')[0].trim();
  const normalizedTitle = normalizeTitle(title);

  for (const [queryTitle, threshold, label] of [
    [normalizedTitle, 90, 'normalized'],
    [title, 90, 'original'],
    [normalizedTitle, 75, 'normalized/fallback'],
  ] as [string, number, string][]) {
    try {
      const query = `recording:"${queryTitle.replace(/"/g, '')}" AND artist:"${primaryArtist.replace(/"/g, '')}"`;
      log(`[MusicBrainz] Query (${label}, score≥${threshold}): ${query}`);
      const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=10&inc=release-groups+releases`;
      const res = await fetch(url, { headers: MB_HEADERS });
      if (!res.ok) throw new Error(`MusicBrainz error: ${res.status}`);
      const data = (await res.json()) as {
        recordings?: MusicBrainzRecording[];
      };
      const qualified = (data.recordings || []).filter(
        (r) => r.score >= threshold
      );
      log(
        `[MusicBrainz] ${data.recordings?.length ?? 0} recordings, ${qualified.length} with score ≥ ${threshold}`
      );
      const year = earliestYearFromRecordings(qualified);
      if (year)
        return {
          year,
          via: `search "${queryTitle}" / "${primaryArtist}" (${label})`,
        };
    } catch (err) {
      log(`[MusicBrainz] Request failed (${label}) for "${queryTitle}":`, err);
    }
    // Only try fallback queries if title changed or threshold changed
    if (queryTitle === normalizedTitle && normalizedTitle === title) break;
  }
  return null;
}

export async function getMusicBrainzYearFromReleaseGroups(
  title: string,
  artist: string
): Promise<{ year: number; via: string } | null> {
  const primaryArtist = artist.split(',')[0].trim();
  const normalizedTitle = normalizeTitle(title);

  for (const [queryTitle, threshold, label] of [
    [normalizedTitle, 90, 'normalized'],
    [title, 90, 'original'],
    [normalizedTitle, 75, 'normalized/fallback'],
  ] as [string, number, string][]) {
    try {
      const query = `releasegroup:"${queryTitle.replace(/"/g, '')}" AND artist:"${primaryArtist.replace(/"/g, '')}"`;
      log(`[MusicBrainz/RG] Query (${label}, score≥${threshold}): ${query}`);
      const url = `https://musicbrainz.org/ws/2/release-group?query=${encodeURIComponent(query)}&fmt=json&limit=10`;
      const res = await fetch(url, { headers: MB_HEADERS });
      if (!res.ok) throw new Error(`MusicBrainz RG error: ${res.status}`);
      const data = (await res.json()) as {
        'release-groups'?: MusicBrainzReleaseGroupSearchResult[];
      };
      const qualified = (data['release-groups'] || []).filter(
        (rg) => rg.score >= threshold
      );
      log(
        `[MusicBrainz/RG] ${data['release-groups']?.length ?? 0} results, ${qualified.length} with score ≥ ${threshold}`
      );
      let earliest: number | null = null;
      for (const rg of qualified) {
        const y = rg['first-release-date']
          ? parseInt(rg['first-release-date'])
          : NaN;
        if (!isNaN(y) && y > 1000 && (!earliest || y < earliest)) earliest = y;
      }
      if (earliest)
        return {
          year: earliest,
          via: `release-group "${queryTitle}" / "${primaryArtist}" (${label})`,
        };
    } catch (err) {
      log(
        `[MusicBrainz/RG] Request failed (${label}) for "${queryTitle}":`,
        err
      );
    }
    if (queryTitle === normalizedTitle && normalizedTitle === title) break;
  }
  return null;
}

type SpotifyTrack = {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album: {
    release_date?: string;
    images?: Array<{ url: string }>;
  };
};

// Spotify's Feb/Mar 2026 migration replaced GET /playlists/{id}/tracks with
// /items and renamed the per-entry field from `track` to `item`; accept either.
type PlaylistItem = { item?: SpotifyTrack | null; track?: SpotifyTrack | null };

function trackOf(entry: PlaylistItem): SpotifyTrack | null {
  return entry.item ?? entry.track ?? null;
}

export async function getPlaylistTracks(
  playlistId: string,
  token: string
): Promise<Card[]> {
  let tracks: Card[] = [];
  let url: string | null =
    `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=100`;
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Spotify playlist error: ${res.status}`);
    const data = (await res.json()) as {
      items: PlaylistItem[];
      next: string | null;
    };
    tracks = tracks.concat(
      data.items
        .map(trackOf)
        .filter((t): t is SpotifyTrack => t !== null && !!t.album?.release_date)
        .map(
          (t): Card => ({
            trackId: t.id,
            title: t.name,
            artist: t.artists.map((a) => a.name).join(', '),
            year: parseInt(t.album.release_date!.substring(0, 4)),
            albumArt: t.album.images?.[1]?.url || null,
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
    const [recordingResult, rgResult] = await Promise.all([
      getMusicBrainzYear(track.title, track.artist),
      getMusicBrainzYearFromReleaseGroups(track.title, track.artist),
    ]);
    const years = [recordingResult?.year, rgResult?.year].filter(
      (y): y is number => y !== undefined && y !== null
    );
    mbYear = years.length > 0 ? Math.min(...years) : null;
    const via = [recordingResult?.via, rgResult?.via]
      .filter(Boolean)
      .join(' + ');
    if (yearCache.size >= MAX_YEAR_CACHE_SIZE) {
      const firstKey = yearCache.keys().next().value;
      if (firstKey !== undefined) yearCache.delete(firstKey);
    }
    yearCache.set(track.trackId, mbYear);
    const spotifyYear = track.year;
    if (mbYear) {
      log(
        `[Year] "${track.title}" – Spotify: ${spotifyYear}, MusicBrainz: ${mbYear} (via ${via}) → ${Math.min(spotifyYear, mbYear)}`
      );
    } else {
      log(
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
