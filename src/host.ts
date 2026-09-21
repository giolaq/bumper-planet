import QRCode from 'qrcode';
import { Game, COLORS } from './game';
import { ArenaScene } from './scene';
import { Connection } from './network';
import { arrowIcon, el, escapeHTML, planetIcon } from './icons';

export async function initHost() {
  el('app').innerHTML = `
  <div class="host-shell">
    <header class="topbar"><a class="brand" href="/">${planetIcon}<span>bumper<span class="brand-light">planet</span><sup>™</sup></span></a>
      <span class="event-label">SMALL PLANET. BIG MAIN CHARACTER ENERGY.</span>
      <div class="top-actions"><span class="live-pill"><i></i> PARTY MODE</span><button class="icon-button" id="sound" aria-label="Enable sound" title="Toggle sound">♫</button><button class="icon-button" id="fullscreen" aria-label="Enter fullscreen" title="Fullscreen">⛶</button></div>
    </header>
    <main class="host-main">
      <section class="arena-panel" aria-label="Game arena">
        <div class="hero-heading"><div class="eyebrow"><span class="little-star">✦</span> YOUR FRIENDS. ZERO GRAVITY. NO MERCY.</div><h1>BUMPER<br/><span>PLANET</span><span class="title-star">✳</span></h1><p>Stay on the planet.<br/>Send your friends into orbit.</p></div>
        <div class="arena-meta"><span class="arena-tag"><i></i> THE CANDY COSMOS</span><span class="coordinates">SECTOR 01 / PARTY ARENA</span></div>
        <div id="scene" class="scene"></div>
        <div id="round-banner" class="round-banner" aria-live="polite"></div>
        <div class="arena-bottom"><span><i class="status-dot"></i><span id="arena-status">THE CALM BEFORE THE CHAOS</span></span><span class="round-pill" id="round-number">ROUND 01</span></div>
      </section>
      <aside class="sidebar">
        <section class="join-card"><div class="card-topline"><span>YOUR PHONE IS THE CONTROLLER</span><span>↗</span></div><h2>Get in. Bump out.</h2><p>Scan to join the party. No app needed.</p><div class="qr-wrap"><canvas id="qr" aria-label="Scan this QR code to join the room"></canvas><div id="qr-loading">Opening the airlock…</div></div><div class="room-code"><span>ROOM CODE</span><button id="copy-code" title="Copy room link">······ <span>⧉</span></button></div><div class="connection-note" id="connection-note">Connecting to mission control…</div></section>
        <section class="how-card"><div class="section-label">A CRASH COURSE <span>30 SEC TO GET IT</span></div><div class="how-row"><span class="how-icon">↔</span><div><strong>Thumb to roam</strong><p>Drag the joystick on your phone.</p></div></div><div class="how-row"><span class="how-icon orange">ϟ</span><div><strong>Dash to bash</strong><p>Hit dash. Make it somebody’s problem.</p></div></div><div class="how-row"><span class="how-icon green">✳</span><div><strong>Three lives. Make them count.</strong><p>Bumped? Back in 10s, while lives last.</p></div></div></section>
        <section class="crew-card"><div class="section-label">THE CREW <span id="crew-count">0 / 30</span></div><div id="roster" class="roster"></div><button class="text-button" id="add-bots">+ Add practice bots</button></section>
      </aside>
    </main>
    <footer class="control-dock"><div class="dock-info"><span class="dock-symbol">✳</span><div><strong id="dock-title">A little push goes a long way.</strong><span id="dock-subtitle">45-second rounds · Up to 30 players · Infinite grudges</span></div></div><div class="dock-actions"><button class="secondary-button" id="keyboard">Play on this computer</button><button class="primary-button" id="start">Let’s rumble ${arrowIcon}</button></div></footer>
    <div id="toast" role="status" class="toast"></div>
  </div>`;
  const game = new Game(); game.addBots(6);
  let scene: ArenaScene;
  try { scene = new ArenaScene(el('scene'), game); }
  catch { el('scene').innerHTML = '<div class="webgl-error">This screen needs WebGL to render the planet. Try Chrome with hardware acceleration enabled.</div>'; return; }
  let room = '', joinURL = '', localPlayer = '', soundEnabled = false, audio: AudioContext | undefined;
  let lastPhase = game.phase, lastRoster = '', lastState = 0, lastUI = 0, last = performance.now(), finishTime = 0;
  const toast = (text: string) => { el('toast').textContent = text; el('toast').classList.add('show'); setTimeout(() => el('toast').classList.remove('show'), 3200); };
  const playTone = (frequency = 400) => {
    if (!soundEnabled) return; audio ??= new AudioContext();
    const oscillator = audio.createOscillator(), gain = audio.createGain(); oscillator.connect(gain); gain.connect(audio.destination);
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, audio.currentTime); oscillator.frequency.exponentialRampToValueAtTime(frequency / 2, audio.currentTime + 0.13);
    gain.gain.setValueAtTime(0.08, audio.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.15); oscillator.start(); oscillator.stop(audio.currentTime + 0.16);
  };
  const fall = game.onFall; game.onFall = p => { fall?.(p); playTone(180); };
  const bump = game.onBump; game.onBump = (x, z, power) => { bump?.(x, z, power); if (power > 0.8) playTone(450); };
  async function showRoom(code: string) {
    room = code; let origin = location.origin;
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      try { const network = await fetch('/api/network').then(r => r.json()); if (network.address) origin = `http://${network.address}:${location.port}`; } catch { /* Production uses its public URL. */ }
    }
    joinURL = `${origin}/play?room=${room}`;
    await QRCode.toCanvas(el<HTMLCanvasElement>('qr'), joinURL, { width: 190, margin: 1, color: { dark: '#252037', light: '#fffdf6' }, errorCorrectionLevel: 'M' });
    el('qr-loading').hidden = true; el('copy-code').innerHTML = `${room} <span>⧉</span>`;
    el('connection-note').textContent = origin.startsWith('http:') ? 'Phones: connect to the same Wi-Fi.' : 'Ready for takeoff. Bring your friends.';
  }
  const saved = sessionStorage.getItem('bumper-host');
  let handshake: Record<string, unknown> = { type: 'create' };
  try { if (saved) { const s = JSON.parse(saved); handshake = { type: 'host', room: s.room, secret: s.secret }; } } catch { sessionStorage.removeItem('bumper-host'); }
  const connection = new Connection(handshake, m => {
    if (m.type === 'created') { sessionStorage.setItem('bumper-host', JSON.stringify({ room: m.room, secret: m.secret })); void showRoom(m.room); }
    if (m.type === 'joined') void showRoom(m.room);
    if (m.type === 'player-join') {
      const exists = game.players.some(p => p.id === m.id);
      if (!exists && game.players.length >= 30) { const botIndex = game.players.findIndex(p => p.bot); if (botIndex >= 0 && game.phase !== 'playing') game.players.splice(botIndex, 1); }
      const player = game.addPlayer(m.id, m.name, m.color);
      if (!player) connection.send({ type: 'reject', id: m.id });
      else if (!exists) { toast(`${player.name} entered the orbit`); playTone(660); }
    }
    if (m.type === 'player-leave') { const p = game.players.find(p => p.id === m.id); if (p) { p.connected = false; p.input = { x: 0, z: 0, dash: false }; } }
    if (m.type === 'input') game.setInput(m.id, { x: m.x, z: m.z, dash: m.dash });
    if (m.type === 'error') { el('qr-loading').hidden = false; el('qr-loading').textContent = 'Online room unavailable'; sessionStorage.removeItem('bumper-host'); }
  }, status => {
    if (status !== 'Connected') el('connection-note').textContent = status;
  });
  el('copy-code').onclick = async () => { if (!joinURL) return; try { await navigator.clipboard.writeText(joinURL); toast('Room link copied. Send it to your crew.'); } catch { toast(joinURL); } };
  el('add-bots').onclick = () => { if (game.players.length >= 30) { toast('This orbit is full.'); return; } game.addBots(1); };
  el('start').onclick = () => {
    if (game.phase === 'playing' || game.phase === 'countdown') return;
    if (game.phase === 'finished') game.round++; game.start(); playTone(600);
  };
  el('keyboard').onclick = () => {
    if (!localPlayer) {
      const p = game.addPlayer('keyboard-pilot', 'You', 2); if (!p) { toast('This orbit is full.'); return; }
      localPlayer = p.id; el('keyboard').textContent = 'WASD / arrows + space'; toast(p.waiting ? 'You’re in for the next round.' : 'Use WASD or arrows to move. Space to dash.');
    }
    el('keyboard').blur();
  };
  const keys = new Set<string>(); let dash = false;
  window.addEventListener('keydown', e => { if (!localPlayer || (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(e.target.tagName))) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault(); keys.add(e.key.toLowerCase()); if (e.code === 'Space' && !e.repeat) dash = true; });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase())); window.addEventListener('blur', () => { keys.clear(); dash = false; });
  el('sound').onclick = () => { soundEnabled = !soundEnabled; el('sound').classList.toggle('active', soundEnabled); el('sound').setAttribute('aria-label', soundEnabled ? 'Mute sound' : 'Enable sound'); if (soundEnabled) playTone(620); };
  el('fullscreen').onclick = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen().catch(() => toast('Fullscreen is unavailable in this browser.')); };
  function frame(now: number) {
    const dt = Math.min((now - last) / 1000, 0.04); last = now;
    if (localPlayer) { game.setInput(localPlayer, { x: Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft')), z: Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup')), dash }); dash = false; }
    game.step(dt); scene.render(dt);
    // Render WebGL every frame, but avoid rebuilding the HUD at display refresh rate.
    if (now - lastUI < 100) { requestAnimationFrame(frame); return; }
    lastUI = now;
    if (game.phase !== lastPhase) {
      lastPhase = game.phase; if (game.phase === 'finished') { finishTime = game.elapsed; playTone(880); }
    }
    const banner = el('round-banner');
    if (game.phase === 'countdown') { banner.className = 'round-banner counting'; banner.innerHTML = `<span>READY TO RUMBLE?</span><strong>${Math.max(1, Math.ceil(game.countdown))}</strong>`; }
    else if (game.phase === 'playing') { banner.className = 'round-banner timer'; banner.innerHTML = `<span>${game.remaining < 15 ? 'THE PLANET IS SHRINKING' : 'LAST BEAN STANDING'}</span><strong>${Math.ceil(game.remaining).toString().padStart(2, '0')}<small>s</small></strong>`; }
    else if (game.phase === 'finished') {
      banner.className = 'round-banner winner'; banner.innerHTML = `<span>${game.winner ? 'THE ORBIT BELONGS TO' : 'COSMIC CHAOS'}</span><strong>${game.winner ? escapeHTML(game.winner.name) : 'It’s a draw!'}</strong><small>Next round in ${Math.max(0, 10 - Math.floor(game.elapsed - finishTime))}s</small>`;
      if (game.elapsed - finishTime > 10) { game.round++; game.start(); }
    } else { banner.className = 'round-banner'; banner.innerHTML = ''; }
    const roster = JSON.stringify(game.players.map(p => [p.id, p.connected, p.alive, p.waiting, p.score, p.lives]));
    if (roster !== lastRoster) {
      lastRoster = roster;
      el('roster').innerHTML = game.players.map(p => `<div class="roster-player ${!p.connected ? 'disconnected' : ''}"><span class="bean-avatar" style="--bean:${COLORS[p.color]}"><i></i><i></i></span><span>${escapeHTML(p.name)}</span><small>${p.waiting ? 'NEXT' : !p.connected ? 'AWAY' : p.bot ? 'BOT' : '●'}</small>${p.score ? `<b>${p.score} ★</b>` : ''}</div>`).join('');
      el('crew-count').textContent = `${game.players.length} / 30`;
    }
    const running = game.phase === 'playing' || game.phase === 'countdown';
    el<HTMLButtonElement>('start').disabled = running;
    el('start').innerHTML = running ? 'Round in progress <span class="button-dot"></span>' : `${game.phase === 'finished' ? 'Next round' : 'Let’s rumble'} ${arrowIcon}`;
    el('round-number').textContent = `ROUND ${String(game.round).padStart(2, '0')}`;
    el('arena-status').textContent = game.phase === 'playing' ? `${game.players.filter(p => p.alive && !p.waiting).length} BEANS STILL STANDING` : game.phase === 'finished' ? 'VICTORY TASTES LIKE CANDY' : 'THE CALM BEFORE THE CHAOS';
    if (now - lastState > 150) { connection.send({ type: 'state', state: game.snapshot() }); lastState = now; }
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) connection.send({ type: 'state', state: { ...game.snapshot(), paused: true } }); });
  requestAnimationFrame(frame);
}
