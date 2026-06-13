'use client';

import Lottie from 'lottie-react';
import { celebrateAnim } from '@/lib/celebrate-anim';

export default function CelebrateLottie({ className }: { className?: string }) {
  return <Lottie animationData={celebrateAnim} loop className={className} />;
}
