import Link from 'next/link';
import { Gamepad2, Sparkles } from 'lucide-react';
import WalletChip from '@/components/wallet-chip';

export default function ArcadeHeader({ active }: { active: 'home' | 'games' }) {
  return (
    <header className="mb-5 flex min-h-12 flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4 sm:flex-nowrap">
      <Link href="/" aria-label="HSC Legends home" className="flex shrink-0 items-center gap-2 font-display text-sm font-black tracking-[.12em] text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c3f67a]">
        <span className="grid h-9 w-9 place-items-center rounded-xl border border-[#c3f67a]/30 bg-[#c3f67a]/10 text-[#c3f67a]"><Sparkles aria-hidden size={19} /></span>
        HSC LEGENDS
      </Link>
      <nav aria-label="Desktop" className="hidden items-center gap-1 text-sm font-bold text-[#bfc8df] lg:flex">
        {[{ href: '/', label: 'Home', id: 'home' }, { href: '/games', label: 'Games', id: 'games' }, { href: '/study', label: 'Study', id: 'study' }, { href: '/profile', label: 'My Legend', id: 'profile' }].map(item => (
          <Link key={item.id} href={item.href} prefetch={false} aria-current={active === item.id ? 'page' : undefined} className={`rounded-lg px-4 py-2.5 transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-[#c3f67a] ${active === item.id ? 'bg-white/5 text-[#c3f67a]' : ''}`}>
            {item.id === 'games' && <Gamepad2 aria-hidden size={16} className="mr-2 inline-block" />}{item.label}
          </Link>
        ))}
      </nav>
      <WalletChip compact />
    </header>
  );
}
