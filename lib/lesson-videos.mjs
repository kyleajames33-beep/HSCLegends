// Public HSCScience lesson videos, keyed by Teaching-APP lesson id (the same id the question
// bank carries in `lesson_id`). Source of truth is the video repo (lesson-video-generator):
// docs/production/youtube-queue-2026-10-10.json (Module 2 playlist, live-verified 2026-10-10)
// and docs/production/claude-pm/youtube/*-uploads.json (Module 5). Add a row only once a video
// is public, and only when it covers the whole site lesson (the Mould video covers just the
// fungi part of bio-y12-m5-l03, so it is not mapped here).

/** @typedef {{ youtubeId: string, title: string }} LessonVideo */

/** @type {Record<string, LessonVideo>} */
export const LESSON_VIDEOS = {
  'chem-y11-m2-l01': { youtubeId: 'MCmEsRHKtTU', title: 'The Mole Concept, Part A' },
  'chem-y11-m2-l02': { youtubeId: 'g9zmc5w7kQU', title: 'Molar Mass' },
  'chem-y11-m2-l03': { youtubeId: 'Qjw7Rx5NOOQ', title: 'Empirical Formulas' },
  'chem-y11-m2-l11': { youtubeId: 'A12XpxLTflg', title: 'Mole Ratios' },
  'chem-y11-m2-l12': { youtubeId: 'ay3eq6ijy74', title: 'Mass-to-Mass Stoichiometry' },
  'chem-y11-m2-l13': { youtubeId: '-TLemAVWFvs', title: 'Limiting Reagents' },
  'chem-y12-m5-l01': { youtubeId: 'zaC5iXuovKg', title: 'Static and Dynamic Equilibrium' },
  'bio-y12-m5-l01': { youtubeId: '44FFfv7RGck', title: 'Sexual and Asexual Reproduction' },
};

/**
 * The public lesson video for a question, or null. Uses only the stored lesson_id. Missing identity means no link.
 * @param {{ id?: string | null, lesson_id?: string | null }} q
 * @returns {(LessonVideo & { url: string }) | null}
 */
export function lessonVideoFor(q) {
  const lessonId = q.lesson_id;
  const video = lessonId ? LESSON_VIDEOS[lessonId] : undefined;
  return video ? { ...video, url: `https://youtu.be/${video.youtubeId}` } : null;
}
