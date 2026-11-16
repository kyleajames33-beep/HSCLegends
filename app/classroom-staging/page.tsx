import ClassroomStaging from '@/components/classroom-staging';
import { stagingConfig } from '@/lib/classroom-v2/staging-config';

export const dynamic = 'force-dynamic';
export default function ClassroomStagingPage() {
  const config = stagingConfig(process.env);
  if (!config) return <main><h1>Classroom staging unavailable</h1><p>This isolated test classroom is disabled or not configured.</p></main>;
  return <ClassroomStaging config={config} />;
}
