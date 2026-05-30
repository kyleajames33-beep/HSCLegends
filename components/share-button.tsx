'use client';

import { useState } from 'react';

// Share the user's streak via the native share sheet, falling back to clipboard.
export default function ShareButton({ streak, className }: { streak: number; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = `${location.origin}/share?streak=${streak}`;
    const text = `I'm on a ${streak}-day streak on HSC Legends 🔥 Can you beat me?`;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try { await nav.share({ title: 'HSC Legends', text, url }); } catch { /* cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch { /* ignore */ }
    }
  }
  return (
    <button onClick={share} className={className ?? 'text-sm text-zinc-400 underline'}>
      {copied ? 'Link copied!' : '📣 Share my streak'}
    </button>
  );
}
