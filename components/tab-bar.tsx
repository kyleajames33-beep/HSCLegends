import Link from 'next/link';
import { BookOpen, Gamepad2, House, Layers, UserRound, Users, type LucideIcon } from 'lucide-react';

export type Tab = 'today' | 'study' | 'play' | 'cards' | 'friends' | 'join' | 'profile';

const TABS: { id: Tab; href: string; icon: LucideIcon; label: string }[] = [
  { id: 'today', href: '/', icon: House, label: 'Home' },
  { id: 'study', href: '/study', icon: BookOpen, label: 'Study' },
  { id: 'play', href: '/games', icon: Gamepad2, label: 'Play' },
  { id: 'cards', href: '/collection', icon: Layers, label: 'Cards' },
  { id: 'friends', href: '/friends', icon: Users, label: 'Friends' },
];
const ARCADE_TABS: typeof TABS = [
  { id: 'today', href: '/', icon: House, label: 'Home' },
  { id: 'play', href: '/games', icon: Gamepad2, label: 'Play' },
  { id: 'join', href: '/live', icon: Users, label: 'Join' },
  { id: 'study', href: '/study', icon: BookOpen, label: 'Study' },
  { id: 'profile', href: '/profile', icon: UserRound, label: 'Profile' },
];

// Bottom navigation for the hub screens. Renders a spacer so page content is
// never hidden behind the fixed bar. Game screens deliberately don't show it.
export default function TabBar({ active, appearance = 'default' }: { active: Tab; appearance?: 'default' | 'arcade' }) {
  const arcade = appearance === 'arcade';
  return (
    <>
      <div aria-hidden className={`shrink-0 ${arcade ? 'lg:hidden' : ''}`} style={{ height: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }} />
      <nav aria-label="Main"
        className={`fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur ${arcade ? 'border-white/10 bg-[#101426]/95 text-[#b9c1da] lg:hidden' : 'border-rule bg-panel/95'}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="mx-auto grid max-w-md grid-cols-5">
          {(arcade ? ARCADE_TABS : TABS).map((t) => {
            const on = t.id === active;
            return (
              <Link key={t.id} href={t.href} prefetch={false} aria-current={on ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-md text-[11px] focus-visible:outline-2 focus-visible:-outline-offset-4 ${arcade ? 'focus-visible:outline-[#b9f575]' : 'focus-visible:outline-plum'} ${arcade ? on ? 'bg-white/5 font-bold text-[#c8f78a]' : 'font-semibold text-[#b9c1da]' : on ? 'font-bold text-plum' : 'font-semibold text-inksoft'}`}>
                <t.icon aria-hidden="true" size={20} strokeWidth={on ? 2.6 : 2} />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
