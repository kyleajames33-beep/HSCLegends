import Link from 'next/link';
import AuthLink from '@/components/auth-link';
import HomeStats from '@/components/home-stats';
import InstallPrompt from '@/components/install-prompt';
import OnboardingGate from '@/components/onboarding-gate';
import NotificationToggle from '@/components/notification-toggle';

// Phone-first home. One unambiguous primary action (Quick Game), everything else
// one tap below. Live Class Game + Boss are Phase 1/3 — shown as "soon".
export default function Home() {
  return (
    <main className="flex flex-1 flex-col px-6 pt-16 pb-10 max-w-md w-full mx-auto">
      <div className="flex-1 flex flex-col">
        <p className="text-indigo-400 font-semibold tracking-wide text-sm">HSC LEGENDS</p>
        <h1 className="mt-2 text-4xl font-bold leading-tight">
          Beat today.<br />Keep the streak.
        </h1>
        <p className="mt-3 text-zinc-400">
          60-second quizzes across all six HSC subjects. Play on the bus, climb the leaderboard.
        </p>

        <HomeStats />

        <Link
          href="/play"
          className="mt-8 block rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 px-6 py-5 text-center text-lg font-semibold shadow-lg shadow-indigo-900/40 transition"
        >
          ▶ Quick Game
        </Link>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Link href="/join" className="rounded-2xl border border-zinc-800 hover:border-indigo-500 px-4 py-4 transition">
            <div className="font-semibold text-zinc-100">Join Class Game</div>
            <div className="text-xs mt-1 text-zinc-500">enter a code</div>
          </Link>
          <Link href="/boss" className="rounded-2xl border border-zinc-800 hover:border-indigo-500 px-4 py-4 transition">
            <div className="font-semibold text-zinc-100">Weekly Boss 👹</div>
            <div className="text-xs mt-1 text-zinc-500">fight as a class</div>
          </Link>
        </div>
        <Link href="/leaderboard" className="mt-3 block rounded-2xl border border-zinc-800 hover:border-indigo-500 px-4 py-3 text-center font-semibold text-zinc-100 transition">
          🏆 Leaderboard
        </Link>

        <NotificationToggle />
      </div>

      <p className="text-center text-xs text-zinc-600 space-x-2">
        <AuthLink />
        <span>·</span>
        <Link href="/host" className="underline">
          Host a game
        </Link>
        <span>·</span>
        <Link href="/classes" className="underline">
          Classes
        </Link>
        <span>·</span>
        <a href="https://hscscience.com.au" className="underline">
          hscscience.com.au
        </a>
      </p>
      <InstallPrompt />
      <OnboardingGate />
    </main>
  );
}
