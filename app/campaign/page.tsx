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
function strikeDamage(combo: number) { return Math.round(HIT_DMG * (combo >= 5 ? 2 : combo >= 3 ? 1.5 : 1)); }

type Answered = { correct: boolean; picked: number; blocked?: boolean; timeout?: boolean; chargeLanded?: boolean };
type MissedQuestion = { id: string; stem: string; correct: string; explanation: string; timeout: boolean };

export default function CampaignPage() {
  const sb = useMemo(() => createClient(), []);
  const { user, loading } = useUser();
  const [authWaitLong, setAuthWaitLong] = useState(false);

  const [bosses, setBosses] = useState<CampaignBoss[]>([]);
  const [bossesOwner, setBossesOwner] = useState<string | null>(null);
  const [bossesStatus, setBossesStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [bossesError, setBossesError] = useState('');
  const [active, setActive] = useState<Subject | null>(null);

  // Battle state — boss HP is client-side and full each game.
  const [bhp, setBhp] = useState(100);
  const [bmax, setBmax] = useState(100);
  const [stage, setStage] = useState(1);
  const [queue, setQueue] = useState<Question[]>([]);
  const [qi, setQi] = useState(0);
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [missed, setMissed] = useState<MissedQuestion[]>([]);
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
  const battleIdRef = useRef(0);
  const bossRequestRef = useRef(0);
  const questionRequestRef = useRef<number | null>(null);
  const answerLockRef = useRef(false);
  const questionVersionRef = useRef(0);
  const energyRef = useRef(0);
  const bossHpRef = useRef(100);
  const playerHpRef = useRef(PLAYER_MAX_HP);
  const shieldRef = useRef(false);
  const chargingRef = useRef(false);
  const comboRef = useRef(0);
  const renderedBattleId = battleIdRef.current;
  const renderedQuestionVersion = questionVersionRef.current;

  useEffect(() => () => { battleIdRef.current += 1; }, []);

  useEffect(() => {
    if (!loading) return;
    const timeout = window.setTimeout(() => setAuthWaitLong(true), 8000);
    return () => window.clearTimeout(timeout);
  }, [loading]);

  useEffect(() => {
    if (!user) return;
    const request = ++bossRequestRef.current;
    getCampaign(sb).then((data) => {
      if (bossRequestRef.current !== request) return;
      setBosses(data); setBossesOwner(user.id); setBossesError(''); setBossesStatus('ready');
    }).catch((e) => {
      if (bossRequestRef.current !== request) return;
      setBosses([]); setBossesOwner(user.id); setBossesError(msg(e)); setBossesStatus('error');
    });
    return () => { bossRequestRef.current += 1; };
  }, [sb, user]);

  function retryBosses() {
    if (!user) return;
    const request = ++bossRequestRef.current;
    setBossesStatus('loading'); setBossesError('');
    getCampaign(sb).then((data) => {
      if (bossRequestRef.current !== request) return;
      setBosses(data); setBossesOwner(user.id); setBossesStatus('ready');
    }).catch((e) => {
      if (bossRequestRef.current !== request) return;
      setBosses([]); setBossesOwner(user.id); setBossesError(msg(e)); setBossesStatus('error');
    });
  }

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
  const battling = !!active && !!q && !busy && bhp > 0 && !victory && !runFailed;
  const visibleBosses = bossesOwner === user?.id ? bosses : [];
  const visibleBossesStatus = bossesOwner === user?.id ? bossesStatus : 'loading';

  // Per-question countdown.
  useEffect(() => {
    if (!battling || !q || answered || timeLeft <= 0) return;
    const t = window.setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [battling, q, answered, timeLeft]);

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

  async function loadQuestions(subject: Subject, battleId: number) {
    if (battleIdRef.current !== battleId || questionRequestRef.current === battleId) return;
    questionRequestRef.current = battleId;
    setErr(''); setBusy(true);
    try {
      const qs = await getQuizQuestions(sb, { subject, count: 10 });
      if (battleIdRef.current !== battleId) return;
      if (!qs.length) throw new Error('No questions available for this subject yet.');
      setQueue(qs); setQi(0); answerLockRef.current = false;
    } catch (e) { if (battleIdRef.current === battleId) setErr(msg(e)); }
    finally {
      if (questionRequestRef.current === battleId) questionRequestRef.current = null;
      if (battleIdRef.current === battleId) setBusy(false);
    }
  }

  async function enter(boss: CampaignBoss) {
    const battleId = ++battleIdRef.current;
    answerLockRef.current = false;
    questionVersionRef.current += 1;
    energyRef.current = 0;
    bossHpRef.current = boss.max_hp;
    playerHpRef.current = PLAYER_MAX_HP;
    shieldRef.current = false; chargingRef.current = false; comboRef.current = 0;
    setErr('');
    setActive(boss.subject);
    setBhp(boss.max_hp); setBmax(boss.max_hp); setStage(boss.stage);
    setAnswered(null); setMissed([]); setVictory(null); setLoot(null); setQueue([]); setQi(0);
    setElapsed(0); setMyClear(0); setClears([]);
    setPlayerHp(PLAYER_MAX_HP); setCombo(0); setAp(0); setShielded(false); setRunFailed(false);
    setTimeLeft(QUESTION_TIME);
    defeatedRef.current = false;
    setBossCharging(false);
    qSinceCharge.current = 0;
    setIntro(true);
    window.setTimeout(() => { if (battleIdRef.current === battleId) setIntro(false); }, 1600);
    await loadQuestions(boss.subject, battleId);
  }

  // Answer a question — this ONLY earns Energy (or hurts you if wrong/timeout).
  function answer(choice: number) {
    if (!active || !q || answered || victory || runFailed || answerLockRef.current || (choice >= 0 && timeLeft <= 0) ||
      renderedBattleId !== battleIdRef.current || renderedQuestionVersion !== questionVersionRef.current) return;
    answerLockRef.current = true;
    const battleId = battleIdRef.current;
    const timeout = choice < 0;
    const correct = !timeout && choice === q.correct_index;
    if (!correct) setMissed((items) => [...items, { id: q.id, stem: q.stem, correct: q.options[q.correct_index] ?? '', explanation: q.explanation, timeout }]);
    const chargeLanded = chargingRef.current; // didn't Block the telegraphed hit in time
    if (chargeLanded) { chargingRef.current = false; setBossCharging(false); }

    let dmg = 0;
    let blockedBase = false;
    if (correct) {
      comboRef.current += 1; setCombo(comboRef.current);
      const fast = timeLeft >= QUESTION_TIME * 0.55;
      energyRef.current = Math.min(MAX_AP, energyRef.current + (fast ? 2 : 1));
      setAp(energyRef.current);
    } else {
      comboRef.current = 0; setCombo(0);
      if (shieldRef.current) {
        shieldRef.current = false;
        setShielded(false);
        blockedBase = true;
      } else {
        // Enrage: under 40% boss HP it hits 50% harder.
        const enraged = bmax > 0 && bossHpRef.current > 0 && bossHpRef.current / bmax < 0.4;
        dmg += enraged ? Math.round(PLAYER_HIT * 1.5) : PLAYER_HIT;
      }
    }
    if (chargeLanded) dmg += CHARGE_DMG;

    setAnswered({ correct, picked: choice, blocked: blockedBase && !chargeLanded, timeout, chargeLanded });

    if (dmg > 0) {
      const np = Math.max(0, playerHpRef.current - dmg);
      playerHpRef.current = np;
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

    window.setTimeout(() => { if (battleIdRef.current === battleId) advance(); }, 1300);
  }

  function advance() {
    if (defeatedRef.current) return;
    const battleId = battleIdRef.current;
    questionVersionRef.current += 1;
    setAnswered(null);
    setTimeLeft(QUESTION_TIME);
    // Every Nth question the boss telegraphs a big hit — you must Block it.
    qSinceCharge.current += 1;
    if (qSinceCharge.current >= CHARGE_EVERY) { qSinceCharge.current = 0; chargingRef.current = true; setBossCharging(true); }
    if (qi + 1 < queue.length) { setQi(qi + 1); answerLockRef.current = false; return; }
    // Remove the previous question while fetching so it cannot be answered
    // again during a slow refill or after a failed request.
    setQueue([]); setQi(0);
    void loadQuestions(active!, battleId);
  }

  // Out of time → counts as a miss.
  useEffect(() => {
    if (!battling || !q || answered || timeLeft > 0) return;
    const timeout = window.setTimeout(() => answer(-1), 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, battling, q, answered]);

  // ── Actions: spend Energy to act on the boss ──
  function applyToBoss(dmg: number, power = false, crit = false) {
    const nb = Math.max(0, bossHpRef.current - dmg);
    bossHpRef.current = nb;
    setBhp(nb);
    triggerFx('boss', crit ? `CRIT −${dmg}!` : `−${dmg}`, power);
    if (nb <= 0) onBossDefeated();
  }
  function hitBoss() {
    if (energyRef.current < HIT_COST || !battling || defeatedRef.current || renderedBattleId !== battleIdRef.current || renderedQuestionVersion !== questionVersionRef.current) return;
    energyRef.current -= HIT_COST;
    setAp(energyRef.current);
    // Big combos crit. (Combo-driven so it's deterministic, not RNG.)
    const crit = comboRef.current >= 5;
    const dmg = strikeDamage(comboRef.current);
    if (crit) {
      applyToBoss(dmg, true, true);
    } else {
      applyToBoss(dmg);
    }
  }
  function specialBoss() {
    if (energyRef.current < SPECIAL_COST || !battling || defeatedRef.current || renderedBattleId !== battleIdRef.current || renderedQuestionVersion !== questionVersionRef.current) return;
    energyRef.current -= SPECIAL_COST;
    setAp(energyRef.current);
    applyToBoss(SPECIAL_DMG, true);
  }
  function blockMove() {
    if (energyRef.current < BLOCK_COST || !battling || defeatedRef.current || renderedBattleId !== battleIdRef.current || renderedQuestionVersion !== questionVersionRef.current) return;
    energyRef.current -= BLOCK_COST;
    setAp(energyRef.current);
    shieldRef.current = true;
    setShielded(true);
    playerHpRef.current = Math.min(PLAYER_MAX_HP, playerHpRef.current + BLOCK_HEAL);
    setPlayerHp(playerHpRef.current);
    if (chargingRef.current) { chargingRef.current = false; setBossCharging(false); } // negate the telegraphed hit
    setFlash('blue');
    window.setTimeout(() => setFlash(null), 500);
  }

  async function onBossDefeated() {
    if (defeatedRef.current || !active) return;
    defeatedRef.current = true;
    const battleId = battleIdRef.current;
    const subj = active;
    const clearMs = Math.max(1, elapsed) * 1000;
    const clearedStage = stage;
    setMyClear(elapsed);
    celebrate(true);
    try {
      const d = await campaignDefeat(sb, subj);
      if (battleIdRef.current !== battleId) return;
      setVictory(d);
      setBosses((bs) => bs.map((b) =>
        b.subject === subj ? { ...b, stage: d.stage, max_hp: d.max_hp, hp: d.max_hp, defeated_count: b.defeated_count + 1 } : b));
      campaignLoot(sb).then((card) => { if (battleIdRef.current === battleId) setLoot(card); }).catch(() => {}); // free Legend card drop
      recordCampaignClear(sb, subj, clearedStage, clearMs)
        .then(() => campaignLeaderboard(sb, subj, 5))
        .then((rows) => { if (battleIdRef.current === battleId) setClears(rows); })
        .catch(() => {});
    } catch (e) {
      if (battleIdRef.current === battleId) setErr(msg(e));
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
    battleIdRef.current += 1;
    setBusy(false);
    setActive(null); setVictory(null); setAnswered(null); setQueue([]); setErr('');
  }

  // ---------- SIGN-IN GATE ----------
  if (loading) {
    return (
      <Shell>
        <div className="lg-card px-5 py-6 text-center" role="status">
          <h1 className="font-display text-2xl font-black text-ink">Boss Campaign</h1>
          <p className="mt-2 text-sm text-inksoft">{authWaitLong ? 'Account check is taking longer than expected.' : 'Checking your account…'}</p>
          {authWaitLong && <div className="mt-4 flex flex-wrap justify-center gap-3"><button onClick={() => window.location.reload()} className="lg-btn lg-btn-primary px-4 py-2">Retry</button><Link href="/demo" className="rounded-xl border border-rule px-4 py-2 text-sm font-bold text-plum">Try the sample game</Link></div>}
        </div>
        <Home />
      </Shell>
    );
  }

  if (!loading && !user) {
    return (
      <Shell map>
        <div className="overflow-hidden rounded-3xl bg-[#201e42] px-6 py-10 text-white sm:px-10" style={{ backgroundImage: 'linear-gradient(90deg,rgba(26,25,55,.97),rgba(26,25,55,.65)), url(/art/arena-hero.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
          <p className="text-xs font-black tracking-[.2em] text-[#a3f3d2]">⚔️ SOLO BOSS BATTLES</p>
          <h1 className="mt-3 font-display text-4xl font-black sm:text-5xl">BOSS <span className="text-[#a3f3d2]">CAMPAIGN</span></h1>
          <p className="mt-3 max-w-lg text-sm font-semibold text-[#e3e5f4]">Answer to charge energy. Pick your moves. Battle subject bosses and unlock tougher stages.</p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-full bg-white/15 px-3 py-1.5">⏱ {QUESTION_TIME} seconds / question</span><span className="rounded-full bg-white/15 px-3 py-1.5">⚡ Hit · Special · Block</span></div>
          <Link href="/login?next=/campaign" className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-[#a3f3d2] px-6 font-display font-extrabold text-[#142939] shadow-[0_4px_0_#58ab8b]">Sign in to play →</Link>
        </div>
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
        <div className="flex items-center justify-between gap-3 text-sm text-inksoft">
          <button onClick={toMap} className="rounded-lg border border-rule bg-white px-3 py-2 font-bold">← Map</button>
          <span className="font-display font-extrabold tracking-wide">⚔️ {label(active)} · STAGE {stage}</span>
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

        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[1fr_1fr]">
        <div
          className={`relative overflow-hidden rounded-3xl px-4 py-5 ${shakeScreen ? 'fx-screen-shake' : ''}`}
          style={{ background: 'linear-gradient(180deg,rgba(16,18,42,.78),rgba(23,22,46,.91)), url(/art/arena-hero.webp) center / cover, #241f38' }}
        >
          {/* Boss character */}
          <div className="relative flex flex-col items-center">
            {floatHit?.who === 'boss' && (
              <span key={floatHit.key} className="fx-float text-5xl" style={{ top: 20, color: '#ffd34d', textShadow: '0 3px 0 #7a4a00, 0 0 12px rgba(0,0,0,0.5)' }}>{floatHit.text}</span>
            )}
            <div className={bossAnim === 'lunge' ? 'fx-boss-lunge' : bossAnim === 'hurt' ? 'fx-shake' : ''}>
              <div className={bossAnim === 'hurt' ? 'fx-hit-blink' : ''}>
                <BossArt subject={active} frac={frac} defeated={bhp <= 0} pose={bossPose} className="h-32 md:h-44" />
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
                <PlayerFighter char={fighter} pose={playerPose} className="h-16 md:h-20" />
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
                <div className="flex gap-1" role="meter" aria-label="Energy" aria-valuemin={0} aria-valuemax={MAX_AP} aria-valuenow={ap}>
                  {Array.from({ length: MAX_AP }).map((_, i) => (
                    <span key={i} className={`h-3 w-3 rounded-full ${i < ap ? 'bg-gold' : 'bg-white/15'}`} />
                  ))}
                </div>
                <span className="text-xs font-bold text-white/90">{ap}/{MAX_AP} energy</span>
                {combo >= 2 && <span className="lg-pop text-xs font-display font-extrabold text-amber-300">🔥 {combo} streak</span>}
              </div>
            </div>
          </div>

          {/* Boss telegraph — Block to negate */}
          {bossCharging && (
            <div role="status" className="mx-auto mt-3 w-full max-w-xs rounded-xl border border-rose-400/60 bg-rose-500/30 px-3 py-2 text-center text-sm font-display font-extrabold text-rose-50">
              ⚡ “{taunt}”<br />{CHARGE_DMG} HP incoming on answer or timeout. Block to stop it!
            </div>
          )}

          {/* Action bar — spend Energy whenever you like */}
          <div className="mx-auto mt-3 grid w-full max-w-xs grid-cols-3 gap-2">
            <ActionBtn onClick={hitBoss} disabled={ap < HIT_COST || !battling} cost={HIT_COST} bg="#c47165" deep="#9c4a50" detail={`${strikeDamage(combo)} damage`}>⚔️ Hit</ActionBtn>
            <ActionBtn onClick={specialBoss} disabled={ap < SPECIAL_COST || !battling} cost={SPECIAL_COST} bg="#6d5b8a" deep="#4e4068" detail={`${SPECIAL_DMG} damage`}>💥 Special</ActionBtn>
            <ActionBtn onClick={blockMove} disabled={ap < BLOCK_COST || !battling} cost={BLOCK_COST} bg="#6b9b7c" deep="#4a7a5b" detail={`heal ≤${BLOCK_HEAL} · shield`}>🛡️ Block</ActionBtn>
          </div>
          <p className="mx-auto mt-3 max-w-xs text-center text-xs leading-relaxed text-white/80">Correct answers earn energy: +2 with {Math.ceil(QUESTION_TIME * 0.55)}s or more left, otherwise +1. Block stops a charge and shields one wrong answer.</p>
        </div>

        {/* Outcome banners / question */}
        {runFailed ? (
          <div className="lg-card px-5 py-6 text-center">
            <div className="lg-pop text-5xl">💀</div>
            <p className="mt-2 font-display font-extrabold text-ink text-lg">You were knocked out!</p>
            <p className="mt-1 text-inksoft">The {label(active)} boss got you. HP resets — jump back in.</p>
            <QuestionReview questions={missed} />
            <button onClick={retryRun} disabled={busy} className="lg-btn lg-btn-primary mt-5 w-full px-6 py-4">
              {busy ? 'Loading…' : 'Retry battle'}
            </button>
            <button onClick={toMap} className="mt-3 text-sm text-berrydeep underline">Back to map</button>
          </div>
        ) : victory ? (
          <div className="lg-card px-5 py-6 text-center">
            <div className="lg-pop text-5xl">🏆</div>
            <p className="mt-2 font-display font-extrabold text-ink text-lg">
              {label(active)} boss defeated! +<CountUp to={victory.reward} /> ✨
            </p>
            <p className="mt-1 text-inksoft">Stage {victory.stage} unlocked (tougher!)</p>
            <QuestionReview questions={missed} />

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
        ) : bhp <= 0 ? (
          <div className="lg-card px-5 py-6 text-center" role="status">
            <div className="text-5xl">⚔️</div>
            <p className="mt-3 font-display text-xl font-extrabold text-ink">Boss defeated!</p>
            <p className="mt-2 text-inksoft">{err ? 'Your battle is over, but we could not confirm the reward or next stage.' : 'Confirming your victory…'}</p>
            {err && <QuestionReview questions={missed} />}
            {err && <button onClick={toMap} className="lg-btn lg-btn-primary mt-5 w-full px-6 py-4">Back to map</button>}
          </div>
        ) : q ? (
          <section className="rounded-3xl border border-[#555c83] bg-[#202642] px-4 py-5 text-white shadow-lg sm:px-6">
            {/* Countdown */}
            <div className="flex items-center justify-between gap-3 text-xs font-black tracking-widest text-[#c2c8e4]"><span>QUESTION {qi + 1}</span><span className="rounded-full bg-[#a3f3d2]/15 px-3 py-1 text-[#a3f3d2]">⚡ CORRECT = ENERGY</span></div>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-3 flex-1 rounded-full bg-white/15 overflow-hidden" role="progressbar" aria-label="Time remaining" aria-valuemin={0} aria-valuemax={QUESTION_TIME} aria-valuenow={Math.max(0, timeLeft)}>
                <div className="h-full transition-all duration-1000 ease-linear" style={{ width: `${Math.max(0, tFrac) * 100}%`, background: tColor }} />
              </div>
              <span className={`min-w-12 text-right font-mono text-2xl font-black tabular-nums ${timeLeft <= 5 ? 'text-rose-300' : 'text-[#a3f3d2]'}`}>{Math.max(0, timeLeft)}s</span>
            </div>

            <h2 className="mt-5 text-xl md:text-2xl font-display font-bold text-white leading-snug">
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
              <p role="status" className={`mt-4 font-display font-extrabold ${answered.correct && !answered.chargeLanded ? 'text-[#a3f3d2]' : 'text-rose-200'}`}>
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
          </section>
        ) : (
          <div className="lg-card px-5 py-6 text-center"><p className="font-semibold text-inksoft">{busy ? 'Loading questions…' : 'Questions are unavailable right now. Your battle is paused.'}</p>{!busy && <div className="mt-4 flex flex-wrap justify-center gap-3"><button onClick={() => { if (active) void loadQuestions(active, battleIdRef.current); }} className="lg-btn lg-btn-primary px-4 py-2">Retry questions</button><button onClick={toMap} className="text-sm font-bold text-plum underline">Back to map</button></div>}</div>
        )}
        </div>
        {err && <Err>{err}</Err>}
      </Shell>
    );
  }

  // ---------- MAP ----------
  return (
    <Shell map>
      <div className="overflow-hidden rounded-3xl bg-[#201e42] px-5 py-6 text-white sm:px-8" style={{ backgroundImage: 'linear-gradient(90deg,rgba(26,25,55,.98),rgba(26,25,55,.72)), url(/art/arena-hero.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <p className="text-xs font-black tracking-[.2em] text-[#a3f3d2]">⚔️ SOLO BOSS BATTLES</p>
        <h1 className="mt-2 font-display text-4xl font-black tracking-tight sm:text-5xl">BOSS <span className="text-[#a3f3d2]">CAMPAIGN</span></h1>
        <p className="mt-3 text-sm font-semibold text-[#e3e5f4]">Answer to charge up. Spend energy to fight. Defeat the boss.</p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-full bg-white/15 px-3 py-1.5">⏱ {QUESTION_TIME} seconds / question</span><span className="rounded-full bg-white/15 px-3 py-1.5">⚡ {MAX_AP} max energy</span><span className="rounded-full bg-white/15 px-3 py-1.5">🏆 Beat stages</span></div>
      </div>

      {/* Choose your fighter */}
      <div className="mt-4">
        <p className="text-xs font-display font-extrabold tracking-widest text-plum">PICK YOUR FIGHTER</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {FIGHTERS.map((f) => (
            <button key={f} onClick={() => chooseFighter(f)} aria-pressed={fighter === f}
              className={`rounded-2xl p-1.5 text-center transition ${fighter === f ? 'ring-2 ring-plum bg-parchment-deep' : 'bg-panel border border-rule'}`}>
              <PlayerFighter char={f} pose="idle" className="h-14 w-14" />
              <div className="text-[10px] text-muted">{FIGHTER_LABEL[f]}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Boss selection makes each battle a visible game destination. */}
      <div className="mt-7 w-full">
        <h2 className="font-display text-2xl font-black text-ink">Choose your battle</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleBosses.map((b) => (
            <button key={b.subject} onClick={() => enter(b)} disabled={busy}
              className="group relative flex min-h-40 items-center gap-3 overflow-hidden rounded-2xl border border-[#645a91] bg-gradient-to-br from-[#35305b] to-[#1d2845] px-4 py-4 text-left text-white shadow-[0_4px_0_#17182d] transition hover:-translate-y-1 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-plum disabled:opacity-60">
              <div className="relative grid h-24 w-24 shrink-0 place-items-center rounded-2xl bg-white/10"><BossArt subject={b.subject} frac={1} className="h-24 w-24" /></div>
              <div className="min-w-0"><div className="text-[10px] font-black tracking-widest text-[#a3f3d2]">{label(b.subject).toUpperCase()} · STAGE {b.stage}</div><div className="mt-1 font-display text-lg font-extrabold leading-tight">{bossLore(b.subject).name}</div><div className="mt-2 text-xs font-bold text-[#d4d5eb]">{b.defeated_count > 0 ? `⭐ ${b.defeated_count} cleared` : 'READY TO FIGHT →'}</div></div>
            </button>
          ))}
        </div>
        {visibleBossesStatus === 'loading' && <p className="mt-3 text-sm text-inksoft" role="status">Summoning bosses…</p>}
        {visibleBossesStatus === 'error' && <div className="mt-3 rounded-xl border border-rule bg-panel p-4" role="alert"><p className="text-sm text-inksoft">Couldn’t load your bosses: {bossesError}</p><button onClick={retryBosses} className="lg-btn lg-btn-primary mt-3 px-4 py-2">Retry</button></div>}
        {visibleBossesStatus === 'ready' && !visibleBosses.length && <p className="mt-3 text-sm text-inksoft">No boss battles are available yet.</p>}
      </div>
      {err && <Err>{err}</Err>}
      <Home />
    </Shell>
  );
}

function ActionBtn({ children, onClick, disabled, cost, bg, deep, detail }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; cost: number; bg: string; deep: string; detail: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="lg-btn relative px-2 py-2.5 text-sm text-white disabled:opacity-40 active:translate-y-0.5"
      style={{ background: bg, boxShadow: `0 4px 0 ${deep}` }}>
      {children}
      <span className="mt-0.5 block text-[10px] font-semibold leading-tight text-white/90">{detail}</span>
      <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-extrabold text-ink">
        {cost}⚡
      </span>
    </button>
  );
}

function QuestionReview({ questions }: { questions: MissedQuestion[] }) {
  if (!questions.length) return null;
  return (
    <details className="mt-4 rounded-xl border border-rule bg-parchment px-4 py-3 text-left text-sm">
      <summary className="cursor-pointer font-display font-extrabold text-ink">Review {questions.length} missed {questions.length === 1 ? 'question' : 'questions'}</summary>
      <div className="mt-3 space-y-4">{questions.map((question, index) => (
        <div key={`${question.id}-${index}`} className="border-t border-rule pt-3">
          <p className="font-bold text-ink"><MathText text={question.stem} /></p>
          <p className="mt-1 text-inksoft">{question.timeout ? 'Time ran out. ' : ''}Answer: <MathText text={question.correct || 'Unavailable'} /></p>
          {question.explanation && <p className="mt-2 text-inksoft"><MathText text={question.explanation} /></p>}
        </div>
      ))}</div>
    </details>
  );
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
const Shell = ({ children, wide = false, map = false }: { children: React.ReactNode; wide?: boolean; map?: boolean }) => (
  <main
    className={`flex flex-1 flex-col px-6 pt-12 pb-10 w-full mx-auto ${
      wide ? 'max-w-6xl md:px-10' : map ? 'max-w-md md:max-w-5xl' : 'max-w-md'
    }`}
  >
    {children}
  </main>
);
const Err = ({ children }: { children: React.ReactNode }) => <p className="mt-3 text-brick text-sm">{children}</p>;
const Home = () => <Link href="/" className="mt-6 text-center text-sm text-muted underline">Home</Link>;
