import * as THREE from 'three';
import { COLORS, type Game, type Player } from './game';

export class ArenaScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(37, 1, 0.1, 120);
  arena = new THREE.Group();
  beans = new Map<string, { group: THREE.Group; label: HTMLDivElement }>();
  particles: { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number }[] = [];
  moons: THREE.Group[] = [];
  labels: HTMLDivElement;
  game: Game;
  host: HTMLElement;
  constructor(host: HTMLElement, game: Game) {
    this.host = host; this.game = game;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.45;
    host.appendChild(this.renderer.domElement);
    this.labels = document.createElement('div'); this.labels.className = 'world-labels'; host.appendChild(this.labels);
    this.camera.position.set(0, 19, 25); this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.HemisphereLight('#ffe6eb', '#6659c0', 2.8));
    const sun = new THREE.DirectionalLight('#fff1d7', 4.3); sun.position.set(-8, 20, 10); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 });
    sun.shadow.bias = -0.001; sun.shadow.normalBias = 0.03; this.scene.add(sun);
    const rimLight = new THREE.DirectionalLight('#a0a1ff', 3); rimLight.position.set(8, 5, -12); this.scene.add(rimLight);
    const texture = new THREE.TextureLoader().load('/textures/candy-terrazzo.png'); texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.6, 96), [
      new THREE.MeshStandardMaterial({ color: '#9171dc', roughness: 0.5 }),
      new THREE.MeshStandardMaterial({ map: texture, color: '#e4d7ff', roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: '#7660b9' })
    ]); deck.position.y = -0.3; deck.receiveShadow = true; this.arena.add(deck);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#9671d9', roughness: 0.34, metalness: 0.08 }));
    belly.scale.set(7.98, 3.1, 7.98); belly.position.y = -0.65; this.arena.add(belly);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(8, 0.16, 12, 120), new THREE.MeshStandardMaterial({ color: '#ffb777', emissive: '#ff552c', emissiveIntensity: 1.4, roughness: 0.3 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.04; this.arena.add(rim);
    const bottomRim = new THREE.Mesh(new THREE.TorusGeometry(7.55, 0.04, 8, 120), new THREE.MeshBasicMaterial({ color: '#d8b2ff' }));
    bottomRim.rotation.x = Math.PI / 2; bottomRim.position.y = -1.75; this.arena.add(bottomRim);
    for (const radius of [2, 4, 6]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(radius, radius + 0.035, 100), new THREE.MeshBasicMaterial({ color: '#fff2e8', transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.025; this.arena.add(ring);
    }
    const center = new THREE.Mesh(new THREE.RingGeometry(0.23, 0.33, 4), new THREE.MeshBasicMaterial({ color: '#fff7e1', side: THREE.DoubleSide }));
    center.rotation.x = -Math.PI / 2; center.rotation.z = Math.PI / 4; center.position.y = 0.03; this.arena.add(center);
    this.scene.add(this.arena);
    // The orbit line is intentionally broken up into dots, like a little solar-system diagram.
    const orbit = new THREE.Group();
    for (let i = 0; i < 100; i++) {
      const a = i / 100 * Math.PI * 2;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.026, 4, 4), new THREE.MeshBasicMaterial({ color: '#a792d6', transparent: true, opacity: 0.35 }));
      dot.position.set(Math.cos(a) * 11.8, -1.3, Math.sin(a) * 10); orbit.add(dot);
    } this.scene.add(orbit);
    for (let i = 0; i < 3; i++) {
      const moon = new THREE.Group(); const color = ['#f69a6e', '#b7d67e', '#a98bdf'][i];
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry([0.8, 0.44, 0.65][i], 3), new THREE.MeshStandardMaterial({ color, roughness: 0.8 })); moon.add(ball);
      if (i === 0) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.055, 8, 60), new THREE.MeshStandardMaterial({ color: '#fac0ac' }));
        ring.rotation.x = 1.1; ring.rotation.y = 0.2; moon.add(ring);
      }
      moon.position.set([-11, 11, 9][i], [1.5, 3, -3][i], [0, -7, 5][i]); this.moons.push(moon); this.scene.add(moon);
    }
    new ResizeObserver(() => this.resize()).observe(host); this.resize();
    game.onBump = (x, z, power) => this.burst(x, 0.7, z, power > 0.8 ? '#ffe1a6' : '#fce9ff', 8);
    game.onFall = p => this.burst(p.x, 0.4, p.z, COLORS[p.color], 16);
  }
  resize() {
    const { width, height } = this.host.getBoundingClientRect(); this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.position.set(0, 19, 25).multiplyScalar(width / height < 1.1 ? 1.3 : 1);
    this.camera.updateProjectionMatrix();
  }
  bean(p: Player) {
    const group = new THREE.Group();
    const jelly = new THREE.MeshPhysicalMaterial({ color: COLORS[p.color], roughness: 0.25, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.17 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 24), jelly); body.scale.set(0.61, 0.77, 0.57); body.position.y = 0.83; body.castShadow = true; group.add(body);
    for (const x of [-0.23, 0.23]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), new THREE.MeshStandardMaterial({ color: '#fffbed', roughness: 0.2 }));
      eye.position.set(x, 1.05, 0.49); eye.scale.set(1, 1.16, 0.57); group.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.078, 12, 12), new THREE.MeshStandardMaterial({ color: '#292237', roughness: 0.1 }));
      pupil.position.set(x + 0.015, 1.05, 0.58); pupil.scale.z = 0.5; group.add(pupil);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), jelly); foot.position.set(x * 1.3, 0.15, 0.18); foot.scale.set(1, 0.7, 1.4); foot.castShadow = true; group.add(foot);
    }
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.33, 5), new THREE.MeshStandardMaterial({ color: COLORS[p.color], roughness: 0.3 })); crown.position.set(0.08, 1.66, 0); crown.rotation.z = -0.3; group.add(crown);
    const label = document.createElement('div'); label.className = 'player-label'; label.textContent = p.name; label.style.setProperty('--bean', COLORS[p.color]);
    this.labels.appendChild(label); this.scene.add(group); const entry = { group, label }; this.beans.set(p.id, entry); return entry;
  }
  burst(x: number, y: number, z: number, color: string, count: number) {
    for (let i = 0; i < count && this.particles.length < 200; i++) {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08 + Math.random() * 0.06, 0), new THREE.MeshBasicMaterial({ color }));
      mesh.position.set(x, y, z); this.scene.add(mesh);
      this.particles.push({ mesh, vx: (Math.random() - 0.5) * 7, vy: 3 + Math.random() * 5, vz: (Math.random() - 0.5) * 7, life: 0.7 + Math.random() * 0.5 });
    }
  }
  render(dt: number) {
    const t = this.game.elapsed;
    this.arena.scale.set(this.game.radius / 8, 1, this.game.radius / 8);
    const currentIds = new Set(this.game.players.map(p => p.id));
    for (const [id, entry] of this.beans) if (!currentIds.has(id)) {
      this.scene.remove(entry.group); entry.label.remove();
      entry.group.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); if (!Array.isArray(object.material)) object.material.dispose(); } }); this.beans.delete(id);
    }
    const width = this.host.clientWidth, height = this.host.clientHeight;
    for (const [i, p] of this.game.players.entries()) {
      const { group, label } = this.beans.get(p.id) || this.bean(p);
      let x = p.x, z = p.z, y = 0;
      if (p.waiting || !p.alive) {
        const fall = p.fallenAt >= 0 ? t - p.fallenAt : 5;
        if (fall < 1.1) { y = -fall * fall * 12; group.rotation.z += dt * 3; }
        else { const a = t * 0.25 + i * 1.3; x = Math.cos(a) * 10.1; z = Math.sin(a) * 8.7; y = -1 + Math.sin(t * 2 + i) * 0.3; group.rotation.z = 0; }
        group.scale.setScalar(0.56); label.classList.add('ghost');
      } else {
        const idle = this.game.phase !== 'playing';
        y = idle ? Math.sin(t * 2 + i) * 0.12 + 0.12 : Math.abs(Math.sin(t * 15 + i)) * Math.min(0.13, Math.hypot(p.vx, p.vz) * 0.02);
        const winner = this.game.phase === 'finished' && this.game.winner?.id === p.id;
        const size = winner ? 1.65 : 1;
        const squash = p.boost > 0 ? 0.78 : 1 + Math.sin(t * 3 + i) * 0.025;
        group.scale.set(size / Math.sqrt(squash), size * squash, size / Math.sqrt(squash));
        group.rotation.z = -p.vx * 0.025; group.rotation.x = p.vz * 0.016; label.classList.remove('ghost');
        if (winner && Math.random() < dt * 8) this.burst(x, 2, z, COLORS[Math.floor(Math.random() * COLORS.length)], 4);
      }
      group.position.set(x, y, z);
      const screen = new THREE.Vector3(x, y + 2.15 * group.scale.y, z).project(this.camera);
      label.style.transform = `translate(${(screen.x * 0.5 + 0.5) * width}px,${(-screen.y * 0.5 + 0.5) * height}px) translate(-50%,-50%)`;
      label.style.opacity = y < -2 ? '0' : '1';
    }
    this.moons.forEach((moon, i) => { moon.rotation.y += dt * 0.14; moon.position.y += Math.sin(t + i) * dt * 0.16; });
    this.particles = this.particles.filter(p => {
      p.life -= dt; if (p.life <= 0) { this.scene.remove(p.mesh); p.mesh.geometry.dispose(); (p.mesh.material as THREE.Material).dispose(); return false; }
      p.vy -= dt * 12; p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += dt * 4; p.mesh.scale.setScalar(Math.min(1, p.life * 3)); return true;
    });
    this.renderer.render(this.scene, this.camera);
  }
}
