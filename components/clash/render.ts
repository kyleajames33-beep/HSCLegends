// Canvas 2D renderer for Reactor Clash, shared by practice, student and projector views.
// Uses the locked-style top-down art in /public/art/arena (all sprites face north),
// falling back to simple shapes while images load.
import { terminalLocked, BASES, BOSS_HP, MAX_ENERGY, PLAYER_R, REACTOR_R, TILE, WALLS, WORLD_H, WORLD_W, type ClashState, type Player, type Team } from '@/lib/clash/sim';

export const TEAM_COLOR: Record<Team, string> = { blue: '#2f7bea', orange: '#ff6a2b' };
export type Fx = { x: number; y: number; r: number; life: number; color: string; kind?: 'ring' | 'spark' | 'pulse' };
export type Cam = { x: number; y: number; scale: number };
type Sprites = Record<string, HTMLImageElement>;
const staticLayers = new WeakMap<Sprites, { layer: HTMLCanvasElement; wallArtReady: boolean }>();
const INK = '#0e1020';
const OPERATIVE_SIZE = 78;

const A = '/art/arena';
const SPRITES: Record<string, string> = {
  wall: `${A}/tiles/wall-straight.webp`, corner: `${A}/tiles/wall-corner.webp`,
  termIdle: `${A}/objects/question-terminal-idle.webp`, termActive: `${A}/objects/question-terminal-active.webp`,
  reactorNeutral: `${A}/objects/reactor-neutral.webp`, reactorBlue: `${A}/objects/reactor-blue.webp`, reactorOrange: `${A}/objects/reactor-orange.webp`,
  orb: `${A}/objects/energy-pickup.webp`,
  blue: `${A}/players/operative-blue.webp`, orange: `${A}/players/operative-orange.webp`,
  blueAnswer: `${A}/players/operative-blue-answering.webp`, orangeAnswer: `${A}/players/operative-orange-answering.webp`,
  ...Object.fromEntries((['blue', 'orange'] as const).flatMap(t => [1, 2, 3, 4].map(i => [`${t}Walk${i}`, `${A}/players/operative-${t}-walk-${i}.webp`]))),
  shot: `${A}/fx/neutraliser-projectile.webp`, spark: `${A}/fx/hit-spark.webp`, pulse: `${A}/fx/capture-pulse-ring.webp`,
};

export type ClashSubject = 'biology' | 'chemistry' | 'physics' | 'maths-standard' | 'maths-advanced' | 'maths-ext1';
export const CLASH_SUBJECTS: ClashSubject[] = ['biology', 'chemistry', 'physics', 'maths-standard', 'maths-advanced', 'maths-ext1'];
export const isClashSubject = (v: unknown): v is ClashSubject => typeof v === 'string' && (CLASH_SUBJECTS as string[]).includes(v);
const artName = (s: ClashSubject) => (s === 'maths-ext1' ? 'maths-extension-1' : s);

