'use client';

import { useEffect, useState } from 'react';
import Lottie from 'lottie-react';
import { LOTTIES, type LottieName } from '@/lib/lotties';

// Plays a bundled animation by name, OR any animation from a URL (e.g. a free
// one from lottiefiles.com — just pass its .json link as `src`).
export default function LottieBox({
  name, src, loop = true, className,
}: { name?: LottieName; src?: string; loop?: boolean; className?: string }) {
  const [remote, setRemote] = useState<{ src: string; data: object } | null>(null);
  useEffect(() => {
    if (!src) return;
    const controller = new AbortController();
    fetch(src, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Animation unavailable');
        return response.json();
      })
      .then((data) => { if (!controller.signal.aborted) setRemote({ src, data }); })
      .catch(() => {});
    return () => controller.abort();
  }, [src]);
  const data = src ? (remote?.src === src ? remote.data : null) : (name ? LOTTIES[name] : null);
  if (!data) return null;
  return <Lottie animationData={data} loop={loop} className={className} />;
}
