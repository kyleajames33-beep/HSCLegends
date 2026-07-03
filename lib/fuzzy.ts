// Free-recall grading helpers for the Type-the-Answer mode.
// Levenshtein distance + a tolerant equality check that shrugs off typos,
// capitalisation, spacing, trailing punctuation, and leading articles.

// Classic Levenshtein edit distance (insert / delete / substitute = 1 each).
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Rolling two-row DP — O(min·max) time, O(min) space.
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,       // deletion
        curr[j - 1] + 1,   // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

// Normalise for comparison: lowercase, collapse whitespace, drop a leading
// article, and strip trailing punctuation.
function normalise(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(a|an|the)\s+/, '')
    .replace(/[.,!?;:'"()\-]+$/, '')
    .trim();
}

// Accept if the normalised strings match exactly, or are within a small
// edit-distance budget that scales with the answer length (~20%, min 1).
export function isCloseEnough(typed: string, answer: string): boolean {
  const t = normalise(typed);
  const a = normalise(answer);
  if (!t) return false;
  if (t === a) return true;
  const budget = Math.max(1, Math.floor(a.length * 0.2));
  return levenshtein(t, a) <= budget;
}
