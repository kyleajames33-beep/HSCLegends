// Canvas 2D renderer for Reactor Clash, shared by practice, student and projector views.
// Uses the locked-style top-down art in /public/art/arena (all sprites face north),
// falling back to simple shapes while images load.
import { terminalLocked, BASES, BOSS_HP, COLS, MAX_ENERGY, PLAYER_R, REACTOR_R, ROWS, TILE, WALLS, WORLD_H, WORLD_W, type ClashState, type Team } from '@/lib/clash/sim';

export const TEAM_COLOR: Record<Team, string> = { blue: '#2f7bea', orange: '#ff6a2b' };
export type Fx = { x: number; y: number; r: number; life: number; color: string; kind?: 'ring' | 'spark' | 'pulse' };
export type Cam = { x: number; y: number; scale: number };
type Sprites = Record<string, HTMLImageElement> & { __static?: unknown };

const A = '/art/arena';
const SPRITES: Record<string, string> = {
  floor: `${A}/tiles/floor-plain.webp`, vent: `${A}/tiles/floor-vent.webp`, conduit: `${A}/tiles/floor-conduit.webp`,
  wall: `${A}/tiles/wall-straight.webp`, corner: `${A}/tiles/wall-corner.webp`,
  baseBlue: `${A}/tiles/team-base-blue.webp`, baseOrange: `${A}/tiles/team-base-orange.webp`,
  termIdle: `${A}/objects/question-terminal-idle.webp`, termActive: `${A}/objects/question-terminal-active.webp`,
  reactorNeutral: `${A}/objects/reactor-neutral.webp`, reactorBlue: `${A}/objects/reactor-blue.webp`, reactorOrange: `${A}/objects/reactor-orange.webp`,
  orb: `${A}/objects/energy-pickup.webp`,
  blue: `${A}/players/operative-blue.webp`, orange: `${A}/players/operative-orange.webp`,
  blueAnswer: `${A}/players/operative-blue-answering.webp`, orangeAnswer: `${A}/players/operative-orange-answering.webp`,
  ...Object.fromEntries((['blue', 'orange'] as const).flatMap(t => [1, 2, 3, 4].map(i => [`${t}Walk${i}`, `${A}/players/operative-${t}-walk-${i}.webp`]))),
  bossTop: `${A}/boss/chemistry-boss-topdown.webp`,
  minion: `${A}/minions/chemistry-minion.webp`,
  shot: `${A}/fx/neutraliser-projectile.webp`, spark: `${A}/fx/hit-spark.webp`, pulse: `${A}/fx/capture-pulse-ring.webp`,
  boss: '/art/bosses/chemistry-boss-idle.webp', bossHurt: '/art/bosses/chemistry-boss-hurt.webp',
};

/** Preload sprites; shapes are drawn until each loads. */
export function loadSprites(): Record<string, HTMLImageElement> {
  const out: Record<string, HTMLImageElement> = {};
  for (const [k, src] of Object.entries(SPRITES)) { const img = new Image(); img.src = src; out[k] = img; }
  return out;
}
const ready = (img: HTMLImageElement | undefined): img is HTMLImageElement => !!img && img.complete && img.naturalWidth > 0;

/** Camera that follows a point (player view) or fits the whole map (projector view). */
export function followCam(cam: Cam, canvas: HTMLCanvasElement, focus: { x: number; y: number } | null, viewTilesW = 22) {
  if (!focus) {
    cam.scale = Math.min(canvas.width / WORLD_W, canvas.height / WORLD_H);
    cam.x = WORLD_W / 2; cam.y = WORLD_H / 2;
    return;
  }
  cam.scale = canvas.width / (viewTilesW * TILE);
  const halfW = canvas.width / 2 / cam.scale, halfH = canvas.height / 2 / cam.scale;
  cam.x = halfW * 2 > WORLD_W ? WORLD_W / 2 : Math.max(halfW, Math.min(WORLD_W - halfW, focus.x));
  cam.y = halfH * 2 > WORLD_H ? WORLD_H / 2 : Math.max(halfH, Math.min(WORLD_H - halfH, focus.y));
}

