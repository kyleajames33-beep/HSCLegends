// Public HSCScience lesson videos, keyed by Teaching-APP lesson id (the same id the question
// bank carries in `lesson_id`). Source of truth is the video repo (lesson-video-generator):
// docs/production/youtube-queue-2026-10-10.json (Module 2 playlist, live-verified 2026-10-10)
// and its production board's published list. Add a row only once a video is public.

/** @typedef {{ youtubeId: string, title: string }} LessonVideo */

/** @type {Record<string, LessonVideo>} */
export const LESSON_VIDEOS = {
  'chem-y11-m2-l01': { youtubeId: 'MCmEsRHKtTU', title: 'The Mole Concept, Part A' },
  'chem-y11-m2-l02': { youtubeId: 'g9zmc5w7kQU', title: 'Molar Mass' },
  'chem-y11-m2-l03': { youtubeId: 'Qjw7Rx5NOOQ', title: 'Empirical Formulas' },
  'chem-y11-m2-l11': { youtubeId: 'A12XpxLTflg', title: 'Mole Ratios' },
  'chem-y11-m2-l12': { youtubeId: 'ay3eq6ijy74', title: 'Mass-to-Mass Stoichiometry' },
  'chem-y11-m2-l13': { youtubeId: '-TLemAVWFvs', title: 'Limiting Reagents' },
};

const LESSON_PREFIX = /^([a-z]+-y1[12]-m\d+-l\d+)(?:-|$)/;

/**
 * The public lesson video for a question, or null. Prefers the stored lesson_id; falls back to
 * the lesson prefix of the question id for RPCs that don't return lesson_id.
 * @param {{ id?: string | null, lesson_id?: string | null }} q
 * @returns {(LessonVideo & { url: string }) | null}
 */
export function lessonVideoFor(q) {
  const lessonId = q.lesson_id || LESSON_PREFIX.exec(q.id ?? '')?.[1];
  const video = lessonId ? LESSON_VIDEOS[lessonId] : undefined;
  return video ? { ...video, url: `https://youtu.be/${video.youtubeId}` } : null;
}
