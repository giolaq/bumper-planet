import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createRelay } from '../server/relay.ts';

test('25 controllers join, route input, reject host spoofing, isolate rooms, and reconnect', { timeout: 20000 }, async () => {
  const server = http.createServer(); const relay = createRelay(server); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `ws://127.0.0.1:${(server.address() as { port: number }).port}/api/ws`;
  const sockets: WebSocket[] = [];
  const connect = async () => {
    const ws = new WebSocket(url); sockets.push(ws); const messages: any[] = [];
    ws.on('message', data => messages.push(JSON.parse(data.toString()))); await once(ws, 'open');
    return { ws, messages, send: (m: unknown) => ws.send(JSON.stringify(m)) };
  };
  const until = async <T>(predicate: () => T): Promise<NonNullable<T>> => {
    for (let i = 0; i < 200; i++) { const result = predicate(); if (result) return result; await new Promise(r => setTimeout(r, 10)); }
    throw new Error('Expected relay event did not arrive');
  };
  try {
    const host = await connect(); host.send({ type: 'create' }); const created = await until(() => host.messages.find(m => m.type === 'created'));
    const players = await Promise.all(Array.from({ length: 25 }, async (_, i) => {
      const p = await connect(); const token = randomBytes(32).toString('hex');
      p.send({ type: 'join', room: created.room, name: `Pilot ${i}`, color: i % 6, token });
      const joined = await until(() => p.messages.find(m => m.type === 'joined')); return { ...p, token, id: joined.id };
    }));
    await until(() => host.messages.filter(m => m.type === 'player-join').length === 25);
    for (const p of players) p.send({ type: 'input', x: 0.5, z: -0.5, dash: true });
    await until(() => host.messages.filter(m => m.type === 'input').length === 25);
    assert.equal(players[0].messages.filter(m => m.type === 'input').length, 0, 'inputs go only to the host');
    players[0].send({ type: 'state', state: { phase: 'finished', players: [] } });
    host.send({ type: 'state', state: { phase: 'playing', players: [] } });
    await until(() => players.every(p => p.messages.some(m => m.type === 'state')));
    assert.ok(players.every(p => p.messages.filter(m => m.type === 'state').every(m => m.state.phase === 'playing')));
    const attacker = await connect(); attacker.send({ type: 'host', room: created.room, secret: randomBytes(32).toString('hex') });
    await until(() => attacker.messages.some(m => m.type === 'error'));
    const otherHost = await connect(); otherHost.send({ type: 'create' });
    await until(() => otherHost.messages.some(m => m.type === 'created'));
    players[0].send({ type: 'input', x: 99, z: -99, dash: true });
    await until(() => host.messages.some(m => m.type === 'input' && m.x === 1 && m.z === -1));
    assert.equal(otherHost.messages.some(m => m.type === 'input'), false);
    players[0].ws.close(); await once(players[0].ws, 'close');
    const rejoined = await connect(); rejoined.send({ type: 'join', room: created.room, token: players[0].token, name: 'Pilot 0', color: 0 });
    const joined = await until(() => rejoined.messages.find(m => m.type === 'joined')); assert.equal(joined.id, players[0].id);
  } finally { for (const socket of sockets) socket.terminate(); await relay.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