// Per-entity motion memory for walk cycles and facing (renderer-only, not game state).
const motion = new Map<string, { x: number; y: number; stride: number; moving: number; heading: number }>();
function track(id: string, x: number, y: number, dt: number) {
  const m = motion.get(id);
  if (!m) { const fresh = { x, y, stride: 0, moving: 0, heading: 0 }; motion.set(id, fresh); return fresh; }
  const d = Math.hypot(x - m.x, y - m.y);
  if (d > 0.25 && d < 80) { m.stride += d; m.moving = 0.15; m.heading = Math.atan2(y - m.y, x - m.x); }
  else m.moving = Math.max(0, m.moving - dt);
  m.x = x; m.y = y;
  return m;
}

function drawRotated(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, size: number, angle: number) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.drawImage(img, -size / 2, -size / 2, size, size); ctx.restore();
}

/** Floor, bases and walls never change: render them once into an offscreen layer. */
function staticLayer(img: Sprites): HTMLCanvasElement | null {
  const needed = ['floor', 'vent', 'conduit', 'wall', 'corner', 'baseBlue', 'baseOrange'];
  if (!needed.every(k => ready(img[k]))) return null;
  if (img.__static instanceof HTMLCanvasElement) return img.__static;
  const layer = document.createElement('canvas');
  layer.width = WORLD_W; layer.height = WORLD_H;
  const c = layer.getContext('2d')!;
  for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++) {
    const h = (col * 73 + r * 151) % 23;
    c.drawImage(h === 0 ? img.vent : h === 7 ? img.conduit : img.floor, col * TILE, r * TILE, TILE, TILE);
  }
  for (const team of ['blue', 'orange'] as Team[]) {
    const b = BASES[team];
    for (let y = b.y; y < b.y + b.h; y += TILE) for (let x = b.x; x < b.x + b.w; x += TILE) c.drawImage(team === 'blue' ? img.baseBlue : img.baseOrange, x, y, TILE, TILE);
  }
  for (const w of WALLS) {
    const horizontal = w.w > w.h;
    for (let y = w.y; y < w.y + w.h; y += TILE) for (let x = w.x; x < w.x + w.w; x += TILE) {
      const corner = (x === 0 || x === WORLD_W - TILE) && (y === 0 || y === WORLD_H - TILE);
      if (corner) {
        const angle = x === 0 ? (y === 0 ? 0 : -Math.PI / 2) : (y === 0 ? Math.PI / 2 : Math.PI);
        c.save(); c.translate(x + TILE / 2, y + TILE / 2); c.rotate(angle); c.drawImage(img.corner, -TILE / 2, -TILE / 2, TILE, TILE); c.restore();
      } else if (horizontal) {
        c.save(); c.translate(x + TILE / 2, y + TILE / 2); c.rotate(Math.PI / 2); c.drawImage(img.wall, -TILE / 2, -TILE / 2, TILE, TILE); c.restore();
      } else c.drawImage(img.wall, x, y, TILE, TILE);
    }
  }
  img.__static = layer;
  return layer;
}

