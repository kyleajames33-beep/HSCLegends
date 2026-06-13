// Lazy-loaded celebration burst in the app's palette.
export async function celebrate(big = false) {
  if (typeof window === 'undefined') return;
  const confetti = (await import('canvas-confetti')).default;
  const colors = ['#6d5b8a', '#c47b8a', '#d6a85f', '#6b9b7c', '#9c5c6e'];
  confetti({ particleCount: big ? 180 : 110, spread: big ? 100 : 70, startVelocity: big ? 55 : 45, origin: { y: 0.6 }, colors });
  if (big) {
    setTimeout(() => confetti({ particleCount: 80, angle: 60, spread: 70, origin: { x: 0, y: 0.65 }, colors }), 150);
    setTimeout(() => confetti({ particleCount: 80, angle: 120, spread: 70, origin: { x: 1, y: 0.65 }, colors }), 300);
  }
}
