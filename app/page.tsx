import Link from 'next/link';
import AuthLink from '@/components/auth-link';
import HomeStats from '@/components/home-stats';
import InstallPrompt from '@/components/install-prompt';
import OnboardingGate from '@/components/onboarding-gate';
import NotificationToggle from '@/components/notification-toggle';
import WalletChip from '@/components/wallet-chip';
import MissionCard from '@/components/mission-card';
import StreakCard from '@/components/streak-card';
import UpNext from '@/components/up-next';
import TabBar from '@/components/tab-bar';
import { Band, Row } from '@/components/hub';

// Today: one obvious mission, then the streak, then quick follow-ups.
// Study tools and game modes live on their own tabs (/study, /games).
export default function Home() {
  return (
    <main className="flex flex-1 flex-col px-5 pt-10 w-full max-w-md mx-auto">
      <header className="flex items-center justify-between gap-3">
        <p className="text-berrydeep font-display font-extrabold tracking-[0.12em] text-sm">HSC LEGENDS</p>
        <WalletChip compact />
      </header>

      <div className="mt-4 space-y-3">
        <MissionCard />
        <StreakCard />
      </div>

      <UpNext />

      <Band>YOUR WEEK</Band>
      <HomeStats />
      <div className="mt-3 space-y-3">
        <Row href="/season" label="🎟️ Term Pass" hint="free rewards" />
        <Row href="/achievements" label="🎖️ Achievements" hint="badges" />
      </div>

      <div className="mt-6"><NotificationToggle /></div>

      <p className="mt-8 mb-4 text-center text-xs text-inksoft space-x-2">
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
      <TabBar active="today" />
    </main>
  );
}
