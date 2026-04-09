process.env.SPOTIFY_CLIENT_ID = 'test-client-id';
process.env.SPOTIFY_CLIENT_SECRET = 'test-secret';
process.env.REDIRECT_URI = 'http://localhost/callback';
process.env.APP_CODE = 'secret123';
process.env.APP_URL = 'http://localhost';

import { io as ioc } from 'socket.io-client';
import type { Socket as ClientSocket } from 'socket.io-client';
import { server } from '../index';
import type { GameState, RoomSettings } from '../types';

jest.setTimeout(20000);

// ─── Setup ────────────────────────────────────────────────────────────────────

let port: number;

beforeAll((done) => {
  server.listen(0, () => {
    port = (server.address() as { port: number }).port;
    done();
  });
});

afterAll(
  () => new Promise<void>((resolve) => server.close(() => resolve())),
  20000
);

function connect(code = 'secret123'): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const sock = ioc(`http://localhost:${port}`, {
      auth: { code },
      transports: ['websocket'],
      reconnection: false,
    });
    sock.on('connect', () => resolve(sock));
    sock.on('connect_error', reject);
  });
}

function nextEvent<T>(sock: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => sock.once(event, resolve));
}

/** Connect as host, create a room, and consume the initial gameState broadcast. */
async function createRoomAsHost(
  name = 'Host'
): Promise<{ sock: ClientSocket; roomId: string; playerId: string }> {
  const sock = await connect();
  const firstState = nextEvent<GameState>(sock, 'gameState');
  const res = await new Promise<{ roomId: string; playerId: string }>(
    (resolve) => {
      sock.emit(
        'createRoom',
        { playerName: name },
        (r: { roomId: string; playerId: string } | { error: string }) => {
          if ('error' in r) throw new Error(r.error);
          resolve(r);
        }
      );
    }
  );
  await firstState;
  return { sock, ...res };
}

// ─── Auth ────────────────────────────────────────────────────────────────────

describe('Socket — auth', () => {
  it('rejects connections with wrong code', (done) => {
    const sock = ioc(`http://localhost:${port}`, {
      auth: { code: 'wrong' },
      transports: ['websocket'],
      reconnection: false,
    });
    sock.on('connect_error', () => {
      sock.disconnect();
      done();
    });
    sock.on('connect', () => {
      sock.disconnect();
      done(new Error('should not have connected'));
    });
  });

  it('accepts connections with correct code', async () => {
    const sock = await connect();
    expect(sock.connected).toBe(true);
    sock.disconnect();
  });
});

// ─── createRoom ──────────────────────────────────────────────────────────────

describe('Socket — createRoom', () => {
  it('returns roomId and playerId', async () => {
    const { sock, roomId, playerId } = await createRoomAsHost();
    expect(roomId).toHaveLength(5);
    expect(typeof playerId).toBe('string');
    sock.disconnect();
  });

  it('broadcasts lobby gameState with one player', async () => {
    const sock = await connect();
    const statePromise = nextEvent<GameState>(sock, 'gameState');
    sock.emit('createRoom', { playerName: 'Alice' }, () => {});
    const state = await statePromise;
    expect(state.phase).toBe('lobby');
    expect(Object.values(state.players)).toHaveLength(1);
    sock.disconnect();
  });

  it('rejects empty player name', async () => {
    const sock = await connect();
    const res = await new Promise<{ error: string }>((resolve) => {
      sock.emit('createRoom', { playerName: '' }, resolve);
    });
    expect(res).toHaveProperty('error');
    sock.disconnect();
  });

  it('rejects whitespace-only name', async () => {
    const sock = await connect();
    const res = await new Promise<{ error: string }>((resolve) => {
      sock.emit('createRoom', { playerName: '   ' }, resolve);
    });
    expect(res).toHaveProperty('error');
    sock.disconnect();
  });
});

// ─── joinRoom ────────────────────────────────────────────────────────────────

