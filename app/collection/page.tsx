'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import CardTile from '@/components/card-tile';
import PackOpening from '@/components/pack-opening';
import {
  getCollection, openPack, sellDupe,
  RARITY, RARITY_ORDER, PACK_COST,
  type OwnedCard, type PullCard,
} from '@/lib/cards';

const SUBJECT_LABEL: Record<string, string> = {
  biology: 'Biology', chemistry: 'Chemistry', physics: 'Physics',
  'maths-standard': 'Maths Standard', 'maths-advanced': 'Maths Advanced', 'maths-ext1': 'Maths Ext 1',
};

export default function CollectionPage() {
  const sb = useMemo(() => createClient(), []);
  const { user, loading } = useUser();
  const [coins, setCoins] = useState<number | null>(null);
  const [cards, setCards] = useState<OwnedCard[]>([]);
  const [pull, setPull] = useState<PullCard | null>(null);
  const [selected, setSelected] = useState<OwnedCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function refresh() {
    const [{ data: w }, col] = await Promise.all([
      sb.rpc('get_wallet'),
      getCollection(sb),
    ]);
    setCoins(w?.coins ?? w?.[0]?.coins ?? 0);
    setCards(col);
  }

  useEffect(() => {
    if (loading || !user) return;
    refresh().catch((e) => setErr(msg(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  async function buyPack() {
    if (busy || coins == null || coins < PACK_COST) return;
    setBusy(true); setErr('');
    try {
      const c = await openPack(sb);
      setPull(c);
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }

  async function closePull() {
    setPull(null);
    await refresh().catch((e) => setErr(msg(e)));
  }

  async function sell(card: OwnedCard) {
    setBusy(true); setErr('');
    try {
      const newBal = await sellDupe(sb, card.card_id);
      setCoins(newBal);
      setSelected(null);
      await refresh();
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }

  // --- group cards by subject (null = Legends) for sectioned grid ---
  const groups = useMemo(() => {
    const map = new Map<string, OwnedCard[]>();
    for (const c of cards) {
      const key = c.subject ?? '__legends__';
      let arr = map.get(key);
      if (!arr) { arr = []; map.set(key, arr); }
      arr.push(c);
    }
    return Array.from(map.entries());
  }, [cards]);

  const owned = cards.filter((c) => c.count > 0).length;

  if (!loading && !user) {
    return (
      <Shell>
        <H>🃏 Collection</H>
        <p className="mt-2 text-inksoft">Open packs and collect Legend Cards. Sign in to start your collection.</p>
        <Link href="/login?next=/collection" className="lg-btn lg-btn-primary mt-6 px-5 py-3 text-center">Sign in</Link>
        <Home />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-center justify-between">
        <H>🃏 Collection</H>
        <span className="rounded-full bg-parchment-deep px-3 py-1 font-display font-bold text-ink tabular-nums">
          {coins ?? '—'} ✨
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        {owned}/{cards.length} cards collected
      </p>

      {/* Open pack */}
      <button
        onClick={buyPack}
        disabled={busy || coins == null || coins < PACK_COST}
        className="lg-btn lg-btn-primary mt-5 w-full px-6 py-4 text-lg disabled:opacity-40"
      >
        {busy ? 'Opening…' : `Open Standard Pack — ${PACK_COST} ✨`}
      </button>
      {coins != null && coins < PACK_COST && (
        <p className="mt-2 text-center text-xs text-muted">Not enough Sparks — earn more by playing.</p>
      )}

      {/* Published-odds disclosure */}
      <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
        Drop rates:{' '}
        {RARITY_ORDER.map((r, i) => (
          <span key={r}>
            <span className={RARITY[r].text + ' font-semibold'}>{RARITY[r].label} {RARITY[r].odds}%</span>
            {i < RARITY_ORDER.length - 1 ? ' · ' : ''}
          </span>
        ))}
      </p>

      {err && <Err>{err}</Err>}

      {/* Sectioned grid */}
      <div className="mt-6 space-y-6">
        {groups.map(([key, list]) => (
          <section key={key}>
            <h2 className="mb-2 font-display text-sm font-bold text-inksoft">
              {key === '__legends__' ? '👑 Legends' : (SUBJECT_LABEL[key] ?? key)}
            </h2>
            <div className="grid grid-cols-3 gap-2.5">
              {list.map((c) => (
                <CardTile
                  key={c.card_id}
                  name={c.name}
                  rarity={c.rarity}
                  art_kind={c.art_kind}
                  art_ref={c.art_ref}
                  count={c.count}
                  onClick={c.count > 0 ? () => setSelected(c) : undefined}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <Home />

      {/* Card detail / sell-dupe sheet */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          className="fixed inset-0 z-40 flex items-end justify-center bg-ink/60 p-4 backdrop-blur-sm sm:items-center"
        >
          <div onClick={(e) => e.stopPropagation()} className="lg-card w-full max-w-sm p-5">
            <div className="flex items-start gap-4">
              <CardTile
                name={selected.name}
                rarity={selected.rarity}
                art_kind={selected.art_kind}
                art_ref={selected.art_ref}
                count={selected.count}
                size={72}
                className="w-28 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <span className={`text-xs font-bold uppercase tracking-wide ${RARITY[selected.rarity].text}`}>
                  {RARITY[selected.rarity].label}
                </span>
                <h3 className="font-display text-lg font-extrabold text-ink">{selected.name}</h3>
                <p className="mt-1 text-sm italic text-muted">{selected.flavor}</p>
                <p className="mt-2 text-xs text-inksoft">Owned: ×{selected.count}</p>
              </div>
            </div>
            {selected.count > 1 ? (
              <button
                onClick={() => sell(selected)}
                disabled={busy}
                className="lg-btn lg-btn-berry mt-4 w-full px-4 py-3 disabled:opacity-40"
              >
                Sell dupe (+{RARITY[selected.rarity].dupe} ✨)
              </button>
            ) : (
              <button onClick={() => setSelected(null)} className="lg-btn mt-4 w-full bg-parchment-deep px-4 py-3 text-ink">
                Close
              </button>
            )}
          </div>
        </div>
      )}

      {/* Pack reveal overlay */}
      {pull && <PackOpening card={pull} onClose={closePull} />}
    </Shell>
  );
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
const Shell = ({ children }: { children: React.ReactNode }) => (
  <main className="flex flex-1 flex-col px-6 pt-14 pb-10 max-w-md w-full mx-auto">{children}</main>
);
const H = ({ children }: { children: React.ReactNode }) => <h1 className="text-2xl font-extrabold text-ink">{children}</h1>;
const Err = ({ children }: { children: React.ReactNode }) => <p className="mt-3 text-brick text-sm">{children}</p>;
const Home = () => <Link href="/" className="mt-8 text-center text-sm text-muted underline">Home</Link>;
