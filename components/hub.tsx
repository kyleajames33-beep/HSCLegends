import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

// Shared building blocks for the hub screens (Today, Study, Play).

// Section label — the spine that makes a hub read as a game, not a menu.
export function Band({ children }: { children: React.ReactNode }) {
  return <p className="px-1 pt-6 pb-2 text-xs font-display font-bold tracking-[0.12em] text-inksoft">{children}</p>;
}

// Small square tile.
export function Tile({ href, emoji, title, sub }: { href: string; emoji: string; title: string; sub: string }) {
  return (
    <Link href={href} className="lg-card px-4 py-4 transition active:translate-y-0.5">
      <div className="text-2xl">{emoji}</div>
      <div className="font-display font-bold text-ink mt-1">{title}</div>
      <div className="text-xs mt-0.5 text-inksoft">{sub}</div>
    </Link>
  );
}

// Wide row.
export function Row({ href, label, hint }: { href: string; label: string; hint: string }) {
  return (
    <Link href={href} className="lg-card flex items-center justify-between px-4 py-3.5 transition active:translate-y-0.5">
      <span className="font-display font-bold text-ink">{label}</span>
      <span className="text-sm text-inksoft inline-flex items-center gap-1">{hint} <ChevronRight className="h-4 w-4" /></span>
    </Link>
  );
}
