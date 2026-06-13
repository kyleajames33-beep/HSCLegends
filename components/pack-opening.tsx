'use client';

import { useEffect, useState } from 'react';
import { celebrate } from '@/lib/confetti';
import { RARITY, cardImageSrc, type PullCard } from '@/lib/cards';
import Avatar from '@/components/avatar';

// Full-screen reveal overlay for a freshly opened pack. Suspense → the card
// flips up with a rarity-coloured glow (extra flourish + confetti for epic+).
// Tap anywhere to dismiss.
export default function PackOpening({ card, onClose }: { card: PullCard; onClose: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const r = RARITY[card.rarity];
  const big = card.rarity === 'epic' || card.rarity === 'legendary' || card.rarity === 'mythic';
  const imgSrc = cardImageSrc(card);

  useEffect(() => {
    const t = setTimeout(() => {
      setRevealed(true);
      if (big) celebrate(card.rarity !== 'epic'); // bigger burst for legendary/mythic
    }, 650);
    return () => clearTimeout(t);
  }, [big, card.rarity]);

  return (
    <div
      onClick={revealed ? onClose : undefined}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink/80 px-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      {/* Radial rarity glow behind the card */}
      <div
        className={`pointer-events-none absolute h-72 w-72 rounded-full blur-3xl transition-opacity duration-700 ${revealed ? 'opacity-70' : 'opacity-0'}`}
        style={{ background: 'radial-gradient(circle, currentColor 0%, transparent 70%)' }}
      >
        <span className={r.text} />
      </div>

      {/* Card */}
      <div
        className={`relative transition-all duration-700 ease-out ${
          revealed ? 'scale-100 rotate-0 opacity-100' : 'scale-50 rotate-12 opacity-0'
        }`}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div
          className={`flex w-60 flex-col items-center rounded-3xl border-4 bg-panel px-5 py-7 text-center shadow-2xl ${r.border} ${r.glow}`}
        >
          <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest ${r.chip}`}>
            {r.label}
          </span>

          <div className="mt-5 flex h-28 w-28 items-center justify-center">
            {imgSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imgSrc} alt={card.name} className="max-h-28 object-contain drop-shadow-lg" />
            ) : card.art_kind === 'dicebear' ? (
              <Avatar seed={card.art_ref} style="funEmoji" size={104} className="rounded-2xl" />
            ) : (
              <span style={{ fontSize: 86, lineHeight: 1 }}>{card.art_ref}</span>
            )}
          </div>

          <h2 className="mt-4 font-display text-xl font-extrabold text-ink">{card.name}</h2>
          <p className="mt-1 text-xs italic text-muted">{card.flavor}</p>

          <div className="mt-4">
            {card.is_dupe ? (
              <span className="rounded-full bg-gold/25 px-3 py-1 text-sm font-bold text-golddeep">
                Dupe · +{card.refund} ✨
              </span>
            ) : (
              <span className="rounded-full bg-leaf/20 px-3 py-1 text-sm font-extrabold text-leaf">
                NEW!
              </span>
            )}
          </div>
        </div>
      </div>

      <p className={`mt-8 text-sm text-white/80 transition-opacity duration-500 ${revealed ? 'opacity-100' : 'opacity-0'}`}>
        Tap to continue
      </p>
    </div>
  );
}
