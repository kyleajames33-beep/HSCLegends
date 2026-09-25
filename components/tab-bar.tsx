import Link from 'next/link';

export type Tab = 'today' | 'study' | 'play' | 'cards' | 'friends';

const TABS: { id: Tab; href: string; emoji: string; label: string }[] = [
  { id: 'today', href: '/', emoji: '🏠', label: 'Today' },
  { id: 'study', href: '/study', emoji: '📚', label: 'Study' },
  { id: 'play', href: '/games', emoji: '🎮', label: 'Play' },
  { id: 'cards', href: '/collection', emoji: '🃏', label: 'Cards' },
  { id: 'friends', href: '/friends', emoji: '🤝', label: 'Friends' },
];

// Bottom navigation for the hub screens. Renders a spacer so page content is
// never hidden behind the fixed bar. Game screens deliberately don't show it.
export default function TabBar({ active }: { active: Tab }) {
  return (
    <>
      <div aria-hidden className="h-20 shrink-0" />
      <nav aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-panel/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="mx-auto grid max-w-md grid-cols-5">
          {TABS.map((t) => {
            const on = t.id === active;
            return (
              <Link key={t.id} href={t.href} aria-current={on ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${on ? 'font-bold text-plum' : 'font-semibold text-inksoft'}`}>
                <span className={`text-xl leading-none ${on ? '' : 'grayscale-[40%] opacity-80'}`}>{t.emoji}</span>
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
