import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, FlaskConical, Gamepad2, KeyRound, Radio, Swords, Trophy, Zap } from 'lucide-react';

const actions = [
  { href: '/live', title: 'Join a game', detail: 'Enter a code', icon: KeyRound, color: 'bg-[#202944] text-white border-[#4c5876]' },
  { href: '/live/host', title: 'Host a game', detail: 'For your class', icon: Radio, color: 'bg-[#202944] text-white border-[#4c5876]' },
  { href: '/demo', title: 'Play solo', detail: 'Start a sample', icon: Gamepad2, color: 'bg-[#c3f67a] text-[#172916] border-[#c3f67a]' },
];

export function LobbyActions() {
  return (
    <section id="game-actions" tabIndex={-1} aria-label="Choose how to play" className="grid grid-cols-3 gap-2 outline-none sm:gap-3">
      {actions.map(({ href, title, detail, icon: Icon, color }) => (
        <Link key={href} href={href} prefetch={false} className={`${color} group flex min-h-24 flex-col items-start gap-2 rounded-2xl border p-3 shadow-[0_4px_0_#090d1b] transition hover:-translate-y-1 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#c3f67a] motion-reduce:transition-none sm:min-h-20 sm:flex-row sm:items-center sm:gap-4 sm:p-4`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-black/15 sm:h-11 sm:w-11"><Icon aria-hidden size={22} strokeWidth={2.5} /></span>
          <span className="min-w-0 flex-1"><span className="block font-display text-sm font-extrabold leading-tight sm:text-lg">{title}</span><span className="sr-only sm:not-sr-only sm:mt-1 sm:block sm:text-xs sm:font-semibold sm:opacity-80">{detail}</span></span>
          <ArrowRight aria-hidden size={19} className="hidden shrink-0 transition group-hover:translate-x-1 motion-reduce:transition-none sm:block" />
        </Link>
      ))}
    </section>
  );
}

export function FeaturedModes() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Link href="/demo" className="group relative flex min-h-72 flex-col overflow-hidden rounded-[24px] border border-[#5caa9e]/50 bg-[#123a4c] bg-cover bg-center p-5 text-white shadow-[0_6px_0_#090d1b] transition hover:-translate-y-1 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#c3f67a] motion-reduce:transition-none sm:min-h-80 sm:p-7" style={{ backgroundImage: 'linear-gradient(90deg, rgba(6, 29, 42, .98), rgba(6, 29, 42, .76) 53%, rgba(6, 29, 42, .27)), url(/art/lab-arena.webp)' }}>
        <span className="relative w-fit rounded-full bg-[#c3f67a] px-3 py-1 text-[10px] font-black tracking-[0.12em] text-[#172916]">SOLO SAMPLE · NO ACCOUNT</span>
        <span className="relative mt-5 font-display text-4xl font-black leading-none sm:text-5xl">Lab Rush</span>
        <span className="relative mt-3 max-w-56 text-sm font-semibold leading-relaxed text-white/90">Build your lab. Blast the boss.</span>
        <span className="relative mt-4 flex flex-wrap gap-2 text-[11px] font-bold tracking-wide"><span className="rounded-lg border border-white/20 bg-[#102d3e]/80 px-2.5 py-1.5">TIMED RUN</span><span className="rounded-lg border border-white/20 bg-[#102d3e]/80 px-2.5 py-1.5">UPGRADES</span></span>
        <span className="relative mt-auto flex w-fit items-center gap-2 pt-7 font-display font-black text-[#c3f67a]">PLAY LAB RUSH <ArrowRight aria-hidden size={18} className="transition group-hover:translate-x-1 motion-reduce:transition-none" /></span>
      </Link>
      <Link href="/arena" className="group relative flex min-h-72 flex-col overflow-hidden rounded-[24px] border border-[#cc8aa0]/50 bg-[#38233f] bg-cover bg-center p-5 text-white shadow-[0_6px_0_#090d1b] transition hover:-translate-y-1 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#c3f67a] motion-reduce:transition-none sm:min-h-80 sm:p-7" style={{ backgroundImage: 'linear-gradient(90deg, rgba(36, 20, 43, .98), rgba(36, 20, 43, .77) 53%, rgba(36, 20, 43, .28)), url(/art/arena-duel.webp)' }}>
        <span className="relative w-fit rounded-full bg-[#ffd382] px-3 py-1 text-[10px] font-black tracking-[0.12em] text-[#3f2613]">SOLO SAMPLE · SIMULATED RIVALS</span>
        <span className="relative mt-5 font-display text-4xl font-black leading-none sm:text-5xl">Knockout<br />Solo</span>
        <span className="relative mt-3 max-w-56 text-sm font-semibold leading-relaxed text-white/90">Survive the rounds. Claim the arena.</span>
        <span className="relative mt-4 flex flex-wrap gap-2 text-[11px] font-bold tracking-wide"><span className="rounded-lg border border-white/20 bg-[#301f3c]/80 px-2.5 py-1.5">ROUND BASED</span><span className="rounded-lg border border-white/20 bg-[#301f3c]/80 px-2.5 py-1.5">SOLO</span></span>
        <span className="relative mt-auto flex w-fit items-center gap-2 pt-7 font-display font-black text-[#ffd382]">ENTER ARENA <ArrowRight aria-hidden size={18} className="transition group-hover:translate-x-1 motion-reduce:transition-none" /></span>
      </Link>
    </div>
  );
}