describe('Socket — joinRoom', () => {
  it('allows joining an existing room', async () => {
    const { sock: host, roomId } = await createRoomAsHost();
    const guest = await connect();
    const res = await new Promise<{ roomId: string; playerId: string }>(
      (resolve) => {
        guest.emit('joinRoom', { roomId, playerName: 'Guest' }, resolve);
      }
    );
    expect(res.roomId).toBe(roomId);
    host.disconnect();
    guest.disconnect();
  });

  it('host sees two players in gameState after join', async () => {
    const { sock: host, roomId } = await createRoomAsHost();
    const guest = await connect();
    // Register both listeners before emitting so no events are missed
    const hostUpdated = nextEvent<GameState>(host, 'gameState');
    const guestJoined = nextEvent<GameState>(guest, 'gameState');
    guest.emit('joinRoom', { roomId, playerName: 'Guest' }, () => {});
    const [state] = await Promise.all([hostUpdated, guestJoined]);
    expect(Object.keys(state.players)).toHaveLength(2);
    host.disconnect();
    guest.disconnect();
  });

  it('rejects joining a non-existent room', async () => {
    const sock = await connect();
    const res = await new Promise<{ error: string }>((resolve) => {
      sock.emit('joinRoom', { roomId: 'XXXXX', playerName: 'Guest' }, resolve);
    });
    expect(res).toHaveProperty('error');
    sock.disconnect();
  });
});

// ─── updateSettings ──────────────────────────────────────────────────────────

describe('Socket — updateSettings', () => {
  it('updates revealTimeoutSeconds and broadcasts', async () => {
    const { sock, roomId } = await createRoomAsHost();
    const updated = nextEvent<GameState>(sock, 'gameState');
    const settings: RoomSettings = {
      revealTimeoutSeconds: 25,
      autoAdvanceSeconds: null,
      maxCards: 10,
    };
    sock.emit('updateSettings', { roomId, settings });
    const state = await updated;
    expect(state.settings.revealTimeoutSeconds).toBe(25);
    sock.disconnect();
  });

  it('clamps revealTimeoutSeconds to max 60', async () => {
    const { sock, roomId } = await createRoomAsHost();
    const updated = nextEvent<GameState>(sock, 'gameState');
    sock.emit('updateSettings', {
      roomId,
      settings: {
        revealTimeoutSeconds: 999,
        autoAdvanceSeconds: null,
        maxCards: 10,
      },
    });
    const state = await updated;
    expect(state.settings.revealTimeoutSeconds).toBe(60);
    sock.disconnect();
  });

  it('clamps negative revealTimeoutSeconds to min 1', async () => {
    const { sock, roomId } = await createRoomAsHost();
    const updated = nextEvent<GameState>(sock, 'gameState');
    sock.emit('updateSettings', {
      roomId,
      settings: {
        revealTimeoutSeconds: -5,
        autoAdvanceSeconds: null,
        maxCards: 10,
      },
    });
    const state = await updated;
    expect(state.settings.revealTimeoutSeconds).toBe(1);
    sock.disconnect();
  });

  it('enables autoAdvanceSeconds', async () => {
    const { sock, roomId } = await createRoomAsHost();
    const updated = nextEvent<GameState>(sock, 'gameState');
    sock.emit('updateSettings', {
      roomId,
      settings: {
        revealTimeoutSeconds: 10,
        autoAdvanceSeconds: 7,
        maxCards: 10,
      },
    });
    const state = await updated;
    expect(state.settings.autoAdvanceSeconds).toBe(7);
    sock.disconnect();
  });

  it('allows maxCards: null (unlimited)', async () => {
    const { sock, roomId } = await createRoomAsHost();
    const updated = nextEvent<GameState>(sock, 'gameState');
    sock.emit('updateSettings', {
      roomId,
      settings: {
        revealTimeoutSeconds: 10,
        autoAdvanceSeconds: null,
        maxCards: null,
      },
    });
    const state = await updated;
    expect(state.settings.maxCards).toBeNull();
    sock.disconnect();
  });

  it('ignores updateSettings from non-host', async () => {
    const { sock: host, roomId } = await createRoomAsHost();
    const guest = await connect();

    // Register both gameState listeners before emitting join
    const hostJoined = nextEvent<GameState>(host, 'gameState');
    const guestJoined = nextEvent<GameState>(guest, 'gameState');
    guest.emit('joinRoom', { roomId, playerName: 'Guest' }, () => {});
    await Promise.all([hostJoined, guestJoined]);

    // Now both join events are consumed — any further gameState on host
    // would be from the guest's settings update (which should be ignored)
    let received = false;
    host.once('gameState', () => {
      received = true;
    });
    guest.emit('updateSettings', {
      roomId,
      settings: {
        revealTimeoutSeconds: 60,
        autoAdvanceSeconds: null,
        maxCards: null,
      },
    });

    await new Promise((r) => setTimeout(r, 100));
    expect(received).toBe(false);

    host.disconnect();
    guest.disconnect();
  });
});
