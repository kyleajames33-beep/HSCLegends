import Link from 'next/link';
import TabBar from '@/components/tab-bar';
import { Band, Tile } from '@/components/hub';

// Play tab: every game mode, plus the in-class entry points.
export default function Games() {
  return (
    <main className="flex flex-1 flex-col px-5 pt-10 w-full max-w-md mx-auto">
      <h1 className="text-3xl font-extrabold text-ink">Play</h1>
      <p className="mt-1 text-sm text-inksoft">Every game counts toward your streak and XP.</p>

      <Band>ARENA</Band>
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

      <Band>SOLO &amp; EVENTS</Band>
      <div className="grid grid-cols-2 gap-3">
        <Tile href="/campaign" emoji="⚔️" title="Campaign" sub="beat the bosses solo" />
        <Tile href="/match" emoji="🔗" title="Match" sub="speed pairs" />
        <Tile href="/event" emoji="🏆" title="Championship" sub="live event" />
        <Tile href="/collection" emoji="🃏" title="Collection" sub="Legend cards" />
      </div>

      <Band>BUILD</Band>
      <div className="space-y-3">
        <Link href="/tycoon" className="block rounded-2xl px-4 py-4 text-white transition active:translate-y-0.5"
          style={{ background: 'linear-gradient(135deg,#a87f3f,#6b9b7c)', boxShadow: '0 4px 0 #4a7a5b' }}>
          <div className="text-2xl">🏦</div>
          <div className="font-display font-extrabold mt-1">Lab Tycoon</div>
          <div className="text-xs opacity-90">answer → earn → upgrade → repeat</div>
        </Link>
        <Link href="/hq" className="block rounded-2xl px-4 py-4 text-white transition active:translate-y-0.5"
          style={{ background: 'linear-gradient(135deg,#4e4068,#243d5e)', boxShadow: '0 4px 0 #16182a' }}>
          <div className="text-2xl">🏛️</div>
          <div className="font-display font-extrabold mt-1">Research HQ</div>
          <div className="text-xs opacity-90">build a base that earns ✨ while you study</div>
        </Link>
      </div>

      <Band>IN CLASS</Band>
      <div className="grid grid-cols-2 gap-3">
        <Tile href="/join" emoji="🎪" title="Join Class Game" sub="enter a code" />
        <Tile href="/boss" emoji="👹" title="Weekly Boss" sub="fight as a class" />
      </div>
      <TabBar active="play" />
    </main>
  );
}
