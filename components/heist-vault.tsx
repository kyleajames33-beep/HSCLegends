'use client';

import { HEIST_BOARD as B } from '@/lib/heist';

// Enhanced vault visualization: stone chambers, animated lasers, character sprite
export function VaultBoard({
  tSec,
  teamColor,
  grabbed,
  raiderX,
  raiderY,
  raiderAlias,
  grabProgress,
  detectionProgress,
  children,
  onPointerMove,
  onClick,
}: {
  tSec: number;
  teamColor: string; // '#c47b8a' (Crimson) or '#8a86d6' (Violet)
  grabbed: number[];
  raiderX: number;
  raiderY: number;
  raiderAlias?: string;
  grabProgress?: number; // 0-1
  detectionProgress?: number; // 0-1
  children: React.ReactNode;
  onPointerMove?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onClick?: (e: React.MouseEvent<SVGSVGElement>) => void;
}) {
  // Laser animations (deterministic, synced to wall-clock time)
  const l1x = (t: number) => 50 + 33 * Math.sin(t * 0.9);
  const l2a = (t: number) => t * 1.1;
  const l3a = (t: number) => -t * 1.6;

  const beam2 = l2a(tSec);
  const beam3 = l3a(tSec);

  // Color variants for different team vaults
  const isCrimson = teamColor === '#c47b8a';
  const vaultGradient = isCrimson
    ? 'linear-gradient(135deg, #2a1f2a 0%, #3d2833 50%, #5c3a4a 100%)'
    : 'linear-gradient(135deg, #1f1f3a 0%, #2d2845 50%, #4a3a5c 100%)';

  return (
    <svg
      viewBox="0 0 100 100"
      className="mt-2 w-full aspect-square rounded-xl select-none touch-none"
      style={{
        background: vaultGradient,
        cursor: onClick ? 'crosshair' : 'default',
        filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.6))',
      }}
      onPointerMove={onPointerMove}
      onClick={onClick}
    >
      <defs>
        {/* Stone texture pattern */}
        <pattern id="stoneTexture" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="10" height="10" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
          <circle cx="2" cy="2" r="0.3" fill="rgba(255,255,255,0.03)" />
          <circle cx="7" cy="5" r="0.2" fill="rgba(255,255,255,0.02)" />
          <circle cx="4" cy="8" r="0.25" fill="rgba(255,255,255,0.03)" />
        </pattern>

        {/* Clip paths for room layering */}
        <clipPath id="room2clip">
          <rect x="0" y="39" width="100" height="22" />
        </clipPath>
        <clipPath id="room3clip">
          <rect x="0" y="0" width="100" height="37" />
        </clipPath>

        {/* Glow filter for lasers */}
        <filter id="laserGlow">
          <feGaussianBlur stdDeviation="1.2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Chamber lighting: soft glow from room center */}
        <radialGradient id="room1Light" cx="50%" cy="50%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.01)" />
        </radialGradient>
        <radialGradient id="room2Light" cx="50%" cy="50%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.005)" />
        </radialGradient>
        <radialGradient id="room3Light" cx="50%" cy="30%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.07)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>

      {/* Chamber ambient lighting */}
      <rect x="0" y="62" width="100" height="24" fill="url(#room1Light)" />
      <rect x="0" y="39" width="100" height="23" fill="url(#room2Light)" />
      <rect x="0" y="0" width="100" height="39" fill="url(#room3Light)" />

      {/* Stone texture overlay */}
      <rect x="0" y="0" width="100" height="100" fill="url(#stoneTexture)" />

      {/* Vault door / entry frame */}
      <g>
        {/* Frame */}
        <rect x="10" y={B.entryY} width="80" height={100 - B.entryY} fill="none" stroke="#ffd34d" strokeWidth="1.2" opacity="0.4" rx="2" />
        {/* Reinforced corners */}
        <line x1="12" y1={B.entryY + 2} x2="12" y2={B.entryY + 6} stroke="#ffd34d" strokeWidth="0.8" opacity="0.6" />
        <line x1="88" y1={B.entryY + 2} x2="88" y2={B.entryY + 6} stroke="#ffd34d" strokeWidth="0.8" opacity="0.6" />
        {/* Entry label */}
        <text x="50" y={B.entryY + 10} textAnchor="middle" fontSize="2.8" fill="#8a94b8" fontWeight="700" opacity="0.7">
          ▼ ENTRY / ESCAPE ▼
        </text>
      </g>

      {/* Wall geometry — darker than rooms, with edge highlights */}
      {B.walls.map((w, i) => (
        <g key={i}>
          {/* Wall shadow */}
          <rect x={w.x} y={w.y} width={w.w} height={w.h} rx="0.8" fill="#1a1d2e" opacity="0.8" />
          {/* Wall stroke (edge highlight) */}
          <rect
            x={w.x}
            y={w.y}
            width={w.w}
            height={w.h}
            rx="0.8"
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="0.5"
          />
        </g>
      ))}

      {/* Gold pads — loot targets */}
      {B.pads.map((p, i) => {
        const isGrabbed = grabbed.includes(i);
        return isGrabbed ? (
          // Cracked pad (looted)
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={B.padR} fill="#2a2d45" opacity="0.5" />
            <circle cx={p.x} cy={p.y} r={B.padR} fill="none" stroke="#3c4266" strokeWidth="0.6" strokeDasharray="1.4 1.2" />
            <text x={p.x} y={p.y + 1.3} textAnchor="middle" fontSize="3" fontWeight="700" fill="#3c4266" opacity="0.6">
              ✓
            </text>
          </g>
        ) : (
          // Active pad (glowing loot)
          <g key={i}>
            {/* Outer glow */}
            <circle cx={p.x} cy={p.y} r={B.padR + 0.8} fill={teamColor} opacity="0.12" />
            {/* Pad body */}
            <circle cx={p.x} cy={p.y} r={B.padR} fill="#d6a85f" opacity="0.95" />
            {/* Shine/highlight */}
            <circle cx={p.x - 0.6} cy={p.y - 0.6} r={B.padR * 0.35} fill="rgba(255,255,255,0.3)" />
            {/* Border */}
            <circle cx={p.x} cy={p.y} r={B.padR} fill="none" stroke="#ffd34d" strokeWidth="0.8" opacity="0.8" />
            {/* Label */}
            <text x={p.x} y={p.y + 1.3} textAnchor="middle" fontSize="3.4" fontWeight="800" fill="#3d2700">
              {p.pct}%
            </text>
          </g>
        );
      })}

      {/* Lasers — animated hazards with glow */}
      <g filter="url(#laserGlow)">
        {/* Room 1: horizontal sweep */}
        <g stroke="#ff5555" strokeLinecap="round">
          <line x1={l1x(tSec)} y1={63.5} x2={l1x(tSec)} y2={B.entryY - 1.5} strokeWidth="3.2" opacity="0.35" />
          <line x1={l1x(tSec)} y1={63.5} x2={l1x(tSec)} y2={B.entryY - 1.5} strokeWidth="1.2" opacity="1" />
        </g>

        {/* Room 2: rotating beam */}
        <g clipPath="url(#room2clip)" stroke="#ff5555" strokeLinecap="round">
          <line x1={50} y1={50} x2={50 + 20 * Math.cos(beam2)} y2={50 + 20 * Math.sin(beam2)} strokeWidth="3.2" opacity="0.35" />
          <line x1={50} y1={50} x2={50 + 20 * Math.cos(beam2)} y2={50 + 20 * Math.sin(beam2)} strokeWidth="1.2" opacity="1" />
        </g>

        {/* Room 3: twin rotating beams */}
        <g clipPath="url(#room3clip)" stroke="#ff5555" strokeLinecap="round">
          {[beam3, beam3 + Math.PI].map((a, i) => (
            <g key={i}>
              <line x1={50} y1={20} x2={50 + 15 * Math.cos(a)} y2={20 + 15 * Math.sin(a)} strokeWidth="3.2" opacity="0.35" />
              <line x1={50} y1={20} x2={50 + 15 * Math.cos(a)} y2={20 + 15 * Math.sin(a)} strokeWidth="1.2" opacity="1" />
            </g>
          ))}
        </g>

        {/* Laser emitter points */}
        <circle cx={50} cy={50} r={1.4} fill="#ff8a8a" opacity="0.9" />
        <circle cx={50} cy={50} r={0.6} fill="#ffcccc" opacity="0.8" />
        <circle cx={50} cy={20} r={1.4} fill="#ff8a8a" opacity="0.9" />
        <circle cx={50} cy={20} r={0.6} fill="#ffcccc" opacity="0.8" />
      </g>

      {/* Raider character — shows current position during a raid */}
      {/* Placeholder: toon character sprite, 3x3 unit box */}
      <g>
        {/* Character body (simple toon silhouette) */}
        <circle cx={raiderX} cy={raiderY} r={B.playerR} fill="#fff" stroke="#16182a" strokeWidth="0.8" />
        {/* Glow when carrying loot */}
        {grabbed.length > 0 && (
          <circle cx={raiderX} cy={raiderY} r={B.playerR + 1} fill="none" stroke="#ffd34d" strokeWidth="0.9" opacity="0.8" />
        )}
        {/* Detection halo (spotlight) */}
        {detectionProgress && detectionProgress > 0 && (
          <circle
            cx={raiderX}
            cy={raiderY}
            r={B.playerR + 2.2}
            fill="none"
            stroke="#ff5555"
            strokeWidth="1"
            strokeDasharray={`${(detectionProgress / 1) * 2 * Math.PI * (B.playerR + 2.2)} 999`}
            opacity="0.8"
          />
        )}
        {/* Grabbing progress ring */}
        {grabProgress && grabProgress > 0 && grabProgress < 1 && (
          <circle
            cx={raiderX}
            cy={raiderY}
            r={B.playerR + 1.4}
            fill="none"
            stroke="#ffd34d"
            strokeWidth="1.4"
            strokeDasharray={`${grabProgress * 2 * Math.PI * (B.playerR + 1.4)} 999`}
            opacity="0.9"
          />
        )}
      </g>

      {/* Children: sentries, intruders, spotlight, etc. */}
      {children}
    </svg>
  );
}
