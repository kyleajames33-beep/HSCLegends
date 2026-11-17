import Link from 'next/link';
import TabBar from '@/components/tab-bar';
import ArcadeHeader from '@/components/arcade-header';
import { ConnectedModes, FeaturedModes, LobbyActions } from '@/components/game-lobby';

const moreModes = [
  { href: '/duel', emoji: '⚔️', title: 'Duel', detail: 'Challenge another player' },
  { href: '/match', emoji: '🔗', title: 'Match', detail: 'Race to match pairs' },
  { href: '/event', emoji: '🏆', title: 'Championship', detail: 'Enter a live event' },
  { href: '/boss', emoji: '👹', title: 'Weekly Boss', detail: 'Fight as a class' },
  { href: '/hq', emoji: '🏛️', title: 'Research HQ', detail: 'Build your base' },
  { href: '/play', emoji: '⚡', title: 'Quick Game', detail: 'Jump straight in' },
  { href: '/collection', emoji: '🃏', title: 'Collection', detail: 'See your Legend cards' },
];

export default function Games() {
  return (
    <main className="arcade-surface w-full flex-1 bg-[#0e1325] text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col px-4 pt-7 sm:px-8">
        <a href="#game-actions" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:font-bold focus:text-[#101729] focus:outline-2 focus:outline-[#c3f67a]">Skip to game choices</a>
        <ArcadeHeader active="games" />
        <div className="mb-6">
          <p className="mt-2 text-[10px] font-black tracking-[.18em] text-[#a7e1d0]">THE GAME ARCADE</p>
          <h1 className="mt-1 font-display text-4xl font-black sm:text-5xl">Choose your game.</h1>
          <p className="mt-2 text-sm font-semibold text-[#c5cde0]">Build, battle and play your way.</p>
        </div>
        <LobbyActions />
        <p className="mt-3 text-xs font-semibold text-[#c5cde0]">Live classroom games are in testing. Solo samples are ready now.</p>
        <Link href="/question-import" prefetch={false} className="mt-2 w-fit text-xs font-semibold text-[#c3f67a] underline">Teachers: prepare questions</Link>
        <section className="mt-9" aria-labelledby="featured">
          <p className="text-[10px] font-black tracking-[0.18em] text-[#a7e1d0]">NO ACCOUNT NEEDED</p>
          <h2 id="featured" className="mb-4 mt-1 font-display text-3xl font-black">Solo samples</h2>
          <FeaturedModes />
        </section>
        <details className="mt-10">
          <summary className="cursor-pointer font-display text-xl font-black">More connected games</summary>
          <p className="mb-4 mt-1 text-sm text-[#c5cde0]">These modes need a configured connection and may need an account.</p>
          <ConnectedModes />
          <h2 className="mb-4 mt-8 font-display text-xl font-black">Explore more</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {moreModes.map((mode) => (
              <Link key={mode.href} href={mode.href} prefetch={false} className="flex min-h-24 items-center gap-4 rounded-2xl border border-[#3d4967] bg-[#1b243b] p-4 transition hover:-translate-y-1 hover:border-[#95a8ca] focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#c3f67a] motion-reduce:transition-none">
                <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/5 text-2xl">{mode.emoji}</span>
                <span><span className="block font-display text-lg font-extrabold text-white">{mode.title}</span><span className="block text-sm text-[#c5cde0]">{mode.detail}</span></span>
              </Link>
            ))}
          </div>
        </details>
        <TabBar active="play" appearance="arcade" />
      </div>
    </main>
  );
}
