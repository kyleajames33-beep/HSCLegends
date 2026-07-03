import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import AuthLink from '@/components/auth-link';
import HomeStats from '@/components/home-stats';
import DailyNudge from '@/components/daily-nudge';
import TodayQuizzes from '@/components/today-quizzes';
import InstallPrompt from '@/components/install-prompt';
import OnboardingGate from '@/components/onboarding-gate';
import NotificationToggle from '@/components/notification-toggle';
import WalletChip from '@/components/wallet-chip';
import RewardsLink from '@/components/rewards-link';
import HqChip from '@/components/hq-chip';

// Section label — the spine that makes the home read as a game, not a menu.
function Band({ children }: { children: React.ReactNode }) {
  return <p className="px-1 pt-5 pb-2 text-xs font-display font-bold tracking-[0.12em] text-muted">{children}</p>;
}
// Small square tile.
function Tile({ href, emoji, title, sub }: { href: string; emoji: string; title: string; sub: string }) {
  return (
    <Link href={href} className="lg-card px-4 py-4 transition active:translate-y-0.5">
      <div className="text-2xl">{emoji}</div>
      <div className="font-display font-bold text-ink mt-1">{title}</div>
      <div className="text-xs mt-0.5 text-muted">{sub}</div>
    </Link>
  );
}
// Wide row.
function Row({ href, label, hint }: { href: string; label: string; hint: string }) {
  return (
    <Link href={href} className="lg-card flex items-center justify-between px-4 py-3.5 transition active:translate-y-0.5">
      <span className="font-display font-bold text-ink">{label}</span>
      <span className="text-sm text-muted inline-flex items-center gap-1">{hint} <ChevronRight className="h-4 w-4" /></span>
    </Link>
  );
}

export default function Home() {
  return (
    <main className="flex flex-1 flex-col px-6 pt-14 pb-10 w-full max-w-md mx-auto">
      <header className="text-center">
        <p className="text-berrydeep font-display font-bold tracking-[0.15em] text-sm">HSC LEGENDS</p>
        <h1 className="mt-2 text-[2.6rem] font-extrabold leading-[1.05] text-ink">Beat today.<br />Keep the streak.</h1>
        <div className="flex justify-center"><WalletChip /></div>
      </header>

      {/* ───────── LAYER 1 · TODAY (the mission) ───────── */}
      <Band>🔥 TODAY&apos;S MISSION</Band>
      <div className="space-y-3">
        <HomeStats />
        <DailyNudge />
        <HqChip />
        <TodayQuizzes />
        <RewardsLink />
        <Row href="/play" label="🎲 Free practice" hint="any subject" />
      </div>

      {/* ───────── LAYER 2 · STUDY TOOLS ───────── */}
      <Band>📚 STUDYING FOR SOMETHING?</Band>
      <div className="grid grid-cols-2 gap-3">
        <Tile href="/review" emoji="🧠" title="Review" sub="spaced repetition" />
        <Tile href="/progress" emoji="📈" title="Progress" sub="mastery & band" />
        <Tile href="/topics" emoji="🗺️" title="Topics" sub="drill by module" />
        <Tile href="/exam" emoji="📝" title="Exam mode" sub="timed Section I" />
      </div>
      <div className="mt-3">
        <Row href="/type" label="⌨️ Type it" hint="free-recall typing" />
      </div>

      {/* ───────── LAYER 3 · PLAY (fun & social) ───────── */}
      <Band>🎮 PLAY</Band>
      <div className="grid grid-cols-3 gap-3">
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
        <Tile href="/campaign" emoji="⚔️" title="Campaign" sub="beat the bosses solo" />
        <Tile href="/match" emoji="🔗" title="Match" sub="speed pairs" />
        <Tile href="/event" emoji="🏆" title="Championship" sub="live event" />
        <Tile href="/collection" emoji="🃏" title="Collection" sub="Legend cards" />
      </div>
      <div className="mt-3">
        <Row href="/friends" label="🤝 Friends" hint="add & compete" />
      </div>
      <div className="mt-3 space-y-3">
        <Link href="/tycoon" className="rounded-2xl px-4 py-4 text-white transition active:translate-y-0.5"
          style={{ background: 'linear-gradient(135deg,#a87f3f,#6b9b7c)', boxShadow: '0 4px 0 #4a7a5b' }}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-2xl">🏦</div>
              <div className="font-display font-extrabold mt-1">Lab Tycoon</div>
              <div className="text-xs opacity-80">answer → earn → upgrade → repeat</div>
            </div>
            <span className="shrink-0 rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-extrabold">NEW</span>
          </div>
        </Link>
        <Link href="/hq" className="rounded-2xl px-4 py-4 text-white transition active:translate-y-0.5"
          style={{ background: 'linear-gradient(135deg,#4e4068,#243d5e)', boxShadow: '0 4px 0 #16182a' }}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-2xl">🏛️</div>
              <div className="font-display font-extrabold mt-1">Research HQ</div>
              <div className="text-xs opacity-80">build a base that earns ✨ while you study</div>
            </div>
            <span className="shrink-0 rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-extrabold">NEW</span>
          </div>
        </Link>
      </div>

      {/* ───────── LAYER 4 · YOUR PROGRESS (identity/meta) ───────── */}
      <Band>🏅 YOUR PROGRESS</Band>
      <div className="grid grid-cols-2 gap-3">
        <Tile href="/profile" emoji="👤" title="Profile" sub="you at a glance" />
        <Tile href="/league" emoji="🏆" title="League" sub="climb divisions" />
        <Tile href="/season" emoji="🎟️" title="Term Pass" sub="free rewards" />
        <Tile href="/achievements" emoji="🎖️" title="Achievements" sub="badges" />
      </div>
      <div className="mt-3">
        <Row href="/leaderboard" label="🥇 Leaderboard" hint="this week" />
      </div>

      {/* ───────── LAYER 5 · IN CLASS (acquisition) ───────── */}
      <Band>🎪 IN CLASS</Band>
      <div className="grid grid-cols-2 gap-3">
        <Tile href="/join" emoji="🎪" title="Join Class Game" sub="enter a code" />
        <Tile href="/boss" emoji="👹" title="Weekly Boss" sub="fight as a class" />
      </div>

      <div className="mt-4"><NotificationToggle /></div>

      <p className="mt-8 text-center text-xs text-muted space-x-2">
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
