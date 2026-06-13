// Hand-authored Lottie animations (bodymovin). Add more by registering richer
// ones from lottiefiles.com (free) — drop the JSON here or load by URL via LottieBox.
import { celebrateAnim } from './celebrate-anim';

const ease = { i: { x: [0.5], y: [1] }, o: { x: [0.5], y: [0] } };
const ease3 = { i: { x: [0.5, 0.5, 0.5], y: [1, 1, 1] }, o: { x: [0.5, 0.5, 0.5], y: [0, 0, 0] } };

// Expanding gold pulse + pop — good for level-ups / unlocks / loading.
export const sparkleAnim = {
  v: '5.7.4', fr: 30, ip: 0, op: 45, w: 200, h: 200, nm: 'sparkle', ddd: 0, assets: [],
  layers: [
    {
      ddd: 0, ind: 1, ty: 4, nm: 'ring', sr: 1,
      ks: {
        o: { a: 1, k: [{ t: 0, s: [90], ...ease }, { t: 45, s: [0] }] },
        r: { a: 0, k: 0 }, p: { a: 0, k: [100, 100, 0] }, a: { a: 0, k: [0, 0, 0] },
        s: { a: 1, k: [{ t: 0, s: [20, 20, 100], ...ease3 }, { t: 45, s: [150, 150, 100] }] },
      },
      shapes: [{ ty: 'gr', it: [
        { ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [120, 120] } },
        { ty: 'st', c: { a: 0, k: [0.84, 0.66, 0.37, 1] }, o: { a: 0, k: 100 }, w: { a: 0, k: 12 }, lc: 2, lj: 1 },
        { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
      ] }],
      ip: 0, op: 45, st: 0, bm: 0,
    },
    {
      ddd: 0, ind: 2, ty: 4, nm: 'core', sr: 1,
      ks: {
        o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [100, 100, 0] }, a: { a: 0, k: [0, 0, 0] },
        s: { a: 1, k: [
          { t: 0, s: [55, 55, 100], ...ease3 }, { t: 14, s: [115, 115, 100], ...ease3 },
          { t: 30, s: [75, 75, 100], ...ease3 }, { t: 45, s: [55, 55, 100] },
        ] },
      },
      shapes: [{ ty: 'gr', it: [
        { ty: 'sr', sy: 1, pt: { a: 0, k: 5 }, p: { a: 0, k: [0, 0] }, r: { a: 0, k: 0 }, ir: { a: 0, k: 16 }, is: { a: 0, k: 0 }, or: { a: 0, k: 36 }, os: { a: 0, k: 0 } },
        { ty: 'fl', c: { a: 0, k: [0.92, 0.78, 0.45, 1] }, o: { a: 0, k: 100 } },
        { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
      ] }],
      ip: 0, op: 45, st: 0, bm: 0,
    },
  ],
};

export const LOTTIES = { celebrate: celebrateAnim, sparkle: sparkleAnim };
export type LottieName = keyof typeof LOTTIES;
