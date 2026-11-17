// Canvas 2D renderer for Reactor Clash, shared by practice, student and projector views.
import { terminalLocked, BASES, BOSS_HP, MAX_ENERGY, PLAYER_R, REACTOR_R, TILE, WALLS, WORLD_H, WORLD_W, type ClashState, type Team } from '@/lib/clash/sim';

export const TEAM_COLOR: Record<Team, string> = { blue: '#2f7bea', orange: '#ff6a2b' };
export type Fx = { x: number; y: number; r: number; life: number; color: string };
export type Cam = { x: number; y: number; scale: number };

/** Preload decorative sprites; shapes are drawn until they load. */
export function loadSprites(): Record<string, HTMLImageElement> {
  const out: Record<string, HTMLImageElement> = {};
  for (const [k, src] of Object.entries({ boss: '/art/bosses/chemistry-boss-idle.webp', bossHurt: '/art/bosses/chemistry-boss-hurt.webp', minion: '/art/icons/subject-chemistry.webp', orb: '/art/icons/spark.webp' })) {
    const img = new Image(); img.src = src; out[k] = img;
  }
  return out;
}

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

export function draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, g: ClashState, cam: { x: number; y: number; scale: number },
  effects: Fx[], img: Record<string, HTMLImageElement>, dt: number, now: number, meId: string | null) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#07080f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(cam.scale, 0, 0, cam.scale, canvas.width / 2 - cam.x * cam.scale, canvas.height / 2 - cam.y * cam.scale);

  // Floor + grid
  ctx.fillStyle = '#12142b';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.strokeStyle = 'rgba(154,156,192,.07)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= WORLD_W; x += TILE) { ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_H); }
  for (let y = 0; y <= WORLD_H; y += TILE) { ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); }
  ctx.stroke();

  // Bases
  for (const team of ['blue', 'orange'] as Team[]) {
    const b = BASES[team];
    ctx.fillStyle = team === 'blue' ? 'rgba(47,123,234,.16)' : 'rgba(255,106,43,.16)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = TEAM_COLOR[team];
    ctx.setLineDash([8, 8]); ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.setLineDash([]);
  }

  // Walls
  for (const w of WALLS) {
    ctx.fillStyle = '#22264a';
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = '#2e3366';
    ctx.fillRect(w.x, w.y, w.w, Math.min(8, w.h));
    ctx.strokeStyle = '#07080f'; ctx.lineWidth = 2; ctx.strokeRect(w.x, w.y, w.w, w.h);
  }

  // Reactors
  for (const r of g.reactors) {
    const owner = r.owner ? TEAM_COLOR[r.owner] : '#9a9cc0';
    ctx.fillStyle = r.owner ? (r.owner === 'blue' ? 'rgba(47,123,234,.18)' : 'rgba(255,106,43,.18)') : 'rgba(154,156,192,.08)';
    ctx.beginPath(); ctx.arc(r.x, r.y, REACTOR_R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(154,156,192,.35)'; ctx.lineWidth = 2; ctx.stroke();
    if (r.control !== 0) {
      ctx.strokeStyle = r.control < 0 ? TEAM_COLOR.blue : TEAM_COLOR.orange;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(r.x, r.y, REACTOR_R - 4, -Math.PI / 2, -Math.PI / 2 + Math.abs(r.control) * Math.PI * 2); ctx.stroke();
    }
    const pulse = 0.6 + 0.4 * Math.sin(now / 300);
    ctx.fillStyle = owner;
    ctx.globalAlpha = r.owner ? pulse : 0.7;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; ctx.lineTo(r.x + Math.cos(a) * 20, r.y + Math.sin(a) * 20); }
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#07080f'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#f2f2fa'; ctx.font = '700 12px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(r.id.toUpperCase(), r.x, r.y + REACTOR_R + 16);
  }

  // Terminals
  const me = meId ? g.players[meId] : undefined;
  for (const term of g.terminals) {
    const locked = me && terminalLocked(g, me, term.id);
    const near = me && !locked && Math.hypot(me.x - term.x, me.y - term.y) < 56;
    ctx.fillStyle = locked ? '#3a3d5c' : '#6e5bff';
    ctx.shadowColor = locked ? 'transparent' : '#6e5bff';
    ctx.shadowBlur = near ? 26 : 12;
    ctx.beginPath(); ctx.roundRect(term.x - 17, term.y - 17, 34, 34, 7); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#07080f'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '900 18px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(locked ? '×' : '?', term.x, term.y + 1);
    ctx.textBaseline = 'alphabetic';
  }

  // Orbs
  for (const o of g.orbs) {
    const bob = Math.sin(now / 200 + o.id) * 3;
    if (img.orb?.complete) ctx.drawImage(img.orb, o.x - 12, o.y - 12 + bob, 24, 24);
    else { ctx.fillStyle = '#f2b530'; ctx.beginPath(); ctx.arc(o.x, o.y + bob, 8, 0, Math.PI * 2); ctx.fill(); }
  }

  // Minions
  for (const m of g.minions) {
    if (img.minion?.complete) ctx.drawImage(img.minion, m.x - 18, m.y - 18, 36, 36);
    else { ctx.fillStyle = '#ff6a2b'; ctx.beginPath(); ctx.arc(m.x, m.y, 14, 0, Math.PI * 2); ctx.fill(); }
    if (m.hp < 2) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(m.x, m.y, 20, 0, Math.PI * 2); ctx.stroke(); }
  }

  // Boss
  if (g.boss) {
    const b = g.boss, hurt = b.hp < BOSS_HP / 2;
    const pic = hurt ? img.bossHurt : img.boss;
    ctx.save();
    ctx.shadowColor = '#ff6a2b'; ctx.shadowBlur = 30;
    if (pic?.complete) ctx.drawImage(pic, b.x - 70, b.y - 80, 140, 140);
    else { ctx.fillStyle = '#ff6a2b'; ctx.beginPath(); ctx.arc(b.x, b.y, 44, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    const left = Math.max(0, (b.pulseAt - g.t) / 3.5);
    ctx.strokeStyle = `rgba(255,106,43,${0.15 + (1 - left) * 0.5})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(b.x, b.y, 110, 0, Math.PI * 2); ctx.stroke();
  }

  // Shots
  for (const sh of g.shots) {
    ctx.strokeStyle = TEAM_COLOR[sh.team]; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.shadowColor = TEAM_COLOR[sh.team]; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(sh.x - sh.vx * 0.03, sh.y - sh.vy * 0.03); ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Players
  for (const p of Object.values(g.players)) {
    if (!p.alive) continue;
    const c = TEAM_COLOR[p.team];
    // aim barrel
    ctx.strokeStyle = '#07080f'; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(p.aim) * 26, p.y + Math.sin(p.aim) * 26); ctx.stroke();
    ctx.strokeStyle = '#f2f2fa'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(p.aim) * 25, p.y + Math.sin(p.aim) * 25); ctx.stroke();
    // body
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = p.id === meId ? '#ffffff' : '#07080f'; ctx.lineWidth = p.id === meId ? 4 : 3; ctx.stroke();
    // energy ring
    ctx.strokeStyle = '#f2b530'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_R + 5, -Math.PI / 2, -Math.PI / 2 + (p.energy / MAX_ENERGY) * Math.PI * 2); ctx.stroke();
    // label
    ctx.fillStyle = p.id === meId ? '#ffffff' : '#c9cbe6'; ctx.font = `${p.id === meId ? 800 : 600} 12px system-ui`; ctx.textAlign = 'center';
    ctx.fillText(p.answering ? `${p.name} · answering` : p.name, p.x, p.y - PLAYER_R - 10);
    if (p.answering) {
      ctx.strokeStyle = '#6e5bff'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER_R + 11, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // Effects
  for (const e of effects) {
    e.life -= dt * 1.6; e.r += dt * 120;
    ctx.globalAlpha = Math.max(0, e.life);
    ctx.strokeStyle = e.color; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (let i = effects.length - 1; i >= 0; i--) if (effects[i].life <= 0) effects.splice(i, 1);
}
