import Image from 'next/image';
import type { BossState, BossSubject } from '@/lib/live-game';
import s from './live.module.css';

export const BOSSES: Record<BossSubject, { name: string; subject: string; art: string; accent: string }> = {
  'biology': { name: 'The Mutagen', subject: 'Biology', art: '/art/bosses/biology', accent: '#1fb070' },
  'chemistry': { name: 'Reactor Prime', subject: 'Chemistry', art: '/art/bosses/chemistry', accent: '#ff6a2b' },
  'physics': { name: 'The Singularity', subject: 'Physics', art: '/art/bosses/physics', accent: '#2f7bea' },
  'maths-standard': { name: 'The Arbiter', subject: 'Maths Standard', art: '/art/bosses/maths-standard', accent: '#f2b530' },
  'maths-advanced': { name: 'Prism', subject: 'Maths Advanced', art: '/art/bosses/maths-advanced', accent: '#9b5cff' },
  'maths-ext1': { name: 'The Fractal', subject: 'Maths Extension 1', art: '/art/bosses/maths-extension-1', accent: '#e8447f' },
};
export const BOSS_ORDER = Object.keys(BOSSES) as BossSubject[];

export function bossLeft(boss: BossState): number | null {
  return boss.hp === null ? null : Math.max(0, boss.hp - boss.damage);
}

/** Health bar only (compact, for question screens). */
export function BossBar({ boss, showName = true }: { boss: BossState; showName?: boolean }) {
  const meta = BOSSES[boss.subject], left = bossLeft(boss);
  const pct = boss.hp && left !== null ? (left / boss.hp) * 100 : 100;
  return (
    <div className={`${s.bossBar} ${showName ? '' : s.bossBarBare}`} style={{ ['--accent' as string]: meta.accent }}>
      {showName && <span className={s.bossBarName}>{meta.name}</span>}
      <span className={s.hpTrack}><span className={s.hpFill} style={{ width: `${pct}%` }} /></span>
      <span className={s.bossBarHp}>{left === null ? '' : `${left.toLocaleString()} HP`}</span>
    </div>
  );
}

/** Boss art + health. `hit` shows this round's damage with a shake. */
export function BossPanel({ boss, size = 260, hit = false, caption }: { boss: BossState; size?: number; hit?: boolean; caption?: string }) {
  const meta = BOSSES[boss.subject], left = bossLeft(boss);
  const defeated = left === 0;
  const hurt = !defeated && left !== null && boss.hp !== null && left / boss.hp < 0.5;
  const pose = defeated ? 'defeated' : hurt ? 'hurt' : 'idle';
  return (
    <div className={s.bossPanel} style={{ ['--accent' as string]: meta.accent }}>
      <div className={`${s.bossArt} ${hit && boss.round_damage > 0 ? s.bossHit : ''} ${defeated ? s.bossDown : ''}`}>
        <Image src={`${meta.art}-boss-${pose}.webp`} alt={`${meta.name}, the ${meta.subject} boss`} width={size} height={size} priority />
        {hit && boss.round_damage > 0 && <span className={s.damage}>−{boss.round_damage.toLocaleString()}</span>}
      </div>
      <p className={s.bossName}>{meta.name}</p>
      <p className={s.dim}>{caption ?? `${meta.subject} boss`}</p>
      {left === null
        ? <p className={s.dim} style={{ fontSize: '.85rem', maxWidth: 260 }}>Health is set when the game starts, based on class size.</p>
        : <div style={{ width: '100%', maxWidth: 420 }}><BossBar boss={boss} showName={false} /></div>}
    </div>
  );
}