/** Preload sprites (boss and minions match the match's subject); shapes are drawn until each loads. */
export function loadSprites(subject: ClashSubject = 'chemistry'): Record<string, HTMLImageElement> {
  const n = artName(subject);
  const all: Record<string, string> = {
    ...SPRITES,
    minion: `${A}/minions/${n}-minion.webp`, bossTop: `${A}/boss/${n}-boss-topdown.webp`,
    boss: `/art/bosses/${n}-boss-idle.webp`, bossHurt: `/art/bosses/${n}-boss-hurt.webp`,
  };
  const out: Record<string, HTMLImageElement> = {};
  for (const [k, src] of Object.entries(all)) { const img = new Image(); img.src = src; out[k] = img; }
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
function staticLayer(img: Sprites): HTMLCanvasElement {
  const wallArtReady = ready(img.wall) && ready(img.corner);
  const cached = staticLayers.get(img);
  if (cached && cached.wallArtReady === wallArtReady) return cached.layer;
  const layer = document.createElement('canvas');
  layer.width = WORLD_W; layer.height = WORLD_H;
  const c = layer.getContext('2d')!;
  c.fillStyle = '#93a7b2';
  c.fillRect(0, 0, WORLD_W, WORLD_H);
  // Wide staggered plates leave a quiet field behind moving pieces.
  const width = 4 * TILE, height = 2 * TILE;
  c.strokeStyle = '#859ba7';
  c.lineWidth = 1;
  c.beginPath();
  for (let y = 0, row = 0; y < WORLD_H; y += height, row++) {
    c.moveTo(0, y); c.lineTo(WORLD_W, y);
    for (let x = (row % 2) * width / 2; x < WORLD_W; x += width) {
      c.moveTo(x, y); c.lineTo(x, y + height);
    }
  }
  c.stroke();
  // One team-coloured launch pad per spawn, facing into the arena.
  for (const team of ['blue', 'orange'] as const) {
    const b = BASES[team];
    const blue = team === 'blue';
    c.save();
    c.translate(blue ? b.x : b.x + b.w, b.y);
    c.scale(blue ? 1 : -1, 1);
    c.fillStyle = blue ? '#7698b8' : '#b69b87';
    c.beginPath(); c.moveTo(0, 0); c.lineTo(b.w - 18, 0); c.lineTo(b.w, 18);
    c.lineTo(b.w, b.h - 18); c.lineTo(b.w - 18, b.h); c.lineTo(0, b.h); c.closePath(); c.fill();
    c.fillStyle = TEAM_COLOR[team]; c.fillRect(0, 0, 7, b.h);
    c.strokeStyle = blue ? '#527697' : '#916f58'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(b.w - 28, b.h / 2 - 12); c.lineTo(b.w - 16, b.h / 2);
    c.lineTo(b.w - 28, b.h / 2 + 12); c.stroke();
    c.restore();
  }
  for (const w of WALLS) {
    c.fillStyle = '#30394d'; c.fillRect(w.x, w.y, w.w, w.h);
    if (!wallArtReady) continue;
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
  staticLayers.set(img, { layer, wallArtReady });
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
  ctx.drawImage(staticLayer(img), 0, 0);

  // Reactors: sprite by owner + capture progress ring
  for (const r of g.reactors) {
    ctx.fillStyle = r.owner ? (r.owner === 'blue' ? 'rgba(47,123,234,.14)' : 'rgba(255,106,43,.14)') : 'rgba(154,156,192,.06)';
    ctx.beginPath(); ctx.arc(r.x, r.y, REACTOR_R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(31,49,69,.55)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.stroke(); ctx.setLineDash([]);
    if (r.control !== 0) {
      ctx.strokeStyle = r.control < 0 ? TEAM_COLOR.blue : TEAM_COLOR.orange;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(r.x, r.y, REACTOR_R - 4, -Math.PI / 2, -Math.PI / 2 + Math.abs(r.control) * Math.PI * 2); ctx.stroke();
    }
    const sprite = r.owner === 'blue' ? img.reactorBlue : r.owner === 'orange' ? img.reactorOrange : img.reactorNeutral;
    const pulse = r.owner ? 1 + 0.04 * Math.sin(now / 250) : 1;
    if (ready(sprite)) { const sz = 96 * pulse; ctx.drawImage(sprite, r.x - sz / 2, r.y - sz / 2, sz, sz); }
    else { ctx.fillStyle = r.owner ? TEAM_COLOR[r.owner] : '#9a9cc0'; ctx.beginPath(); ctx.arc(r.x, r.y, 20, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = INK; ctx.font = '800 13px system-ui'; ctx.textAlign = 'center';
    const labelY = r.y + REACTOR_R + 16;
    ctx.fillText(r.id.toUpperCase(), r.x, labelY > WORLD_H - TILE ? r.y - REACTOR_R - 5 : labelY);
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
    if (near) { ctx.fillStyle = '#ffffff'; ctx.font = '900 13px system-ui'; ctx.textAlign = 'center'; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.strokeText('E', term.x, term.y - 30); ctx.fillText('E', term.x, term.y - 30); }
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
    ctx.shadowColor = '#f2f2fa'; ctx.shadowBlur = hurt ? 18 + 12 * Math.sin(now / 90) : 30;
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

  // Effects
  for (const e of effects) {
    e.life -= dt * 1.6; e.r += dt * 120;
    ctx.globalAlpha = Math.max(0, e.life);
    const sprite = e.kind === 'spark' ? img.spark : e.kind === 'pulse' ? img.pulse : undefined;
    if (ready(sprite)) { const sz = e.kind === 'pulse' ? e.r * 2 + 40 : 56; ctx.drawImage(sprite, e.x - sz / 2, e.y - sz / 2, sz, sz); }
    else { ctx.strokeStyle = e.color; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.stroke(); }
  }
  ctx.globalAlpha = 1;

  function drawPlayer(p: Player, mine: boolean) {
    if (!p.alive) return;
    const ring = PLAYER_R + 10;
    ctx.beginPath(); ctx.arc(p.x, p.y, ring, 0, Math.PI * 2);
    ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = TEAM_COLOR[p.team]; ctx.lineWidth = 3; ctx.stroke();
    if (p.energy > 0) {
      ctx.beginPath(); ctx.arc(p.x, p.y, ring + 5, -Math.PI / 2, -Math.PI / 2 + (p.energy / MAX_ENERGY) * Math.PI * 2);
      ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = '#f2b530'; ctx.lineWidth = 2; ctx.stroke();
    }
    const m = track(p.id, p.x, p.y, dt);
    const term = p.answering ? g.terminals.find(t => t.id === p.answering) : undefined;
    let sprite = img[p.team], facing = p.aim + Math.PI / 2;
    if (p.answering) {
      sprite = img[`${p.team}Answer`] ?? sprite;
      if (term) facing = Math.atan2(term.y - p.y, term.x - p.x) + Math.PI / 2;
    } else if (m.moving > 0) { const frame = 1 + (Math.floor(m.stride / 14) % 4); sprite = img[`${p.team}Walk${frame}`] ?? sprite; }
    if (!ready(sprite)) sprite = img[p.team];
    if (ready(sprite)) drawRotated(ctx, sprite, p.x, p.y, OPERATIVE_SIZE, facing);
    else { ctx.fillStyle = TEAM_COLOR[p.team]; ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_R, 0, Math.PI * 2); ctx.fill(); }
    if (p.answering) {
      ctx.strokeStyle = '#6e5bff'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(p.x, p.y, ring + 9, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.textAlign = 'center';
    if (mine) {
      const label = p.answering ? 'YOU · ANSWERING' : 'YOU';
      ctx.font = '900 13px system-ui';
      const half = Math.ceil(ctx.measureText(label).width / 2) + 8;
      // At the north edge, put the pointer below the player, clear of the scoreboard.
      const side = p.y < 3 * TILE ? 1 : -1;
      const edge = p.y + side * (ring + 16), back = edge + side * 17;
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(p.x - half, back); ctx.lineTo(p.x + half, back);
      ctx.lineTo(p.x + half, edge); ctx.lineTo(p.x + 6, edge); ctx.lineTo(p.x, edge - side * 8);
      ctx.lineTo(p.x - 6, edge); ctx.lineTo(p.x - half, edge); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.fillText(label, p.x, Math.max(edge, back) - 4);
    } else {
      const name = p.answering ? `${p.name} · answering` : p.name;
      ctx.font = '700 15px system-ui'; ctx.lineJoin = 'round';
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeText(name, p.x, p.y - ring - 12);
      ctx.fillStyle = '#ffffff'; ctx.fillText(name, p.x, p.y - ring - 12);
    }
  }
  for (const p of Object.values(g.players)) if (p.id !== meId) drawPlayer(p, false);
  if (me) drawPlayer(me, true);
  for (let i = effects.length - 1; i >= 0; i--) if (effects[i].life <= 0) effects.splice(i, 1);
}
