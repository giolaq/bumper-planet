import { COLORS, STARTING_LIVES } from './game';
import { Connection } from './network';
import { arrowIcon, el, planetIcon } from './icons';
import { randomToken } from './random';

export function initPhone() {
  const params = new URLSearchParams(location.search);
  const initialRoom = (params.get('room') || '').toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);
  let color = Number(localStorage.getItem('bumper-color') || 0) % 6;
  if (!Number.isFinite(color) || color < 0) color = 0;
  let token = localStorage.getItem('bumper-player-token');
  if (!token) { token = randomToken(); localStorage.setItem('bumper-player-token', token); }
  el('app').innerHTML = `<main class="phone-shell">
    <header class="phone-header"><a class="brand" href="/">${planetIcon}<span>bumper<span class="brand-light">planet</span></span></a><span class="phone-tag">PLAYER ONE? YOU WISH.</span></header>
    <section id="join-screen" class="join-screen"><div class="eyebrow">ONE SMALL SCAN. ONE GIANT BUMP.</div><h1>Meet your<br/><span>main character.</span></h1><div class="bean-preview"><div class="preview-orbit"></div><div class="preview-bean" id="preview-bean"><div class="bean-shine"></div><div class="preview-eyes"><i></i><i></i></div><div class="preview-feet"><i></i><i></i></div></div><span class="preview-shadow"></span><span class="preview-spark">✦</span></div>
    <form id="join-form"><label for="name">WHAT DO WE CALL YOU?</label><input id="name" maxlength="14" autocomplete="nickname" placeholder="Your cosmic alter ego" required/><label>CHOOSE YOUR FLAVOR</label><div id="colors" class="color-picker" role="group" aria-label="Character color"></div><label for="room">ROOM CODE</label><input id="room" minlength="6" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123" required/><p id="join-error" class="form-error" role="alert"></p><button id="join-button" class="primary-button" type="submit">Put me on the planet ${arrowIcon}</button></form><p class="phone-footnote">Look at the big screen. Keep your thumbs here.</p></section>
    <section id="controller-screen" class="controller-screen" hidden><div class="controller-top"><span class="live-pill" id="phone-connection"><i></i> CONNECTING</span><span id="phone-room"></span></div><div class="pilot-card"><span class="bean-avatar large" id="pilot-avatar"><i></i><i></i></span><div><span>LOOK FOR YOUR BEAN</span><h2 id="pilot-name"></h2><div id="phone-lives" class="phone-lives" role="img" aria-label="3 of 3 lives remaining"><span class="life-heart" aria-hidden="true">♥</span><span class="life-heart" aria-hidden="true">♥</span><span class="life-heart" aria-hidden="true">♥</span></div></div><strong id="phone-timer">45<small>s</small></strong></div><div class="controller-message" aria-live="polite"><span id="phone-phase">YOU’RE IN THE ORBIT</span><h2 id="phone-instruction">Eyes on the big screen.</h2><p id="phone-detail">Your host will start the round.</p></div><div class="phone-controls"><div class="joystick-area"><div class="joystick" id="joystick" role="application" aria-label="Movement joystick. Drag to move your character."><span class="joy-up">↑</span><span class="joy-left">←</span><span class="joy-right">→</span><span class="joy-down">↓</span><div class="joystick-knob" id="joystick-knob">✳</div></div><span class="control-caption">DRAG TO ROAM</span></div><div class="dash-area"><button id="dash" class="dash-button" disabled><span>ϟ</span><strong>DASH</strong></button><span class="control-caption" id="dash-caption">WAIT FOR THE ROUND</span></div></div><div class="phone-bottom"><span>↔ MOVE</span><span>ϟ BUMP</span><span>✦ SURVIVE</span></div><button class="text-button leave-button" id="leave">Leave this orbit</button></section>
  </main>`;
  el<HTMLInputElement>('room').value = initialRoom;
  el<HTMLInputElement>('name').value = localStorage.getItem('bumper-name') || '';
  const names = ['Peach', 'Lavender', 'Lime', 'Sky', 'Bubblegum', 'Lemon'];
  function pickColor() {
    el('colors').innerHTML = COLORS.map((c, i) => `<button type="button" class="color-swatch ${i === color ? 'selected' : ''}" style="--swatch:${c}" aria-label="${names[i]}" aria-pressed="${i === color}" data-color="${i}">${i === color ? '✓' : ''}</button>`).join('');
    el('preview-bean').style.setProperty('--bean', COLORS[color]);
    el('colors').querySelectorAll<HTMLButtonElement>('button').forEach(b => b.onclick = () => { color = Number(b.dataset.color); pickColor(); });
  } pickColor();
  let connection: Connection | undefined, playerId = '', joined = false, active = false, cooldown = 0, lastState = 0;
  let x = 0, z = 0, dashPending = false, pointerId: number | undefined;
  const reset = () => { x = z = 0; dashPending = false; pointerId = undefined; el('joystick-knob').style.transform = 'translate(-50%, -50%)'; };
  const returnToJoin = (message = '') => {
    reset(); connection?.close(); joined = active = false; el('join-screen').hidden = false; el('controller-screen').hidden = true;
    el('join-error').textContent = message; el<HTMLButtonElement>('join-button').disabled = false;
  };
  el<HTMLFormElement>('join-form').onsubmit = event => {
    event.preventDefault(); const name = el<HTMLInputElement>('name').value.trim(); const room = el<HTMLInputElement>('room').value.trim().toUpperCase();
    if (!name || !/^[A-Z2-9]{6}$/.test(room)) { el('join-error').textContent = 'Add your name and the six-character code on the big screen.'; return; }
    localStorage.setItem('bumper-name', name); localStorage.setItem('bumper-color', String(color));
    el<HTMLButtonElement>('join-button').disabled = true; el('join-error').textContent = '';
    connection?.close();
    connection = new Connection({ type: 'join', room, name, color, token }, m => {
      if (m.type === 'joined') {
        joined = true; playerId = m.id; lastState = 0; el('join-screen').hidden = true; el('controller-screen').hidden = false;
        el('pilot-name').textContent = name; el('pilot-avatar').style.setProperty('--bean', COLORS[color]); el('phone-room').textContent = `ROOM ${room}`;
        history.replaceState(null, '', `/play?room=${room}`);
      }
      if (m.type === 'error') returnToJoin(m.message);
      if (m.type === 'rejected' && m.id === playerId) returnToJoin(m.message);
      if (m.type === 'host-online') connection?.send({ type: 'hello' });
      if (m.type === 'host-offline') { active = false; reset(); el('phone-instruction').textContent = 'Host reconnecting…'; el('phone-detail').textContent = 'Hang tight. Your bean is still yours.'; }
      if (m.type === 'state') {
        lastState = performance.now(); const s = m.state; const me = s.players.find((p: { id: string }) => p.id === playerId);
        if (!me) { active = false; connection?.send({ type: 'hello' }); return; }
        cooldown = me.cooldown; active = s.phase === 'playing' && me.alive && !me.waiting && !s.paused;
        const lives = Math.max(0, Math.min(STARTING_LIVES, me.lives ?? STARTING_LIVES));
        el('phone-lives').innerHTML = Array.from({ length: STARTING_LIVES }, (_, i) => `<span class="life-heart ${i < lives ? '' : 'lost'}" aria-hidden="true">♥</span>`).join('');
        el('phone-lives').setAttribute('aria-label', `${lives} of ${STARTING_LIVES} lives remaining`);
        el('phone-connection').innerHTML = '<i></i> CONNECTED';
        el('phone-timer').innerHTML = `${Math.ceil(s.remaining)}<small>s</small>`;
        let phase = `ROUND ${String(s.round).padStart(2, '0')}`, instruction = 'Eyes on the big screen.', detail = 'Your host will start the round.';
        if (s.paused) { instruction = 'Host paused'; detail = 'The host needs to return to the game tab.'; }
        else if (me.waiting) { phase = 'NEXT ROUND IS YOURS'; instruction = 'You’re on the guest list.'; detail = 'Joining mid-round? You’ll spawn in the next one.'; }
        else if (s.phase === 'countdown') { instruction = `Get ready… ${Math.max(1, Math.ceil(s.countdown))}`; detail = 'Thumb on the joystick. Eyes on your bean.'; }
        else if (s.phase === 'playing' && !me.alive && lives > 0 && Number.isFinite(me.respawnIn)) {
          phase = 'COMEBACK INCOMING'; instruction = `Back in ${Math.ceil(me.respawnIn)}s`;
          detail = `${lives} ${lives === 1 ? 'life' : 'lives'} left. You’ll land back on the planet automatically.`;
        }
        else if (s.phase === 'playing' && !me.alive) { phase = 'OUT OF LIVES'; instruction = 'Enjoy the orbit.'; detail = 'Three lives next round. Stay for the rematch.'; }
        else if (s.phase === 'playing') { instruction = 'Go make some space.'; detail = 'Move with your thumb. Dash into your rivals.'; }
        else if (s.phase === 'finished') { phase = s.winner === playerId ? 'YOU OWN THIS PLANET' : 'ROUND COMPLETE'; instruction = s.winner === playerId ? 'Certified cosmic menace.' : 'A rematch is coming.'; detail = `Your wins: ${me.score} · Next round starts automatically.`; }
        el('phone-phase').textContent = phase; el('phone-instruction').textContent = instruction; el('phone-detail').textContent = detail;
        if (!active) reset();
      }
    }, status => {
      if (status === 'Connected') el('phone-connection').innerHTML = '<i></i> CONNECTED';
      else { active = false; reset(); el('phone-connection').textContent = status === 'Connecting…' ? 'CONNECTING…' : 'RECONNECTING…'; if (!joined) el('join-error').textContent = status; }
    });
  };
  const joystick = el('joystick');
  const move = (event: PointerEvent) => {
    const bounds = joystick.getBoundingClientRect(); const maximum = bounds.width * 0.29;
    let dx = event.clientX - bounds.left - bounds.width / 2, dy = event.clientY - bounds.top - bounds.height / 2;
    const length = Math.hypot(dx, dy); if (length > maximum) { dx *= maximum / length; dy *= maximum / length; }
    x = dx / maximum; z = dy / maximum; el('joystick-knob').style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  };
  joystick.onpointerdown = event => { if (pointerId !== undefined) return; event.preventDefault(); pointerId = event.pointerId; joystick.setPointerCapture(event.pointerId); move(event); };
  joystick.onpointermove = event => { if (event.pointerId === pointerId) move(event); };
  joystick.onpointerup = joystick.onpointercancel = event => { if (event.pointerId === pointerId) reset(); };
  joystick.onlostpointercapture = () => reset();
  el('dash').onpointerdown = event => { event.preventDefault(); if (active && cooldown <= 0) { dashPending = true; cooldown = 2.5; navigator.vibrate?.(35); } };
  el('dash').onclick = event => { if (event.detail === 0 && active && cooldown <= 0) { dashPending = true; cooldown = 2.5; } };
  window.addEventListener('blur', reset); document.addEventListener('visibilitychange', () => { reset(); connection?.send({ type: 'input', x: 0, z: 0, dash: false }); if (!document.hidden) connection?.send({ type: 'hello' }); });
  el('leave').onclick = () => returnToJoin();
  setInterval(() => {
    if (!joined) return;
    if (lastState && performance.now() - lastState > 2200) { active = false; reset(); el('phone-connection').textContent = 'WAITING FOR HOST'; el('phone-instruction').textContent = 'Hold that thumb.'; el('phone-detail').textContent = 'Waiting for the big screen to reconnect.'; }
    if (active) { connection?.send({ type: 'input', x, z, dash: dashPending }); dashPending = false; }
    el<HTMLButtonElement>('dash').disabled = !active || cooldown > 0;
    el('dash-caption').textContent = !active ? 'WAIT FOR THE ROUND' : cooldown > 0 ? `RECHARGING ${cooldown.toFixed(1)}s` : 'TAP TO BASH';
    el('dash').style.setProperty('--charge', `${Math.max(0, 1 - cooldown / 2.5) * 100}%`);
  }, 50);
  setInterval(() => { if (joined) { connection?.send({ type: 'hello' }); connection?.send({ type: 'ping', time: Date.now() }); } }, 5000);
}
