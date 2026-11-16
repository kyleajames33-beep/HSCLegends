import Link from 'next/link';
import { Orbit } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="arcade-surface grid min-h-dvh place-items-center bg-[#0b1020] px-6 py-12 text-white">
      <div className="w-full max-w-md">
        <Orbit aria-hidden className="mb-6 h-14 w-14 text-[#bba6ff]" />
        <p className="text-xs font-black tracking-[.16em] text-[#c3f67a]">404 · OUT OF BOUNDS</p>
        <h1 className="mt-3 text-4xl font-black leading-tight">Lost in the lab?</h1>
        <p className="mt-4 leading-relaxed text-[#bcc6dd]">That page isn’t here. Your next game is waiting in the arcade.</p>
        <Link href="/games" prefetch={false} className="mt-7 inline-flex min-h-12 items-center rounded-xl bg-[#c3f67a] px-5 font-bold text-[#1c2b20] focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white">Back to games →</Link>
      </div>
    </main>
  );
}
