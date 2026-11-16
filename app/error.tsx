'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { Gamepad2, RotateCcw } from 'lucide-react';

export default function GameError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return (
    <main className="arcade-surface grid min-h-dvh place-items-center bg-[#0b1020] px-6 py-12 text-white">
      <div className="w-full max-w-md">
        <Gamepad2 aria-hidden className="mb-6 h-12 w-12 text-[#c3f67a]" />
        <p className="text-xs font-black tracking-[.16em] text-[#c3f67a]">HSC LEGENDS</p>
        <h1 ref={heading} tabIndex={-1} className="mt-3 text-4xl font-black leading-tight outline-none">Play interrupted.</h1>
        <p className="mt-4 leading-relaxed text-[#bcc6dd]">The screen couldn’t load. Try again, or head back to the arcade.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <button onClick={() => unstable_retry()} className="flex min-h-12 items-center gap-2 rounded-xl bg-[#c3f67a] px-5 font-bold text-[#1c2b20] focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white"><RotateCcw aria-hidden size={18} /> Try again</button>
          <Link href="/games" prefetch={false} className="flex min-h-12 items-center rounded-xl border border-[#596483] px-5 font-bold focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#c3f67a]">Game arcade</Link>
        </div>
      </div>
    </main>
  );
}
