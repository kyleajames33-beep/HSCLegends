import LiveHost from '@/components/live/live-host';
import { stagingConfig } from '@/lib/classroom-v2/staging-config';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Host a live game · HSC Legends' };

export default function LiveHostPage() {
  const config = stagingConfig(process.env);
  if (!config) return <main className="p-8"><h1>Live games unavailable</h1><p>The live classroom test environment is not configured.</p></main>;
  return <LiveHost config={config} />;
}
