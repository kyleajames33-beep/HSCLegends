'use client';

import Avatar from '@/components/avatar';
import { RARITY, cardImageSrc, type ArtKind, type Rarity } from '@/lib/cards';

type Props = {
  name: string;
  rarity: Rarity;
  art_kind: ArtKind;
  art_ref: string;
  count?: number;        // 0 / undefined = unowned (locked silhouette)
  size?: number;         // art size in px
  onClick?: () => void;
  className?: string;
  glow?: boolean;        // extra glow (used in reveals)
};

// A single Legend Card: rarity-coloured frame + glow, art (boss img / emoji /
// DiceBear), name, and either an owned-count chip or a locked silhouette.
export default function CardTile({
  name, rarity, art_kind, art_ref, count = 0, size = 64, onClick, className = '', glow = false,
}: Props) {
  const r = RARITY[rarity];
  const owned = count > 0;
  const imgSrc = cardImageSrc({ art_kind, art_ref });

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center rounded-2xl border-2 bg-panel px-2 py-3 text-center transition
        ${r.border} ${owned ? `shadow-md ${r.glow}` : 'opacity-90'} ${glow ? `shadow-lg ${r.glow}` : ''}
        ${onClick ? 'active:translate-y-0.5' : ''} ${className}`}
    >
      {/* Rarity badge */}
      <span className={`absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${r.chip}`}>
        {r.label}
      </span>
      {/* Count / lock badge */}
      {owned ? (
        count > 1 && (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white">
            ×{count}
          </span>
        )
      ) : (
        <span className="absolute right-1.5 top-1.5 text-xs">🔒</span>
      )}

      {/* Art */}
      <div
        className="mt-3 flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        {!owned ? (
          // Locked silhouette
          <span className="text-4xl grayscale" style={{ filter: 'brightness(0) opacity(0.18)' }}>
            {art_kind === 'emoji' ? art_ref : '❓'}
          </span>
        ) : imgSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgSrc} alt={name} width={size} height={size} className="object-contain drop-shadow" style={{ maxHeight: size }} />
        ) : art_kind === 'dicebear' ? (
          <Avatar seed={art_ref} style="funEmoji" size={size} className="rounded-xl" />
        ) : (
          <span style={{ fontSize: size * 0.7, lineHeight: 1 }}>{art_ref}</span>
        )}
      </div>

      {/* Name */}
      <p className={`mt-2 line-clamp-2 text-xs font-display font-bold leading-tight ${owned ? 'text-ink' : 'text-muted'}`}>
        {owned ? name : '???'}
      </p>
    </button>
  );
}
