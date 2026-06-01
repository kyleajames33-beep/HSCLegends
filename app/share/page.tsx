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
      <p className="text-berrydeep font-display font-bold tracking-[0.15em] text-sm">HSC LEGENDS</p>
      <div className="mt-4 text-8xl font-display font-extrabold text-ink">{streak}</div>
      <div className="text-xl font-display font-bold tracking-wide text-coraldeep">DAY STREAK 🔥</div>
      <p className="mt-4 text-inksoft">Quick HSC quizzes, streaks, and class boss battles.</p>
      <Link href="/" className="lg-btn lg-btn-primary mt-8 px-6 py-4 text-lg">
        Play HSC Legends ▶
      </Link>
    </main>
  );
}
