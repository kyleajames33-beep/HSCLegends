import Link from 'next/link';
import { SUBJECTS } from '@/lib/questions';
import BossArt from '@/components/boss-art';
import Avatar, { AVATAR_STYLES, STYLE_LABEL } from '@/components/avatar';
import LeagueBadge from '@/components/league-badge';
import { PodiumSpot, ClassSpot } from '@/components/spot';
import LottieBox from '@/components/lottie-box';

const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];
const STATES: { label: string; frac: number; defeated?: boolean }[] = [
  { label: 'healthy', frac: 1 }, { label: 'hurt', frac: 0.4 },
  { label: 'critical', frac: 0.15 }, { label: 'defeated', frac: 0, defeated: true },
];

export default function Showcase() {
  return (
    <main className="flex flex-1 flex-col px-6 pt-12 pb-16 max-w-md w-full mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-ink">Asset showcase</h1>
        <Link href="/" className="text-sm text-muted underline">Home</Link>
      </div>
      <p className="text-inksoft text-sm mt-1">Every custom + library asset in one place.</p>

      <Section title="Boss creatures (HP expressions)">
        <div className="space-y-3">
          {SUBJECTS.map((s) => (
            <div key={s.id} className="rounded-2xl p-3 text-white" style={{ background: 'linear-gradient(160deg,#2d3142,#4e4068)' }}>
              <div className="text-xs font-semibold text-white/70 mb-1">{s.label}</div>
              <div className="grid grid-cols-4 gap-1">
                {STATES.map((st) => (
                  <div key={st.label} className="text-center">
                    <BossArt subject={s.id} frac={st.frac} defeated={st.defeated} className="w-full h-auto" />
                    <div className="text-[9px] text-white/50">{st.label}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Avatar styles (DiceBear)">
        <div className="grid grid-cols-4 gap-3">
          {AVATAR_STYLES.map((st) => (
            <div key={st} className="text-center">
              <Avatar seed="legend-demo" style={st} size={64} className="rounded-full w-full h-auto" />
              <div className="text-[10px] text-muted mt-1">{STYLE_LABEL[st]}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="League badges">
        <div className="flex justify-between gap-2">
          {TIERS.map((t) => (
            <div key={t} className="text-center">
              <LeagueBadge tier={t} className="h-12 w-auto mx-auto" />
              <div className="text-[10px] text-muted mt-1">{t}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Empty-state illustrations">
        <div className="grid grid-cols-2 gap-3">
          <div className="lg-card p-2"><PodiumSpot className="w-full h-auto" /></div>
          <div className="lg-card p-2"><ClassSpot className="w-full h-auto" /></div>
        </div>
      </Section>

      <Section title="Lottie animations">
        <div className="grid grid-cols-2 gap-3">
          <div className="lg-card flex flex-col items-center p-4">
            <LottieBox name="celebrate" className="h-24 w-24" />
            <div className="text-[10px] text-muted">celebrate</div>
          </div>
          <div className="lg-card flex flex-col items-center p-4">
            <LottieBox name="sparkle" className="h-24 w-24" />
            <div className="text-[10px] text-muted">sparkle / level-up</div>
          </div>
        </div>
        <p className="text-xs text-muted mt-2">+ unlimited more: pick any from lottiefiles.com and they drop straight in.</p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="font-display font-extrabold text-ink mb-3">{title}</h2>
      {children}
    </section>
  );
}
