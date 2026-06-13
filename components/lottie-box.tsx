'use client';

import { useEffect, useState } from 'react';
import Lottie from 'lottie-react';
import { LOTTIES, type LottieName } from '@/lib/lotties';

// Plays a bundled animation by name, OR any animation from a URL (e.g. a free
// one from lottiefiles.com — just pass its .json link as `src`).
export default function LottieBox({
  name, src, loop = true, className,
}: { name?: LottieName; src?: string; loop?: boolean; className?: string }) {
  const [data, setData] = useState<object | null>(name ? LOTTIES[name] : null);
  useEffect(() => {
    if (src) fetch(src).then((r) => r.json()).then(setData).catch(() => {});
    else if (name) setData(LOTTIES[name]);
  }, [src, name]);
  if (!data) return null;
  return <Lottie animationData={data} loop={loop} className={className} />;
}
