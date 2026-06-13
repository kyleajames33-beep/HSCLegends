import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import AuthLink from '@/components/auth-link';
import HomeStats from '@/components/home-stats';
import TodayQuizzes from '@/components/today-quizzes';
import InstallPrompt from '@/components/install-prompt';
import OnboardingGate from '@/components/onboarding-gate';
import NotificationToggle from '@/components/notification-toggle';

export default function Home() {
  return (
    <main className="flex flex-1 flex-col px-6 pt-14 pb-10 max-w-md w-full mx-auto">
      <div className="flex-1 flex flex-col">
        <p className="text-berrydeep font-display font-bold tracking-[0.15em] text-sm">HSC LEGENDS</p>
        <h1 className="mt-2 text-[2.6rem] font-extrabold leading-[1.05] text-ink">
          Beat today.<br />Keep the streak.
        </h1>
        <p className="mt-3 text-inksoft">
          60-second quizzes across all six HSC subjects. Play on the bus, climb the leaderboard.
        </p>

        <HomeStats />

        <TodayQuizzes />

        <Link
          href="/play"
          className="lg-card mt-4 flex items-center justify-between px-4 py-3.5 active:translate-y-0.5 transition"
        >
          <span className="font-display font-bold text-ink">🎲 Free practice</span>
          <span className="text-sm text-muted inline-flex items-center gap-1">any subject <ChevronRight className="h-4 w-4" /></span>
        </Link>

        <div className="mt-3 grid grid-cols-3 gap-3">
          <Link href="/knockout" className="rounded-2xl px-3 py-4 text-center active:translate-y-0.5 transition text-white"
            style={{ background: 'linear-gradient(135deg,#2d3142,#4e4068)', boxShadow: '0 4px 0 #1a1d2e' }}>
            <div className="text-2xl">☠️</div>
            <div className="font-display font-extrabold mt-1 text-sm">Knockout</div>
          </Link>
          <Link href="/duel" className="rounded-2xl px-3 py-4 text-center active:translate-y-0.5 transition text-white"
            style={{ background: 'linear-gradient(135deg,#9c5c6e,#6d5b8a)', boxShadow: '0 4px 0 #4e4068' }}>
            <div className="text-2xl">⚔️</div>
            <div className="font-display font-extrabold mt-1 text-sm">Duel</div>
          </Link>
          <Link href="/heist" className="rounded-2xl px-3 py-4 text-center active:translate-y-0.5 transition text-white"
            style={{ background: 'linear-gradient(135deg,#243d5e,#a87f3f)', boxShadow: '0 4px 0 #16182a' }}>
            <div className="text-2xl">💰</div>
            <div className="font-display font-extrabold mt-1 text-sm">Heist</div>
          </Link>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Link href="/join" className="lg-card px-4 py-4 transition active:translate-y-0.5">
            <div className="text-2xl">🎪</div>
            <div className="font-display font-bold text-ink mt-1">Join Class Game</div>
            <div className="text-xs mt-0.5 text-muted">enter a code</div>
          </Link>
          <Link href="/boss" className="lg-card px-4 py-4 transition active:translate-y-0.5">
            <div className="text-2xl">👹</div>
            <div className="font-display font-bold text-ink mt-1">Weekly Boss</div>
            <div className="text-xs mt-0.5 text-muted">fight as a class</div>
          </Link>
        </div>
        <Link href="/leaderboard" className="lg-card mt-3 flex items-center justify-between px-4 py-3.5 transition active:translate-y-0.5">
          <span className="font-display font-bold text-ink">🏆 Leaderboard</span>
          <span className="text-sm text-muted inline-flex items-center gap-1">this week <ChevronRight className="h-4 w-4" /></span>
        </Link>

        <NotificationToggle />
      </div>

      <p className="mt-6 text-center text-xs text-muted space-x-2">
        <AuthLink />
        <span>·</span>
        <Link href="/host" className="underline">Host a game</Link>
        <span>·</span>
        <Link href="/classes" className="underline">Classes</Link>
        <span>·</span>
        <a href="https://hscscience.com.au" className="underline">hscscience.com.au</a>
      </p>
      <InstallPrompt />
      <OnboardingGate />
    </main>
  );
}
