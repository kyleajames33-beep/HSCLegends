import TabBar from '@/components/tab-bar';
import { Band, Row, Tile } from '@/components/hub';

// Study tab: the "get a Band 6" layer — revision tools and progress.
export default function Study() {
  return (
    <main className="flex flex-1 flex-col px-5 pt-10 w-full max-w-md mx-auto">
      <h1 className="text-3xl font-extrabold text-ink">Study</h1>
      <p className="mt-1 text-sm text-inksoft">Revision that moves your marks.</p>

      <Band>STUDYING FOR SOMETHING?</Band>
      <div className="grid grid-cols-2 gap-3">
        <Tile href="/review" emoji="🧠" title="Review" sub="spaced repetition" />
        <Tile href="/progress" emoji="📈" title="Progress" sub="mastery & band" />
        <Tile href="/topics" emoji="🗺️" title="Topics" sub="drill by module" />
        <Tile href="/exam" emoji="📝" title="Exam mode" sub="timed Section I" />
      </div>
      <div className="mt-3 space-y-3">
        <Row href="/type" label="⌨️ Type it" hint="free-recall typing" />
        <Row href="/play" label="🎲 Free practice" hint="any subject" />
      </div>

      <Band>YOUR PROGRESS</Band>
      <div className="grid grid-cols-2 gap-3">
        <Tile href="/profile" emoji="👤" title="Profile" sub="you at a glance" />
        <Tile href="/league" emoji="🏆" title="League" sub="climb divisions" />
      </div>
      <div className="mt-3">
        <Row href="/leaderboard" label="🥇 Leaderboard" hint="this week" />
      </div>
      <TabBar active="study" />
    </main>
  );
}
