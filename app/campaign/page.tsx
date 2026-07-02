'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { getQuizQuestions, SUBJECTS, type Subject, type Question } from '@/lib/questions';
import BossArt from '@/components/boss-art';
import PlayerFighter, { FIGHTERS, FIGHTER_LABEL, type FighterId } from '@/components/player-fighter';
import AnswerTile from '@/components/answer-tile';
import CountUp from '@/components/count-up';
import MathText from '@/components/math-text';
import { celebrate } from '@/lib/confetti';
import { getCampaign, campaignDefeat, recordCampaignClear, campaignLeaderboard, type CampaignBoss, type DefeatResult, type ClearRow } from '@/lib/campaign';
import { campaignLoot, cardImageSrc, RARITY, type PullCard } from '@/lib/cards';
import { bossLore } from '@/lib/boss-lore';

const label = (s: Subject) => SUBJECTS.find((x) => x.id === s)?.label ?? s;

// Battle v3 (Teaching-APP-style AP system). The fight is client-side and resets
// each game; only the UNLOCK persists (campaign_defeat). Answering only earns
// Energy — you choose when to spend it on Hit / Special / Block.
const PLAYER_MAX_HP = 100;
const MAX_AP = 5;
const PLAYER_HIT = 14;       // HP you lose on a wrong answer / timeout
const QUESTION_TIME = 15;    // seconds per question
const HIT_DMG = 14;          // ⚔️ basic strike (×1.5 at 3+ combo)
const SPECIAL_DMG = 45;      // 💥 special
const BLOCK_HEAL = 16;       // 🛡️ block heals a little too
const HIT_COST = 1, SPECIAL_COST = 3, BLOCK_COST = 1;
const CHARGE_EVERY = 3;      // boss charges a big hit every Nth question
const CHARGE_DMG = 30;       // telegraphed hit damage if you don't Block

type Answered = { correct: boolean; picked: number; blocked?: boolean; timeout?: boolean; chargeLanded?: boolean };

