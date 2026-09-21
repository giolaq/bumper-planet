import http from 'node:http';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { createClient } from 'redis';

type Room = { hostHash: string; expires: number };
type Client = { room: string; role: 'host' | 'player'; id: string; name: string; color: number };
type Envelope = { room: string; audience: 'host' | 'players' | 'all'; payload: Record<string, unknown> };
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const validToken = (s: unknown): s is string => typeof s === 'string' && /^[a-zA-Z0-9_-]{24,100}$/.test(s);

export function createRelay(server: http.Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16384 });
  const clients = new Map<WebSocket, Client>();
  const rooms = new Map<string, Room>();
  const distributed = Boolean(process.env.REDIS_URL);
  const unavailable = Boolean(process.env.VERCEL && !distributed);
  const redis = distributed ? createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 5000 } }) : undefined;
  const subscriber = redis?.duplicate();
  redis?.on('error', () => console.error('Redis connection unavailable'));
  subscriber?.on('error', () => console.error('Redis subscription unavailable'));
  const deliver = (e: Envelope) => {
    const data = JSON.stringify(e.payload);
    for (const [socket, c] of clients) if (c.room === e.room && (e.audience === 'all' || (e.audience === 'host' ? c.role === 'host' : c.role === 'player')) && socket.readyState === WebSocket.OPEN) socket.send(data);
  };
  const ready = redis && subscriber ? Promise.all([redis.connect(), subscriber.connect()]).then(async () => {
    await subscriber.subscribe('bumper:v1:events', data => { try { deliver(JSON.parse(data)); } catch { /* malformed external message */ } });
  }) : Promise.resolve();
  // Attach rejection handling immediately, also surface it to each connection below.
  ready.catch(() => console.error('Multiplayer storage initialization failed'));
  const publish = async (e: Envelope) => { if (redis) await redis.publish('bumper:v1:events', JSON.stringify(e)); else deliver(e); };
  const getRoom = async (room: string) => {
    if (redis) { const value = await redis.get(`bumper:room:${room}`); return value ? JSON.parse(value) as Room : undefined; }
    const value = rooms.get(room); if (value && value.expires < Date.now()) { rooms.delete(room); return undefined; } return value;
  };
  server.on('upgrade', (req, socket, head) => {
    if (req.url?.split('?')[0] !== '/api/ws') return;
    const origin = req.headers.origin;
    if (origin) { try { if (new URL(origin).host !== req.headers.host) { socket.destroy(); return; } } catch { socket.destroy(); return; } }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  const send = (ws: WebSocket, data: unknown) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
  wss.on('connection', ws => {
    let count = 0, windowStart = Date.now(), processing = false;
    const handshakeTimeout = setTimeout(() => { if (!clients.has(ws)) ws.close(1008, 'Join a room first'); }, 15000);
    ws.on('error', () => {});
    ws.on('message', async raw => {
      try {
        if (Date.now() - windowStart > 1000) { count = 0; windowStart = Date.now(); }
        if (++count > 90) { ws.close(1008, 'Too many messages'); return; }
        const m = JSON.parse(raw.toString());
        if (unavailable) { send(ws, { type: 'error', message: 'Online rooms need REDIS_URL configured on Vercel. You can still play a local demo.' }); return; }
        await ready;
        let c = clients.get(ws);
        if (!c) {
          if (processing) return; processing = true;
          try {
            if (m.type === 'create') {
              const secret = randomBytes(32).toString('base64url');
              const room: Room = { hostHash: hash(secret), expires: Date.now() + 12 * 60 * 60 * 1000 };
              let code = '';
              for (let attempt = 0; attempt < 10; attempt++) {
                code = Array.from(randomBytes(6), v => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[v % 31]).join('');
                if (redis) { if (await redis.set(`bumper:room:${code}`, JSON.stringify(room), { EX: 43200, NX: true })) break; }
                else if (!rooms.has(code)) { rooms.set(code, room); break; }
                code = '';
              }
              if (!code) throw new Error('Room allocation failed');
              c = { room: code, role: 'host', id: 'host', name: '', color: 0 }; clients.set(ws, c);
              send(ws, { type: 'created', room: code, secret });
            } else if (m.type === 'join' || m.type === 'host') {
              if (typeof m.room !== 'string' || !/^[A-Z2-9]{6}$/.test(m.room)) { send(ws, { type: 'error', message: 'Enter the six-character room code on the big screen.' }); return; }
              const room = await getRoom(m.room);
              if (!room) { send(ws, { type: 'error', message: 'Room not found. Check the code on the big screen.' }); return; }
              if (m.type === 'host') {
                if (!validToken(m.secret) || hash(m.secret) !== room.hostHash) { send(ws, { type: 'error', message: 'This host session has expired. Create a new room.' }); return; }
                c = { room: m.room, role: 'host', id: 'host', name: '', color: 0 };
              } else {
                if (!validToken(m.token)) { send(ws, { type: 'error', message: 'Invalid player session. Reload to try again.' }); return; }
                c = { room: m.room, role: 'player', id: hash(m.token).slice(0, 20),
                  name: String(m.name || 'Space bean').replace(/[\x00-\x1f]/g, '').trim().slice(0, 14) || 'Space bean',
                  color: Number.isInteger(m.color) ? Math.abs(m.color) % 6 : 0 };
              }
              clients.set(ws, c); send(ws, { type: 'joined', id: c.id, room: c.room });
              if (c.role === 'host') await publish({ room: c.room, audience: 'players', payload: { type: 'host-online' } });
              else await publish({ room: c.room, audience: 'host', payload: { type: 'player-join', id: c.id, name: c.name, color: c.color } });
            }
            if (c) clearTimeout(handshakeTimeout);
          } finally { processing = false; }
          return;
        }
        if (m.type === 'ping') { send(ws, { type: 'pong', time: m.time }); return; }
        if (c.role === 'player' && m.type === 'hello') await publish({ room: c.room, audience: 'host', payload: { type: 'player-join', id: c.id, name: c.name, color: c.color } });
        if (c.role === 'player' && m.type === 'input' && Number.isFinite(m.x) && Number.isFinite(m.z)) {
          await publish({ room: c.room, audience: 'host', payload: { type: 'input', id: c.id,
            x: Math.max(-1, Math.min(1, m.x)), z: Math.max(-1, Math.min(1, m.z)), dash: m.dash === true } });
        }
        if (c.role === 'host' && m.type === 'state' && m.state && Array.isArray(m.state.players) && m.state.players.length <= 30) {
          await publish({ room: c.room, audience: 'players', payload: { type: 'state', state: m.state } });
        }
        if (c.role === 'host' && m.type === 'reject' && typeof m.id === 'string') await publish({ room: c.room, audience: 'players', payload: { type: 'rejected', id: m.id, message: 'This room is full (30 players). Try again after the round.' } });
      } catch { send(ws, { type: 'error', message: 'Connection interrupted. Please reconnect in a moment.' }); }
    });
    ws.on('close', () => {
      clearTimeout(handshakeTimeout); const c = clients.get(ws); clients.delete(ws);
      if (c) void publish({ room: c.room, audience: c.role === 'host' ? 'players' : 'host',
        payload: c.role === 'host' ? { type: 'host-offline' } : { type: 'player-leave', id: c.id } }).catch(() => {});
    });
  });
  return { wss, close: async () => { for (const ws of wss.clients) ws.terminate(); wss.close(); if (redis?.isOpen) await redis.quit(); if (subscriber?.isOpen) await subscriber.quit(); } };
}
