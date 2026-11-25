import { PlayCircle } from 'lucide-react';
import { lessonVideoFor } from '@/lib/lesson-videos.mjs';

// After-answer link to the HSCScience lesson video that teaches this question, when one is public.
export default function LessonVideoLink({
  q,
  video: given,
}: {
  q?: { id?: string | null; lesson_id?: string | null };
  video?: { youtubeId: string; title: string };
}) {
  const video = given ? { ...given, url: `https://youtu.be/${given.youtubeId}` } : q ? lessonVideoFor(q) : null;
  if (!video) return null;
  return (
    <a
      href={video.url}
      target="_blank"
      rel="noopener noreferrer"
      className="lg-card mt-2 flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-plum active:translate-y-0.5 transition"
    >
      <PlayCircle className="h-5 w-5 shrink-0" />
      <span>Watch the lesson: {video.title}</span>
    </a>
  );
}
