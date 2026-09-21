import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, RESPAWN_SECONDS, STARTING_LIVES } from '../src/game.ts';

function runningGame() {
  const game = new Game(); game.addPlayer('a', 'Alice', 0); game.addPlayer('b', 'Bob', 1); game.start();
  for (let i = 0; i < 100; i++) game.step(1 / 30);
  assert.equal(game.phase, 'playing'); return game;
}
test('late joiners wait for the next round, then spawn alive', () => {
  const game = runningGame(); const player = game.addPlayer('late', 'Late bean', 2)!;
  assert.equal(player.waiting, true); assert.equal(player.alive, false);
  game.phase = 'finished'; game.start(); assert.equal(player.waiting, false); assert.equal(player.alive, true);
});
test('dash gives an impulse and cannot bypass its cooldown', () => {
  const game = runningGame(); const a = game.players[0]; a.x = a.z = 0;
  game.setInput('a', { x: 1, z: 0, dash: true }); game.step(0.02);
  assert.ok(a.vx > 10); assert.ok(a.cooldown > 2);
  const before = a.vx; game.setInput('a', { x: 1, z: 0, dash: true }); game.step(0.02);
  assert.ok(a.vx < before + 1, 'a second dash must not add another impulse');
});
test('stale input stops accelerating a disconnected controller', () => {
  const game = runningGame(); game.setInput('a', { x: 1, z: 0, dash: false });
  game.elapsed += 1; game.step(0.02); assert.deepEqual(game.players[0].input, { x: 0, z: 0, dash: false });
});
test('falling eliminates a player and awards exactly one win', () => {
  const game = runningGame(); game.players[0].lives = 1; game.players[0].x = 20; game.step(0.02);
  assert.equal(game.players[0].alive, false); assert.equal(game.phase, 'finished'); assert.equal(game.winner?.id, 'b');
  for (let i = 0; i < 100; i++) game.step(0.02); assert.equal(game.players[1].score, 1);
});
test('round timeout with multiple survivors is a draw', () => {
  const game = runningGame(); game.players[0].x = -1; game.players[0].z = 0; game.players[1].x = 1; game.players[1].z = 0;
  game.remaining = 0.01; game.step(0.02); assert.equal(game.phase, 'finished'); assert.equal(game.winner, undefined);
});
test('collision transfers momentum and separates overlapping beans', () => {
  const game = runningGame(); const [a, b] = game.players;
  a.x = 0; a.z = 0; b.x = 0.8; b.z = 0; a.vx = 12;
  game.step(0.01); assert.ok(b.vx > 5); assert.ok(b.x - a.x >= 1.04);
});
test('capacity is bounded and reconnect keeps existing player identity', () => {
  const game = new Game(); for (let i = 0; i < 30; i++) game.addPlayer(`${i}`, `Bean ${i}`, i % 6);
  assert.equal(game.addPlayer('extra', 'Extra', 0), undefined);
  const existing = game.players[0]; existing.connected = false;
  assert.equal(game.addPlayer('0', 'Ignored rename', 1), existing); assert.equal(existing.connected, true);
});
test('three lives allow two ten-second comebacks, then permanent elimination', () => {
  const game = runningGame(); const [a, b] = game.players;
  b.x = 0; b.z = 0;
  assert.equal(a.lives, STARTING_LIVES);
  for (const remainingLives of [2, 1]) {
    a.x = 20; game.step(0.02);
    assert.equal(a.lives, remainingLives); assert.equal(a.alive, false);
    assert.equal(game.phase, 'playing', 'one visible survivor must not end a pending comeback');
    assert.equal(game.snapshot().players[0].respawnIn, RESPAWN_SECONDS);
    for (let i = 0; i < 499; i++) game.step(0.02);
    assert.equal(a.alive, false, 'no respawn before ten seconds');
    game.step(0.03);
    assert.equal(a.alive, true); assert.equal(a.respawnAt, null);
    assert.equal(a.lives, remainingLives); assert.ok(Math.hypot(a.x, a.z) < game.radius - 1);
    assert.equal(a.vx, 0); assert.equal(a.vz, 0);
  }
  a.x = 20; game.step(0.02);
  assert.equal(a.lives, 0); assert.equal(a.respawnAt, null); assert.equal(a.alive, false);
  assert.equal(game.winner, b); assert.equal(b.score, 1);
  game.start(); assert.equal(a.lives, STARTING_LIVES); assert.equal(a.alive, true);
});
test('all players can orbit awaiting a comeback without ending the round', () => {
  const game = runningGame(); game.players.forEach(p => { p.x = 20; }); game.step(0.02);
  assert.equal(game.phase, 'playing'); assert.ok(game.players.every(p => !p.alive && p.lives === 2));
  game.remaining = 0.01; game.step(0.02);
  assert.equal(game.phase, 'finished'); assert.equal(game.winner, undefined);
  assert.ok(game.snapshot().players.every(p => p.respawnIn === null), 'no pending comeback advertised after the round');
});