export function draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, g: ClashState, cam: Cam,
  effects: Fx[], img: Record<string, HTMLImageElement>, dt: number, now: number, meId: string | null) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#07080f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(cam.scale, 0, 0, cam.scale, canvas.width / 2 - cam.x * cam.scale, canvas.height / 2 - cam.y * cam.scale);
  ctx.imageSmoothingEnabled = true;

  // Floor, bases, walls
  const layer = staticLayer(img as Sprites);
  if (layer) ctx.drawImage(layer, 0, 0);
  else {
    ctx.fillStyle = '#12142b'; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    for (const team of ['blue', 'orange'] as Team[]) { const b = BASES[team]; ctx.fillStyle = team === 'blue' ? 'rgba(47,123,234,.16)' : 'rgba(255,106,43,.16)'; ctx.fillRect(b.x, b.y, b.w, b.h); }
    ctx.fillStyle = '#22264a'; for (const w of WALLS) ctx.fillRect(w.x, w.y, w.w, w.h);
  }

  // Reactors: sprite by owner + capture progress ring
  for (const r of g.reactors) {
    ctx.fillStyle = r.owner ? (r.owner === 'blue' ? 'rgba(47,123,234,.14)' : 'rgba(255,106,43,.14)') : 'rgba(154,156,192,.06)';
    ctx.beginPath(); ctx.arc(r.x, r.y, REACTOR_R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(154,156,192,.3)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.stroke(); ctx.setLineDash([]);
    if (r.control !== 0) {
      ctx.strokeStyle = r.control < 0 ? TEAM_COLOR.blue : TEAM_COLOR.orange;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(r.x, r.y, REACTOR_R - 4, -Math.PI / 2, -Math.PI / 2 + Math.abs(r.control) * Math.PI * 2); ctx.stroke();
    }
    const sprite = r.owner === 'blue' ? img.reactorBlue : r.owner === 'orange' ? img.reactorOrange : img.reactorNeutral;
    const pulse = r.owner ? 1 + 0.04 * Math.sin(now / 250) : 1;
    if (ready(sprite)) { const sz = 96 * pulse; ctx.drawImage(sprite, r.x - sz / 2, r.y - sz / 2, sz, sz); }
    else { ctx.fillStyle = r.owner ? TEAM_COLOR[r.owner] : '#9a9cc0'; ctx.beginPath(); ctx.arc(r.x, r.y, 20, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#f2f2fa'; ctx.font = '800 12px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(r.id.toUpperCase(), r.x, r.y + REACTOR_R + 16);
  }

  // Terminals
  const me = meId ? g.players[meId] : undefined;
  for (const term of g.terminals) {
    const locked = !!me && terminalLocked(g, me, term.id);
    const near = !!me && !locked && Math.hypot(me.x - term.x, me.y - term.y) < 56;
    const sprite = locked ? img.termIdle : img.termActive;
    ctx.save();
    if (near) { ctx.shadowColor = '#6e5bff'; ctx.shadowBlur = 24; }
    if (locked) ctx.globalAlpha = 0.5;
    if (ready(sprite)) ctx.drawImage(sprite, term.x - 36, term.y - 36, 72, 72);
    else { ctx.fillStyle = locked ? '#3a3d5c' : '#6e5bff'; ctx.fillRect(term.x - 17, term.y - 17, 34, 34); }
    ctx.restore();
    if (near) { ctx.fillStyle = '#ffffff'; ctx.font = '900 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText('E', term.x, term.y - 30); }
  }

  // Energy orbs
  for (const o of g.orbs) {
    const bob = Math.sin(now / 200 + o.id) * 3;
    if (ready(img.orb)) ctx.drawImage(img.orb, o.x - 16, o.y - 16 + bob, 32, 32);
    else { ctx.fillStyle = '#f2b530'; ctx.beginPath(); ctx.arc(o.x, o.y + bob, 8, 0, Math.PI * 2); ctx.fill(); }
  }

  // Minions (face the reactor they are heading for)
  for (const m of g.minions) {
    const target = g.reactors.filter(r => r.owner).sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y))[0] ?? g.reactors[1];
    const angle = Math.atan2(target.y - m.y, target.x - m.x) + Math.PI / 2;
    if (ready(img.minion)) drawRotated(ctx, img.minion, m.x, m.y, 44, angle);
    else { ctx.fillStyle = '#ff6a2b'; ctx.beginPath(); ctx.arc(m.x, m.y, 14, 0, Math.PI * 2); ctx.fill(); }
    if (m.hp < 2) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(m.x, m.y, 22, 0, Math.PI * 2); ctx.stroke(); }
  }

  // Boss
  if (g.boss) {
    const b = g.boss, hurt = b.hp < BOSS_HP / 2;
    const pic = hurt ? img.bossHurt : img.boss;
    const mb = track('__boss', b.x, b.y, dt);
    ctx.save();
    ctx.shadowColor = '#ff6a2b'; ctx.shadowBlur = hurt ? 18 + 12 * Math.sin(now / 90) : 30;
    if (ready(img.bossTop)) drawRotated(ctx, img.bossTop, b.x, b.y, 150, mb.heading + Math.PI / 2);
    else if (ready(pic)) ctx.drawImage(pic, b.x - 70, b.y - 80, 140, 140);
    else { ctx.fillStyle = '#ff6a2b'; ctx.beginPath(); ctx.arc(b.x, b.y, 44, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    const left = Math.max(0, (b.pulseAt - g.t) / 3.5);
    ctx.strokeStyle = `rgba(255,106,43,${0.15 + (1 - left) * 0.5})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(b.x, b.y, 110, 0, Math.PI * 2); ctx.stroke();
  }

  // Shots
  for (const sh of g.shots) {
    const angle = Math.atan2(sh.vy, sh.vx) + Math.PI / 2;
    ctx.save(); ctx.shadowColor = TEAM_COLOR[sh.team]; ctx.shadowBlur = 14;
    if (ready(img.shot)) drawRotated(ctx, img.shot, sh.x, sh.y, 34, angle);
    else { ctx.strokeStyle = TEAM_COLOR[sh.team]; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(sh.x - sh.vx * 0.03, sh.y - sh.vy * 0.03); ctx.stroke(); }
    ctx.restore();
  }

  // Players
  for (const p of Object.values(g.players)) {
    if (!p.alive) continue;
    const mine = p.id === meId;
    // team ring under the operative (white for you)
    ctx.strokeStyle = mine ? '#ffffff' : TEAM_COLOR[p.team]; ctx.lineWidth = mine ? 3 : 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_R + 6, 0, Math.PI * 2); ctx.stroke();
    // energy arc
    ctx.strokeStyle = '#f2b530'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_R + 10, -Math.PI / 2, -Math.PI / 2 + (p.energy / MAX_ENERGY) * Math.PI * 2); ctx.stroke();
    const m = track(p.id, p.x, p.y, dt);
    const term = p.answering ? g.terminals.find(t => t.id === p.answering) : undefined;
    let sprite = img[p.team], facing = p.aim + Math.PI / 2;
    if (term) { sprite = img[`${p.team}Answer`] ?? sprite; facing = Math.atan2(term.y - p.y, term.x - p.x) + Math.PI / 2; }
    else if (m.moving > 0) { const frame = 1 + (Math.floor(m.stride / 14) % 4); sprite = img[`${p.team}Walk${frame}`] ?? sprite; }
    if (!ready(sprite)) sprite = img[p.team];
    if (ready(sprite)) drawRotated(ctx, sprite, p.x, p.y, 54, facing);
    else { ctx.fillStyle = TEAM_COLOR[p.team]; ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_R, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = mine ? '#ffffff' : '#c9cbe6'; ctx.font = `${mine ? 800 : 600} 12px system-ui`; ctx.textAlign = 'center';
    ctx.fillText(p.answering ? `${p.name} · answering` : p.name, p.x, p.y - PLAYER_R - 16);
    if (p.answering) {
      ctx.strokeStyle = '#6e5bff'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_R + 15, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // Effects
  for (const e of effects) {
    e.life -= dt * 1.6; e.r += dt * 120;
    ctx.globalAlpha = Math.max(0, e.life);
    const sprite = e.kind === 'spark' ? img.spark : e.kind === 'pulse' ? img.pulse : undefined;
    if (ready(sprite)) { const sz = e.kind === 'pulse' ? e.r * 2 + 40 : 56; ctx.drawImage(sprite, e.x - sz / 2, e.y - sz / 2, sz, sz); }
    else { ctx.strokeStyle = e.color; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
  for (let i = effects.length - 1; i >= 0; i--) if (effects[i].life <= 0) effects.splice(i, 1);
}
