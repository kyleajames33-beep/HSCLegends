'use client';

import LegacyJoinPage from './legacy-join';
import SecureJoinPage from './secure-join';
import { classroomRecoveryEnabled } from '@/lib/classroom-recovery-gate';

// Explicitly held off. Existing production behavior is preserved byte-for-byte
// in legacy-join.tsx until the server/auth/guest/XP rollout is separately approved.
export default function JoinPage() {
  return classroomRecoveryEnabled ? <SecureJoinPage /> : <LegacyJoinPage />;
}
