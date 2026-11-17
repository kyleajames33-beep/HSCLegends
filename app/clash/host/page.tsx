import ClashHost from '@/components/clash/clash-host';
import { stagingConfig } from '@/lib/classroom-v2/staging-config';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reactor Clash · HSC Legends' };

export default function Page() {
  const config = stagingConfig(process.env);
  if (!config) return <main className="p-8"><h1>Reactor Clash multiplayer is unavailable</h1><p>The live game test environment is not configured.</p></main>;
  return <ClashHost config={config} />;
}
