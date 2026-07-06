'use client';

import { useState, useEffect } from 'react';

// Partner card: shows who you're facing, their betrayal history
export function PartnerCard({
  name,
  stolenFromYou,
  timeoutSeconds,
}: {
  name: string;
  stolenFromYou: number;
  timeoutSeconds: number; // remaining decision time
}) {
  const warningLevel = stolenFromYou > 2 ? 'danger' : stolenFromYou > 0 ? 'caution' : 'neutral';
  const bgClass = warningLevel === 'danger' ? 'bg-red-500/20 border-red-500/50' : warningLevel === 'caution' ? 'bg-amber-500/20 border-amber-500/40' : 'bg-blue-500/20 border-blue-500/40';
  const textClass = warningLevel === 'danger' ? 'text-red-200' : warningLevel === 'caution' ? 'text-amber-200' : 'text-blue-200';

  return (
    <div className={`rounded-xl border-2 p-4 ${bgClass}`}>
      <p className={`text-xs font-semibold uppercase tracking-wider ${textClass} mb-2`}>Your opponent</p>
      <p className="text-2xl font-bold text-white">{name}</p>
      {stolenFromYou > 0 && (
        <p className="text-xs text-red-300 mt-2">
          ⚠️ Has stolen from you {stolenFromYou}x
        </p>
      )}
      {stolenFromYou === 0 && <p className="text-xs text-blue-300 mt-2">✓ Fresh start</p>}
      <div className="mt-3 text-xs text-white/60">
        Decision window: <span className={`font-bold ${timeoutSeconds <= 2 ? 'text-red-300 animate-pulse' : 'text-white'}`}>{timeoutSeconds}s</span>
      </div>
    </div>
  );
}

// Pot display: your stake in the round's pot (their stake stays hidden until reveal)
export function PotDisplay({ amount, isCalculating }: { amount: number; isCalculating?: boolean }) {
  return (
    <div className="rounded-xl border-2 border-amber-500/60 bg-amber-500/20 p-4 text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-200 mb-2">Your stake</p>
      <div className={`text-4xl font-bold text-amber-300 transition-all ${isCalculating ? 'scale-110' : 'scale-100'}`}>💰 {amount}</div>
      <p className="text-xs text-amber-300/70 mt-1">in the pot — theirs is hidden until the reveal</p>
    </div>
  );
}

// Decision button: SHARE or STEAL, with countdown integration
export function DecisionButton({
  choice,
  isSelected,
  isLocked,
  disabled,
  timeoutFraction, // 0-1, where 1 = full time left, 0 = time expired
  onClick,
}: {
  choice: 'share' | 'steal';
  isSelected: boolean;
  isLocked: boolean;
  disabled: boolean;
  timeoutFraction: number;
  onClick: () => void;
}) {
  const isShare = choice === 'share';
  const bgBase = isShare ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500';
  const bgSelected = isSelected ? (isShare ? 'ring-4 ring-green-300' : 'ring-4 ring-red-300') : '';
  const emoji = isShare ? '🤝' : '💰';
  const label = isShare ? 'SHARE' : 'STEAL';
  const timeoutPercent = Math.min(100, Math.max(0, timeoutFraction * 100));

  return (
    <button
      onClick={onClick}
      disabled={disabled || isLocked}
      className={`relative flex-1 rounded-lg py-6 font-bold text-xl transition-all active:translate-y-0.5 disabled:opacity-50 ${bgBase} ${bgSelected} text-white overflow-hidden`}
      style={{
        boxShadow: isSelected ? `0 0 16px ${isShare ? '#4ade80' : '#f87171'}` : '0 4px 0 rgba(0,0,0,0.3)',
      }}
    >
      {/* Timeout progress bar */}
      {!isLocked && (
        <div
          className="absolute inset-0 top-0 left-0 h-1 bg-white/40 transition-all"
          style={{ width: `${100 - timeoutPercent}%` }}
        />
      )}

      {/* Content */}
      <div className="relative z-10">
        <div className="text-3xl mb-1">{emoji}</div>
        <div>{label}</div>
        {isLocked && <div className="text-xs mt-1">✓ Locked in</div>}
      </div>
    </button>
  );
}

// Reveal card: shows both choices and outcome
export function RevealCard({
  yourChoice,
  theirChoice,
  yourPoints,
  theirPoints,
  outcome,
}: {
  yourChoice: 'share' | 'steal';
  theirChoice: 'share' | 'steal';
  yourPoints: number;
  theirPoints: number;
  outcome: 'both_share' | 'a_stole' | 'b_stole' | 'both_steal';
}) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setFlipped(true), 300);
    return () => clearTimeout(t);
  }, []);

  const bgOutcome =
    outcome === 'both_share' ? 'bg-green-500/20 border-green-500/50' : outcome === 'both_steal' ? 'bg-slate-500/20 border-slate-500/40' : 'bg-red-500/20 border-red-500/50';

  const textOutcome =
    outcome === 'both_share'
      ? '✓ Both shared — trust paid off!'
      : outcome === 'both_steal'
      ? '💥 Both stole — nobody wins'
      : '⚡ Someone stole!';

  return (
    <div className={`rounded-xl border-2 p-6 ${bgOutcome}`}>
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Your choice */}
        <div
          className={`text-center p-4 rounded-lg bg-white/10 transition-all ${!flipped ? 'opacity-0 scale-50' : 'opacity-100 scale-100'}`}
          style={{ transitionDelay: '0.1s' }}
        >
          <p className="text-xs font-semibold text-blue-300 mb-2">You</p>
          <div className="text-3xl mb-2">{yourChoice === 'share' ? '🤝' : '💰'}</div>
          <p className="text-sm font-bold text-white">{yourChoice.toUpperCase()}</p>
        </div>

        {/* Their choice */}
        <div
          className={`text-center p-4 rounded-lg bg-white/10 transition-all ${!flipped ? 'opacity-0 scale-50' : 'opacity-100 scale-100'}`}
          style={{ transitionDelay: '0.15s' }}
        >
          <p className="text-xs font-semibold text-purple-300 mb-2">Them</p>
          <div className="text-3xl mb-2">{theirChoice === 'share' ? '🤝' : '💰'}</div>
          <p className="text-sm font-bold text-white">{theirChoice.toUpperCase()}</p>
        </div>
      </div>

      {/* Outcome text */}
      <p className="text-center font-bold text-lg text-white mb-4">{textOutcome}</p>

      {/* Points display */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`text-center p-3 rounded-lg ${yourPoints > 0 ? 'bg-green-500/25' : 'bg-red-500/25'}`}>
          <p className="text-xs text-white/70">You got</p>
          <p className={`text-2xl font-bold ${yourPoints > 0 ? 'text-green-300' : 'text-red-300'}`}>
            {yourPoints > 0 ? '+' : ''}{yourPoints}
          </p>
        </div>
        <div className={`text-center p-3 rounded-lg ${theirPoints > 0 ? 'bg-green-500/25' : 'bg-red-500/25'}`}>
          <p className="text-xs text-white/70">They got</p>
          <p className={`text-2xl font-bold ${theirPoints > 0 ? 'text-green-300' : 'text-red-300'}`}>
            {theirPoints > 0 ? '+' : ''}{theirPoints}
          </p>
        </div>
      </div>
    </div>
  );
}
