import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSpotifyPlayer } from '../hooks/useSpotifyPlayer';
import type { PublicCard } from '../types';

type Listener = (arg: unknown) => void;

const DEVICE_ID = 'device-1';
const card = { trackId: 'track-1' } as PublicCard;
const calls: string[] = [];
let listeners: Record<string, Listener>;

class FakePlayer {
  constructor() {
    listeners = {};
  }
  connect = vi.fn(() => Promise.resolve(true));
  disconnect = vi.fn();
  pause = vi.fn(() => Promise.resolve());
  activateElement = vi.fn(() => {
    calls.push('activateElement');
    return Promise.resolve();
  });
  addListener(event: string, cb: Listener) {
    listeners[event] = cb;
  }
}

beforeEach(() => {
  calls.length = 0;
  window.Spotify = { Player: FakePlayer } as unknown as typeof Spotify;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      calls.push(`fetch ${url}`);
      return Promise.resolve(new Response(null, { status: 204 }));
    })
  );
});

afterEach(() => vi.unstubAllGlobals());

async function readyPlayer() {
  const hook = renderHook(() =>
    useSpotifyPlayer(true, 'token', card, 'playing')
  );
  await act(async () => {
    await listeners.ready({ device_id: DEVICE_ID });
  });
  await waitFor(() => expect(hook.result.current.deviceId).toBe(DEVICE_ID));
  return hook;
}

describe('useSpotifyPlayer', () => {
  it('activates the audio element in the click, before requesting playback', async () => {
    const { result } = await readyPlayer();
    calls.length = 0;

    await act(() => result.current.togglePlay());

    expect(calls[0]).toBe('activateElement');
    expect(calls[1]).toContain('/v1/me/player/play?device_id=device-1');
  });

  it('tells the host to press Play when the browser blocks autoplay', async () => {
    const { result } = await readyPlayer();

    act(() => listeners.autoplay_failed(undefined));

    expect(result.current.sdkError).toMatch(/blocked playback/);
  });
});