export default function CampaignPage() {
  const sb = useMemo(() => createClient(), []);
  const { user, loading } = useUser();

  const [bosses, setBosses] = useState<CampaignBoss[]>([]);
  const [active, setActive] = useState<Subject | null>(null);

  // Battle state — boss HP is client-side and full each game.
  const [bhp, setBhp] = useState(100);
  const [bmax, setBmax] = useState(100);
  const [stage, setStage] = useState(1);
  const [queue, setQueue] = useState<Question[]>([]);
  const [qi, setQi] = useState(0);
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [victory, setVictory] = useState<DefeatResult | null>(null);
  const [loot, setLoot] = useState<PullCard | null>(null);
  const [elapsed, setElapsed] = useState(0);      // battle duration (seconds)
  const [myClear, setMyClear] = useState(0);      // your clear time on a win
  const [clears, setClears] = useState<ClearRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Your side + resource economy.
  const [playerHp, setPlayerHp] = useState(PLAYER_MAX_HP);
  const [combo, setCombo] = useState(0);
  const [ap, setAp] = useState(0);
  const [shielded, setShielded] = useState(false);
  const [runFailed, setRunFailed] = useState(false);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME);
  const [intro, setIntro] = useState(false);
  const [bossCharging, setBossCharging] = useState(false);
  const qSinceCharge = useRef(0);

  // Combat FX + the player's own character.
  const [bossAnim, setBossAnim] = useState<'hurt' | 'lunge' | null>(null);
  const [playerAnim, setPlayerAnim] = useState<'hurt' | 'lunge' | null>(null);
  const [flash, setFlash] = useState<'red' | 'gold' | 'blue' | null>(null);
  const [shakeScreen, setShakeScreen] = useState(false);
  const [floatHit, setFloatHit] = useState<{ who: 'boss' | 'player'; text: string; key: number } | null>(null);
  const [fighter, setFighter] = useState<FighterId>('male-adventurer');
  const fxId = useRef(0);
  const defeatedRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    getCampaign(sb).then(setBosses).catch((e) => setErr(msg(e)));
  }, [sb, user]);

  // Remember the player's chosen fighter character.
  useEffect(() => {
    const f = localStorage.getItem('campaign_fighter');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (f && (FIGHTERS as readonly string[]).includes(f)) setFighter(f as FighterId);
  }, []);
  function chooseFighter(f: FighterId) {
    setFighter(f);
    try { localStorage.setItem('campaign_fighter', f); } catch { /* ignore */ }
  }

  const q: Question | undefined = queue[qi];
  const battling = !!active && !victory && !runFailed;

  // Per-question countdown.
  useEffect(() => {
    if (!battling || !q || answered || timeLeft <= 0) return;
    const t = window.setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [battling, q, answered, timeLeft]);

  // Out of time → counts as a miss.
  useEffect(() => {
    if (battling && q && !answered && timeLeft <= 0) answer(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, battling, q, answered]);

  // Whole-battle clock — used for speed-clear leaderboard times.
  useEffect(() => {
    if (!battling) return;
    const t = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [battling]);

  // Fire a burst of combat FX. target = who got hit.
  function triggerFx(target: 'boss' | 'player', text: string, power = false) {
    if (target === 'boss') { setBossAnim('hurt'); setPlayerAnim('lunge'); setFlash('gold'); }
    else { setBossAnim('lunge'); setPlayerAnim('hurt'); setFlash('red'); setShakeScreen(true); }
    if (power) setShakeScreen(true);
    // Haptics on mobile.
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(power ? [40, 30, 70] : target === 'player' ? 60 : 30);
    }
    fxId.current += 1;
    setFloatHit({ who: target, text, key: fxId.current });
    window.setTimeout(() => setShakeScreen(false), 480);
    window.setTimeout(() => setFlash(null), 520);
    window.setTimeout(() => { setBossAnim(null); setPlayerAnim(null); }, 900);
    window.setTimeout(() => setFloatHit(null), 950);
  }

  async function enter(boss: CampaignBoss) {
    setErr('');
    setActive(boss.subject);
    setBhp(boss.max_hp); setBmax(boss.max_hp); setStage(boss.stage);
    setAnswered(null); setVictory(null); setLoot(null); setQi(0);
    setElapsed(0); setMyClear(0); setClears([]);
    setPlayerHp(PLAYER_MAX_HP); setCombo(0); setAp(0); setShielded(false); setRunFailed(false);
    setTimeLeft(QUESTION_TIME);
    defeatedRef.current = false;
    setBossCharging(false);
    qSinceCharge.current = 0;
    setIntro(true);
    window.setTimeout(() => setIntro(false), 1600);
    setBusy(true);
    try {
      const qs = await getQuizQuestions(sb, { subject: boss.subject, count: 10 });
      setQueue(qs);
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }

  // Answer a question — this ONLY earns Energy (or hurts you if wrong/timeout).
  function answer(choice: number) {
    if (!active || !q || answered || victory || runFailed) return;
    const timeout = choice < 0;
    const correct = !timeout && choice === q.correct_index;
    const chargeLanded = bossCharging; // didn't Block the telegraphed hit in time
    if (bossCharging) setBossCharging(false);

    let dmg = 0;
    let blockedBase = false;
    if (correct) {
      setCombo((c) => c + 1);
      const fast = timeLeft >= QUESTION_TIME * 0.55;
      setAp((a) => Math.min(MAX_AP, a + (fast ? 2 : 1)));
    } else {
      setCombo(0);
      if (shielded) {
        setShielded(false);
        blockedBase = true;
      } else {
        // Enrage: under 40% boss HP it hits 50% harder.
        const enraged = bmax > 0 && bhp > 0 && bhp / bmax < 0.4;
        dmg += enraged ? Math.round(PLAYER_HIT * 1.5) : PLAYER_HIT;
      }
    }
    if (chargeLanded) dmg += CHARGE_DMG;

    setAnswered({ correct, picked: choice, blocked: blockedBase && !chargeLanded, timeout, chargeLanded });

    if (dmg > 0) {
      const np = Math.max(0, playerHp - dmg);
      setPlayerHp(np);
      triggerFx('player', `−${dmg}`, chargeLanded);
      if (np <= 0) { setRunFailed(true); return; }
    } else if (blockedBase) {
      setFlash('blue');
      window.setTimeout(() => setFlash(null), 500);
    }

    // Feed mastery + quests (fire and forget); skip on pure timeout.
    if (!timeout) {
      sb.rpc('record_attempt', { p_question_id: q.id, p_subject: q.subject, p_topic: q.topic, p_correct: correct }).then(undefined, () => {});
    }
    sb.rpc('increment_quest', { p_metric: 'answer' }).then(undefined, () => {});
    if (correct) sb.rpc('increment_quest', { p_metric: 'correct' }).then(undefined, () => {});

    window.setTimeout(advance, 1300);
  }

  function advance() {
    if (defeatedRef.current) return;
    setAnswered(null);
    setTimeLeft(QUESTION_TIME);
    // Every Nth question the boss telegraphs a big hit — you must Block it.
    qSinceCharge.current += 1;
    if (qSinceCharge.current >= CHARGE_EVERY) { qSinceCharge.current = 0; setBossCharging(true); }
    if (qi + 1 < queue.length) { setQi(qi + 1); return; }
    setBusy(true);
    getQuizQuestions(sb, { subject: active!, count: 10 })
      .then((qs) => { setQueue(qs); setQi(0); })
      .catch((e) => setErr(msg(e)))
      .finally(() => setBusy(false));
  }

  // ── Actions: spend Energy to act on the boss ──
  function applyToBoss(dmg: number, power = false) {
    const nb = Math.max(0, bhp - dmg);
    setBhp(nb);
    triggerFx('boss', `−${dmg}`, power);
    if (nb <= 0) onBossDefeated();
  }
  function hitBoss() {
    if (ap < HIT_COST || !battling) return;
    setAp((a) => a - HIT_COST);
    // Big combos crit. (Combo-driven so it's deterministic, not RNG.)
    const crit = combo >= 5;
    const mult = crit ? 2 : combo >= 3 ? 1.5 : 1;
    const dmg = Math.round(HIT_DMG * mult);
    if (crit) {
      const nb = Math.max(0, bhp - dmg);
      setBhp(nb);
      triggerFx('boss', `CRIT −${dmg}!`, true);
      if (nb <= 0) onBossDefeated();
    } else {
      applyToBoss(dmg);
    }
  }
  function specialBoss() {
    if (ap < SPECIAL_COST || !battling) return;
    setAp((a) => a - SPECIAL_COST);
    applyToBoss(SPECIAL_DMG, true);
  }
  function blockMove() {
    if (ap < BLOCK_COST || !battling) return;
    setAp((a) => a - BLOCK_COST);
    setShielded(true);
    setPlayerHp((p) => Math.min(PLAYER_MAX_HP, p + BLOCK_HEAL));
    if (bossCharging) setBossCharging(false); // negate the telegraphed hit
    setFlash('blue');
    window.setTimeout(() => setFlash(null), 500);
  }

  async function onBossDefeated() {
    if (defeatedRef.current || !active) return;
    defeatedRef.current = true;
    const subj = active;
    const clearMs = Math.max(1, elapsed) * 1000;
    const clearedStage = stage;
    setMyClear(elapsed);
    celebrate(true);
    try {
      const d = await campaignDefeat(sb, subj);
      setVictory(d);
      setBosses((bs) => bs.map((b) =>
        b.subject === subj ? { ...b, stage: d.stage, max_hp: d.max_hp, hp: d.max_hp, defeated_count: b.defeated_count + 1 } : b));
      campaignLoot(sb).then(setLoot).catch(() => {}); // free Legend card drop
      recordCampaignClear(sb, subj, clearedStage, clearMs)
        .then(() => campaignLeaderboard(sb, subj, 5))
        .then(setClears)
        .catch(() => {});
    } catch (e) {
      setErr(msg(e));
      setVictory({ stage: stage + 1, max_hp: 100 * (stage + 1), reward: 0 });
    }
  }

  function continueBattle() {
    const b = bosses.find((x) => x.subject === active);
    if (b) enter(b);
  }
  function retryRun() {
    const b = bosses.find((x) => x.subject === active);
    if (b) enter(b);
  }
  function toMap() {
    setActive(null); setVictory(null); setAnswered(null); setQueue([]); setErr('');
  }

  // ---------- SIGN-IN GATE ----------
  if (!loading && !user) {
    return (
      <Shell>
        <H>⚔️ Campaign</H>
        <p className="mt-2 text-inksoft">Solo boss battles — answer to charge Energy, then strike. Sign in to begin your run.</p>
        <Link href="/login?next=/campaign" className="lg-btn lg-btn-primary mt-6 px-5 py-3 text-center">Sign in</Link>
        <Home />
      </Shell>
    );
  }

  // ---------- BATTLE ----------
  if (active) {
    const frac = bmax > 0 ? bhp / bmax : 0;
    const bossPose = bossAnim === 'lunge' ? 'attack' : bossAnim === 'hurt' ? 'hurt' : bossCharging ? 'attack' : undefined;
    const playerPose: 'idle' | 'attack' | 'hurt' = playerAnim === 'lunge' ? 'attack' : playerAnim === 'hurt' ? 'hurt' : 'idle';
    const enraged = bhp > 0 && bmax > 0 && bhp / bmax < 0.4;
    const lore = bossLore(active);
    const taunt = lore.taunts[qi % lore.taunts.length];
    const tFrac = timeLeft / QUESTION_TIME;
    const tColor = tFrac > 0.5 ? '#6b9b7c' : tFrac > 0.25 ? '#d6a85f' : '#c4646b';
    return (
      <Shell wide>
        <div className="flex items-center justify-between text-sm text-muted">
          <button onClick={toMap} className="underline">← Map</button>
          <span>{label(active)} · Stage {stage}</span>
        </div>

        {flash && (
          <div className="fx-flash" style={{
            background: flash === 'red' ? 'rgba(220,38,38,0.55)' : flash === 'gold' ? 'rgba(255,200,60,0.5)' : 'rgba(96,120,220,0.45)',
          }} />
        )}

        {/* Low-HP danger vignette */}
        {battling && playerHp > 0 && playerHp / PLAYER_MAX_HP < 0.3 && <div className="fx-vignette" />}

        {/* Boss intro title card */}
        {intro && (
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
            <div className="fx-title text-center">
              <p className="font-display font-extrabold tracking-[0.25em] text-berry text-sm">STAGE {stage}</p>
              <p className="mt-1 font-display font-black text-3xl md:text-5xl text-ink">{lore.name}</p>
              <p className="mt-1 font-display font-bold text-berrydeep">{lore.title}</p>
            </div>
          </div>
        )}

        <div
          className={`relative mt-3 overflow-hidden rounded-3xl px-4 py-5 ${shakeScreen ? 'fx-screen-shake' : ''}`}
          style={{ background: 'radial-gradient(120% 80% at 50% 0%, #3c3460 0%, transparent 55%), linear-gradient(165deg,#1a1d2e 0%,#2d3142 55%,#241f38 100%)' }}
        >
          {/* Boss character */}
          <div className="relative flex flex-col items-center">
            {floatHit?.who === 'boss' && (
              <span key={floatHit.key} className="fx-float text-5xl" style={{ top: 20, color: '#ffd34d', textShadow: '0 3px 0 #7a4a00, 0 0 12px rgba(0,0,0,0.5)' }}>{floatHit.text}</span>
            )}
            <div className={bossAnim === 'lunge' ? 'fx-boss-lunge' : bossAnim === 'hurt' ? 'fx-shake' : ''}>
              <div className={bossAnim === 'hurt' ? 'fx-hit-blink' : ''}>
                <BossArt subject={active} frac={frac} defeated={bhp <= 0} pose={bossPose} className="h-52 md:h-64" />
              </div>
            </div>
            <div className="mt-2 w-full max-w-xs">
              <div className="flex justify-between text-xs text-white/70">
                <span className="font-bold text-white">
                  {lore.name}{enraged && <span className="ml-1 text-rose-300 lg-pop">😤 ENRAGED</span>}
                </span>
                <span className="tabular-nums">{Math.max(0, bhp)} / {bmax}</span>
              </div>
              <div className="mt-1 h-3 rounded-full bg-black/35 overflow-hidden">
                <div className="h-full bg-brick transition-all duration-500" style={{ width: `${Math.max(0, frac) * 100}%` }} />
              </div>
            </div>
          </div>

          {/* You — your designable character */}
          <div className="relative mx-auto mt-4 flex w-full max-w-xs items-center gap-3">
            <div className={`relative shrink-0 ${playerAnim === 'lunge' ? 'fx-lunge' : playerAnim === 'hurt' ? 'fx-shake' : ''}`}>
              {floatHit?.who === 'player' && (
                <span key={floatHit.key} className="fx-float text-4xl" style={{ top: -16, color: '#ff4444', textShadow: '0 3px 0 #5a0000, 0 0 12px rgba(0,0,0,0.5)' }}>{floatHit.text}</span>
              )}
              <div className={playerAnim === 'hurt' ? 'fx-hit-blink' : ''}>
                <PlayerFighter char={fighter} pose={playerPose} className="h-24 md:h-28" />
              </div>
              {shielded && <span className="absolute -right-1 -top-1 text-xl">🛡️</span>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex justify-between text-xs text-white/70">
                <span className="font-bold text-white">You</span>
                <span className="tabular-nums">{Math.max(0, playerHp)} / {PLAYER_MAX_HP}</span>
              </div>
              <div className="mt-1 h-3 rounded-full bg-black/35 overflow-hidden">
                <div className="h-full bg-leaf transition-all duration-300" style={{ width: `${Math.max(0, playerHp / PLAYER_MAX_HP) * 100}%` }} />
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex gap-1" aria-label="Energy">
                  {Array.from({ length: MAX_AP }).map((_, i) => (
                    <span key={i} className={`h-3 w-3 rounded-full ${i < ap ? 'bg-gold' : 'bg-white/15'}`} />
                  ))}
                </div>
                {combo >= 2 && <span className="lg-pop text-xs font-display font-extrabold text-amber-300">🔥 {combo}x combo</span>}
              </div>
            </div>
          </div>

          {/* Boss telegraph — Block to negate */}
          {bossCharging && (
            <div className="mx-auto mt-3 w-full max-w-xs animate-pulse rounded-xl border border-rose-400/60 bg-rose-500/30 px-3 py-2 text-center text-sm font-display font-extrabold text-rose-50">
              ⚡ “{taunt}” — 🛡️ BLOCK the big hit!
            </div>
          )}

          {/* Action bar — spend Energy whenever you like */}
          <div className="mx-auto mt-3 grid w-full max-w-xs grid-cols-3 gap-2">
            <ActionBtn onClick={hitBoss} disabled={ap < HIT_COST || !battling} cost={HIT_COST} bg="#c47165" deep="#9c4a50">⚔️ Hit</ActionBtn>
            <ActionBtn onClick={specialBoss} disabled={ap < SPECIAL_COST || !battling} cost={SPECIAL_COST} bg="#6d5b8a" deep="#4e4068">💥 Special</ActionBtn>
            <ActionBtn onClick={blockMove} disabled={ap < BLOCK_COST || !battling} cost={BLOCK_COST} bg="#6b9b7c" deep="#4a7a5b">🛡️ Block</ActionBtn>
          </div>
        </div>

        {/* Outcome banners / question */}
        {runFailed ? (
          <div className="lg-card mt-6 px-5 py-6 text-center">
            <div className="lg-pop text-5xl">💀</div>
            <p className="mt-2 font-display font-extrabold text-ink text-lg">You were knocked out!</p>
            <p className="mt-1 text-inksoft">The {label(active)} boss got you. HP resets — jump back in.</p>
            <button onClick={retryRun} disabled={busy} className="lg-btn lg-btn-primary mt-5 w-full px-6 py-4">
              {busy ? 'Loading…' : 'Retry battle'}
            </button>
            <button onClick={toMap} className="mt-3 text-sm text-berrydeep underline">Back to map</button>
          </div>
        ) : victory ? (
          <div className="lg-card mt-6 px-5 py-6 text-center">
            <div className="lg-pop text-5xl">🏆</div>
            <p className="mt-2 font-display font-extrabold text-ink text-lg">
              {label(active)} boss defeated! +<CountUp to={victory.reward} /> ✨
            </p>
            <p className="mt-1 text-inksoft">Stage {victory.stage} unlocked (tougher!)</p>

            {loot && (() => {
              const r = RARITY[loot.rarity];
              const src = cardImageSrc(loot);
              return (
                <div className={`lg-pop mx-auto mt-4 flex max-w-[16rem] items-center gap-3 rounded-2xl border-2 bg-panel px-3 py-2.5 ${r.border}`}>
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" className="h-12 w-12 shrink-0 object-contain" />
                  ) : (
                    <span className="text-3xl">{loot.art_kind === 'emoji' ? loot.art_ref : '🃏'}</span>
                  )}
                  <div className="min-w-0 text-left">
                    <div className={`text-[10px] font-extrabold ${r.text}`}>{r.label.toUpperCase()} CARD</div>
                    <div className="font-display font-bold text-ink leading-tight truncate">{loot.name}</div>
                    <div className="text-xs text-muted">{loot.is_dupe ? `Duplicate · +${loot.refund} ✨` : '✨ New Legend card!'}</div>
                  </div>
                </div>
              );
            })()}

            {myClear > 0 && (
              <div className="mt-4 text-left">
                <p className="text-center text-sm font-display font-extrabold text-ink">⏱ Cleared in {myClear}s</p>
                {clears.length > 0 && (
                  <>
                    <p className="mt-2 text-center text-xs font-display font-bold tracking-wide text-muted">FASTEST {label(active).toUpperCase()} CLEARS</p>
                    <ol className="mt-1 space-y-1">
                      {clears.map((r) => (
                        <li key={r.rank} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${r.is_me ? 'border border-gold/50 bg-gold/25' : 'bg-parchment-deep/60'}`}>
                          <span className="w-4 text-center font-semibold text-muted">{r.rank}</span>
                          <span className="flex-1 truncate">{r.name}{r.is_me ? ' (you)' : ''}</span>
                          <span className="font-mono text-xs tabular-nums text-inksoft">{(r.clear_ms / 1000).toFixed(0)}s</span>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </div>
            )}

            <button onClick={continueBattle} disabled={busy} className="lg-btn lg-btn-primary mt-5 w-full px-6 py-4">
              {busy ? 'Loading…' : 'Fight the next stage'}
            </button>
            <button onClick={toMap} className="mt-3 text-sm text-berrydeep underline">Back to map</button>
          </div>
        ) : q ? (
          <>
            {/* Countdown */}
            <div className="mt-5 flex items-center gap-2">
              <div className="h-2 flex-1 rounded-full bg-parchment-deep overflow-hidden">
                <div className="h-full transition-all duration-1000 ease-linear" style={{ width: `${Math.max(0, tFrac) * 100}%`, background: tColor }} />
              </div>
              <span className="text-xs font-mono tabular-nums" style={{ color: tColor }}>{Math.max(0, timeLeft)}s</span>
            </div>

            <h2 className="mt-4 text-xl md:text-2xl md:text-center font-display font-bold text-ink leading-snug">
              <MathText text={q.stem ?? ''} />
            </h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {(q.options ?? []).map((o, i) => (
                <AnswerTile key={i} index={i} disabled={!!answered} onClick={() => answer(i)}
                  reveal={answered ? (i === q.correct_index ? 'correct' : i === answered.picked ? 'wrong' : 'dim') : null}>
                  <MathText text={o} />
                </AnswerTile>
              ))}
            </div>
            {answered && (
              <p className={`mt-4 font-display font-extrabold ${answered.correct && !answered.chargeLanded ? 'text-leaf' : 'text-brick'}`}>
                {answered.chargeLanded
                  ? `💥 The charge LANDED! −${CHARGE_DMG} HP — Block it next time!`
                  : answered.correct
                    ? '⚡ +Energy! Spend it on the boss.'
                    : answered.blocked
                      ? '🛡️ Blocked — no damage!'
                      : answered.timeout
                        ? '⏰ Too slow — the boss strikes!'
                        : '✗ The boss strikes back!'}
              </p>
            )}
          </>
        ) : (
          <p className="mt-8 text-center text-muted">{busy ? 'Loading questions…' : 'No questions available for this subject yet.'}</p>
        )}
        {err && <Err>{err}</Err>}
      </Shell>
    );
  }

  // ---------- MAP ----------
  return (
    <Shell map>
      <H>⚔️ Campaign</H>
      <p className="text-inksoft text-sm mt-1">Take on each subject’s boss solo. Answer questions to charge Energy, then unleash Hit / Special / Block. Beat a boss to unlock a tougher stage.</p>

      {/* Choose your fighter */}
      <div className="mt-4">
        <p className="text-xs font-display font-bold tracking-wide text-muted">YOUR FIGHTER</p>
        <div className="mt-2 flex gap-2">
          {FIGHTERS.map((f) => (
            <button key={f} onClick={() => chooseFighter(f)}
              className={`rounded-2xl p-1.5 text-center transition ${fighter === f ? 'ring-2 ring-plum bg-parchment-deep' : 'bg-panel border border-rule'}`}>
              <PlayerFighter char={f} pose="idle" className="h-14 w-14" />
              <div className="text-[10px] text-muted">{FIGHTER_LABEL[f]}</div>
            </button>
          ))}
        </div>
      </div>

      {/* The journey — a winding path of subject bosses */}
      <div className="relative mx-auto mt-6 w-full max-w-md">
        <div className="absolute left-1/2 top-3 bottom-3 -translate-x-1/2 border-l-2 border-dashed border-rule" aria-hidden />
        <div className="relative space-y-5">
          {bosses.map((b, i) => (
            <div key={b.subject} className={`flex ${i % 2 ? 'justify-end' : 'justify-start'}`}>
              <button onClick={() => enter(b)} disabled={busy}
                className="lg-card relative flex w-[82%] items-center gap-3 px-3 py-3 text-left transition active:translate-y-0.5 disabled:opacity-60">
                <div className="relative shrink-0">
                  <div className="grid h-[72px] w-[72px] place-items-center rounded-full bg-parchment-deep">
                    <BossArt subject={b.subject} frac={1} className="h-16 w-16" />
                  </div>
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-plum px-2 py-0.5 text-[10px] font-display font-extrabold text-white">Stage {b.stage}</span>
                </div>
                <div className="min-w-0">
                  <div className="font-display font-bold text-ink leading-tight truncate">{bossLore(b.subject).name}</div>
                  <div className="text-[11px] text-berrydeep font-semibold truncate">{label(b.subject)}</div>
                  <div className="mt-0.5 text-xs text-muted">
                    {b.defeated_count > 0
                      ? `${'⭐'.repeat(Math.min(5, b.defeated_count))} ${b.defeated_count} cleared`
                      : 'tap to fight ⚔️'}
                  </div>
                </div>
              </button>
            </div>
          ))}
        </div>
        {!bosses.length && <p className="text-muted text-sm">{loading ? 'Loading…' : 'Summoning bosses…'}</p>}
      </div>
      {err && <Err>{err}</Err>}
      <Home />
    </Shell>
  );
}

function ActionBtn({ children, onClick, disabled, cost, bg, deep }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; cost: number; bg: string; deep: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="lg-btn relative px-2 py-2.5 text-sm text-white disabled:opacity-40 active:translate-y-0.5"
      style={{ background: bg, boxShadow: `0 4px 0 ${deep}` }}>
      {children}
      <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-extrabold text-ink">
        {cost}⚡
      </span>
    </button>
  );
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
const Shell = ({ children, wide = false, map = false }: { children: React.ReactNode; wide?: boolean; map?: boolean }) => (
  <main
    className={`flex flex-1 flex-col px-6 pt-12 pb-10 w-full mx-auto ${
      wide ? 'max-w-md md:max-w-3xl md:px-12' : map ? 'max-w-md md:max-w-5xl' : 'max-w-md'
    }`}
  >
    {children}
  </main>
);
const H = ({ children }: { children: React.ReactNode }) => <h1 className="text-2xl font-extrabold text-ink">{children}</h1>;
const Err = ({ children }: { children: React.ReactNode }) => <p className="mt-3 text-brick text-sm">{children}</p>;
const Home = () => <Link href="/" className="mt-6 text-center text-sm text-muted underline">Home</Link>;
