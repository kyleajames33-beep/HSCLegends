import type { Metadata } from 'next';
import Link from 'next/link';

type SP = Promise<{ streak?: string }>;

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const { streak = '0' } = await searchParams;
  const img = `/api/og?streak=${encodeURIComponent(streak)}`;
  const title = `${streak}-day streak on HSC Legends 🔥`;
  return {
    title,
    description: 'Quick HSC quizzes, streaks and class battles. Can you beat it?',
    openGraph: { title, images: [img] },
    twitter: { card: 'summary_large_image', title, images: [img] },
  };
}

export default async function SharePage({ searchParams }: { searchParams: SP }) {
  const { streak = '0' } = await searchParams;
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 max-w-md w-full mx-auto text-center">
      <p className="text-indigo-400 font-semibold text-sm">HSC LEGENDS</p>
      <div className="mt-4 text-7xl font-black">{streak}</div>
      <div className="text-xl font-bold tracking-wide">DAY STREAK 🔥</div>
      <p className="mt-4 text-zinc-400">Quick HSC quizzes, streaks, and class boss battles.</p>
      <Link href="/" className="mt-8 rounded-2xl bg-indigo-600 hover:bg-indigo-500 px-6 py-4 text-lg font-semibold">
        Play HSC Legends ▶
      </Link>
    </main>
  );
}
