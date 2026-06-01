'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import {
  createClass, joinClass, getMyClasses, getClassDashboard,
  type ClassRow, type ClassMemberStat,
} from '@/lib/classes';

export default function ClassesPage() {
  const sb = useMemo(() => createClient(), []);
  const { user, loading } = useUser();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [open, setOpen] = useState<ClassRow | null>(null);
  const [rows, setRows] = useState<ClassMemberStat[]>([]);
  const [name, setName] = useState('');
  const [year, setYear] = useState<11 | 12>(12);
  const [joinCode, setJoinCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setClasses(await getMyClasses(sb));
  }
  useEffect(() => { if (user) refresh(); /* eslint-disable-next-line */ }, [user]);

  async function openClass(c: ClassRow) {
    setOpen(c);
    setRows(await getClassDashboard(sb, c.id));
  }
  async function doCreate() {
    if (!name.trim()) return;
    setBusy(true); setErr('');
    try { await createClass(sb, name, year); setName(''); await refresh(); }
    catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }
  async function doJoin() {
    if (joinCode.length < 6) return;
    setBusy(true); setErr('');
    try { await joinClass(sb, joinCode); setJoinCode(''); await refresh(); }
    catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }

  if (!loading && !user) {
    return (
      <Shell>
        <H>Classes</H>
        <p className="mt-2 text-inksoft">Sign in to create or join a class.</p>
        <Link href="/login?next=/classes" className="mt-6 block rounded-xl bg-plum text-white px-4 py-3 text-center font-semibold">Sign in</Link>
      </Shell>
    );
  }

  if (open) {
    const totalXp = rows.reduce((s, r) => s + Number(r.weekly_xp), 0);
    const totalDmg = rows.reduce((s, r) => s + Number(r.boss_damage), 0);
    return (
      <Shell>
        <button onClick={() => setOpen(null)} className="text-sm text-muted underline">← All classes</button>
        <div className="mt-2 flex items-center justify-between">
          <H>{open.name}</H>
          {open.is_teacher && <span className="text-xs rounded-full bg-parchment-deep px-2 py-1">code {open.code}</span>}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-center">
          <Stat label="class XP this week" value={totalXp} />
          <Stat label="boss damage this week" value={totalDmg} />
        </div>
        <div className="mt-5 text-sm text-muted">Members ({rows.length})</div>
        <ol className="mt-2 space-y-2">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center justify-between rounded-xl bg-panel px-4 py-3">
              <span className="font-medium"><span className="text-muted mr-2">{i + 1}.</span>{r.name}</span>
              <span className="text-sm text-inksoft">🔥{r.streak} · ⚔{r.boss_damage} · <span className="text-ink font-bold">{r.weekly_xp} XP</span></span>
            </li>
          ))}
          {!rows.length && <p className="text-muted text-sm">No members yet.</p>}
        </ol>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-center justify-between">
        <H>Classes</H>
        <Link href="/" className="text-sm text-muted underline">Home</Link>
      </div>

      <div className="mt-5 space-y-2">
        {classes.map((c) => (
          <button key={c.id} onClick={() => openClass(c)}
            className="block w-full text-left rounded-xl bg-panel hover:bg-parchment-deep px-4 py-3 transition">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{c.name}</span>
              <span className="text-xs text-muted">{c.is_teacher ? 'teacher' : 'student'} · {c.members} 👥</span>
            </div>
          </button>
        ))}
        {!classes.length && <p className="text-muted text-sm">No classes yet. Create one or join with a code.</p>}
      </div>

      <div className="mt-7 rounded-2xl border border-rule p-4">
        <div className="font-semibold">Create a class</div>
        <p className="text-xs text-muted mt-0.5">You’ll get a code to share with students.</p>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 12 Bio Period 3"
          className="mt-3 w-full rounded-xl bg-panel border border-rule px-4 py-2.5 outline-none focus:border-plum" />
        <div className="mt-2 flex gap-2">
          {[11, 12].map((y) => (
            <button key={y} onClick={() => setYear(y as 11 | 12)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${year === y ? 'bg-plum text-white' : 'bg-parchment-deep'}`}>Y{y}</button>
          ))}
          <button onClick={doCreate} disabled={busy || !name.trim()}
            className="ml-auto rounded-lg bg-plum hover:bg-plumdeep text-white px-4 py-1.5 text-sm font-semibold disabled:opacity-40">Create</button>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-rule p-4">
        <div className="font-semibold">Join a class</div>
        <div className="mt-2 flex gap-2">
          <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6))}
            placeholder="CODE" className="flex-1 rounded-xl bg-panel border border-rule px-4 py-2.5 tracking-[0.2em] outline-none focus:border-plum" />
          <button onClick={doJoin} disabled={busy || joinCode.length < 6}
            className="rounded-lg bg-plum hover:bg-plumdeep text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-40">Join</button>
        </div>
      </div>
      {err && <p className="mt-3 text-brick text-sm">{err}</p>}
    </Shell>
  );
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
const Shell = ({ children }: { children: React.ReactNode }) => (
  <main className="flex flex-1 flex-col px-6 pt-12 pb-10 max-w-md w-full mx-auto">{children}</main>
);
const H = ({ children }: { children: React.ReactNode }) => <h1 className="text-2xl font-bold">{children}</h1>;
const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-xl bg-panel px-4 py-3"><div className="text-2xl font-bold">{value}</div><div className="text-xs text-muted">{label}</div></div>
);
