import Link from 'next/link';
import AuthLink from '@/components/auth-link';
import InstallPrompt from '@/components/install-prompt';
import OnboardingGate from '@/components/onboarding-gate';
import ArcadeHeader from '@/components/arcade-header';
import TabBar from '@/components/tab-bar';
import { ConnectedModes, FeaturedModes, LobbyActions, LobbyHero } from '@/components/game-lobby';

export default function Home() {
  return (
    <main className="arcade-surface w-full flex-1 bg-[#0e1325] text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col px-4 pt-5 sm:px-8 sm:pt-7">
        <a href="#game-actions" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:font-bold focus:text-[#101729] focus:outline-2 focus:outline-[#c3f67a]">Skip to game choices</a>
        <ArcadeHeader active="home" />
        <LobbyHero />
        <div className="mt-4"><LobbyActions /></div>
        <p className="mt-3 text-xs font-semibold text-[#c5cde0]">Live classroom games are in testing. Solo samples are ready now.</p>
        <section className="mt-9" aria-labelledby="featured-games">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div><p className="text-[10px] font-black tracking-[0.18em] text-[#a7e1d0]">PICK YOUR ADVENTURE</p><h2 id="featured-games" className="mt-1 font-display text-3xl font-black">Jump into a game</h2></div>
            <Link href="/games" className="shrink-0 text-sm font-bold text-[#c3f67a] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c3f67a]">All games →</Link>
          </div>
          <FeaturedModes />
        </section>
        <details className="mt-10">
          <summary className="cursor-pointer font-display text-lg font-black text-[#d4daea]">More connected games</summary>
          <p className="mb-4 mt-2 text-sm text-[#c5cde0]">Availability varies; these modes need a configured connection.</p>
          <ConnectedModes />
          <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold text-[#d4daea]"><Link href="/season" prefetch={false} className="underline underline-offset-4">Term Pass</Link><Link href="/achievements" prefetch={false} className="underline underline-offset-4">Achievements</Link></div>
        </details>
        <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-[#35405b] py-6 text-sm font-semibold text-[#d4daea] [&_.text-muted]:text-[#d4daea]">
          <Link href="/study" prefetch={false} className="underline underline-offset-4">Study tools</Link>
          <Link href="/progress" prefetch={false} className="underline underline-offset-4">Your progress</Link>
          <Link href="/classes" prefetch={false} className="underline underline-offset-4">Classes</Link>
          <AuthLink />
        </div>
        <InstallPrompt />
        <OnboardingGate />
        <TabBar active="today" appearance="arcade" />
      </div>
    </main>
  );
}