const connectedModes = [
  { href: '/tycoon', title: 'Lab Tycoon', description: 'Build a bigger lab', icon: FlaskConical, color: 'text-[#9ff0d1]' },
  { href: '/campaign', title: 'Campaign', description: 'Take on bosses', icon: Zap, color: 'text-[#ffd382]' },
  { href: '/heist', title: 'Heist', description: 'Raid and defend', icon: Trophy, color: 'text-[#b8d9ff]' },
];

export function ConnectedModes() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {connectedModes.map(({ href, title, description, icon: Icon, color }) => (
        <Link key={href} href={href} prefetch={false} className="group flex min-h-28 items-center gap-3 rounded-2xl border border-[#3d4967] bg-[#1b243b] p-4 text-white transition hover:-translate-y-1 hover:border-[#95a8ca] focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#c3f67a] motion-reduce:transition-none">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/5 ${color}`}><Icon aria-hidden size={25} /></span><span className="min-w-0"><span className="block font-display text-lg font-black">{title}</span><span className="block text-xs font-semibold text-[#bec7dc]">{description}</span></span><ArrowRight aria-hidden size={17} className="ml-auto shrink-0 text-[#a9b4ce]" />
        </Link>
      ))}
      <div className="flex min-h-28 items-center gap-3 rounded-2xl border border-[#343e56] bg-[#171e30] p-4 text-white">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/5 text-[#b4a4bb]"><Swords aria-hidden size={25} /></span><span><span className="block font-display text-lg font-black">Class Knockout</span><span className="block text-xs font-semibold text-[#c5b5cb]">Multiplayer unavailable</span></span>
      </div>
    </div>
  );
}

export function LobbyHero() {
  return (
    <section className="relative overflow-hidden rounded-[26px] border border-[#5c5981] bg-[#252044] bg-cover bg-center px-5 py-8 text-white sm:px-10 sm:py-10" style={{ backgroundImage: 'linear-gradient(90deg, rgba(20, 22, 48, .98) 0%, rgba(20, 22, 48, .91) 48%, rgba(20, 22, 48, .45) 100%), url(/art/arena-hero.webp)' }}>
      <div aria-hidden className="absolute -right-16 -top-32 h-80 w-80 rounded-full bg-[#7256bb]/30 blur-3xl" />
      <Image src="/art/lab-scientist.webp" alt="" width={592} height={800} className="pointer-events-none absolute -bottom-16 -right-12 h-[95%] w-auto object-contain object-bottom opacity-40 sm:-bottom-20 sm:right-2 sm:h-[115%] sm:opacity-90 lg:right-10" />
      <div className="relative z-10 max-w-lg">
        <p className="inline-flex items-center gap-2 rounded-full border border-[#b6a8ef]/30 bg-[#413868]/80 px-3 py-1 text-[10px] font-black tracking-[.16em] text-[#e4d9ff]"><span className="h-2 w-2 rounded-full bg-[#c3f67a]" /> THE HSC GAME ARENA</p>
        <h1 className="mt-4 max-w-sm font-display text-4xl font-black leading-[1.02] tracking-tight sm:text-6xl">Ready, set,<br /><span className="text-[#c3f67a]">legend.</span></h1>
        <p className="mt-3 max-w-xs text-sm font-semibold leading-relaxed text-[#e1dcef] sm:text-base">Answer. Power up. Play again.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/demo" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#c3f67a] px-5 font-display font-black text-[#1c2b20] transition hover:bg-white focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white motion-reduce:transition-none">Play Lab Rush <ArrowRight aria-hidden size={18} /></Link>
          <Link href="/games" className="inline-flex min-h-12 items-center rounded-xl border border-white/50 bg-[#242441]/80 px-5 font-display font-bold text-white transition hover:bg-[#43356a] focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white motion-reduce:transition-none">All games</Link>
        </div>
      </div>
    </section>
  );
}
