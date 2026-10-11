import BossArt from '@/components/boss-art';
import PlayerFighter, { FIGHTER_LABEL, type FighterId } from '@/components/player-fighter';

type Props = {
  fighter: FighterId;
  playerPose: 'idle' | 'attack' | 'hurt' | 'special';
  bossPose?: 'idle' | 'attack' | 'hurt' | 'defeat';
  playerHp: number;
  bossHp: number;
  bossMaxHp: number;
  shielded: boolean;
  combo: number;
  energy: number;
  maxEnergy: number;
  enraged: boolean;
  floatHit: { who: 'boss' | 'player'; text: string; key: number } | null;
};

// Presentation only: all questions, combat decisions and rewards stay in CampaignPage.
export default function ChemistryCampaignStage(props: Props) {
  const { fighter, playerPose, bossPose, playerHp, bossHp, bossMaxHp, shielded, combo, energy, maxEnergy, enraged, floatHit } = props;
  const frac = bossMaxHp > 0 ? Math.max(0, Math.min(1, bossHp / bossMaxHp)) : 0;
  return (
    <section className="chemistry-stage" aria-label="The Catalyst’s laboratory arena">
      <div className="chemistry-stage-shade" />
      <div className="chemistry-health chemistry-health-player">
        <div className="flex justify-between gap-2 text-xs font-bold text-white"><span>{FIGHTER_LABEL[fighter]}</span><span className="tabular-nums">{Math.max(0, playerHp)} / 100</span></div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/50"><div className="h-full bg-teal-300 transition-all duration-300" style={{ width: `${Math.max(0, Math.min(100, playerHp))}%` }} /></div>
      </div>
      <div className="chemistry-health chemistry-health-boss">
        <div className="flex justify-between gap-2 text-xs font-bold text-white"><span>The Catalyst{enraged ? ' · ENRAGED' : ''}</span><span className="tabular-nums">{Math.max(0, bossHp)} / {bossMaxHp}</span></div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/50"><div className="h-full bg-gold transition-all duration-500" style={{ width: `${frac * 100}%` }} /></div>
      </div>
      <div className={`chemistry-fighter ${playerPose === 'attack' || playerPose === 'special' ? 'fx-lunge' : playerPose === 'hurt' ? 'fx-shake' : ''}`}>
        <div className="chemistry-ground" />
        <PlayerFighter char={fighter} pose={playerPose} className="relative h-full w-full" />
        {shielded && <div className="chemistry-shield" aria-label="Shield active" />}
        {floatHit?.who === 'player' && <span key={floatHit.key} className="fx-float text-3xl text-red-300" style={{ top: 20 }}>{floatHit.text}</span>}
      </div>
      <div className={`chemistry-boss ${bossPose === 'attack' ? 'fx-boss-lunge' : bossPose === 'hurt' ? 'fx-shake' : ''}`}>
        <div className="chemistry-ground" />
        <BossArt subject="chemistry" campaign frac={frac} defeated={bossHp <= 0} pose={bossPose} className="relative h-full w-full" />
        {floatHit?.who === 'boss' && <span key={floatHit.key} className="fx-float text-3xl text-amber-200" style={{ top: 20 }}>{floatHit.text}</span>}
      </div>
      <div className="chemistry-stage-energy">
        <span className="text-xs font-bold text-white">⚡ Energy {energy} / {maxEnergy}</span>
        <div className="flex gap-1" aria-label={`${energy} of ${maxEnergy} Energy`}>{Array.from({ length: maxEnergy }, (_, i) => <span key={i} className={`h-2 w-4 rounded-full ${i < energy ? 'bg-gold' : 'bg-white/20'}`} />)}</div>
        {combo >= 2 && <span className="text-xs font-bold text-amber-200">{combo}x combo</span>}
      </div>
    </section>
  );
}
