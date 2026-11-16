// Generate a self-contained public demo from the isolated prototype sources.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../prototypes/lab-tycoon/', import.meta.url);
const [content, arcade, css, boss, lab] = await Promise.all([
  readFile(new URL('src/content.mjs', root), 'utf8'),
  readFile(new URL('arcade.mjs', root), 'utf8'),
  readFile(new URL('arcade.css', root), 'utf8'),
  readFile(new URL('boss-rush.webp', root)),
  readFile(new URL('lab-arena.webp', root)),
]);
const js = content.replace(/^export /gm, '') + '\n' + arcade.replace(/^import .*;\s*\n/m, '').replace('./boss-rush.webp', `data:image/webp;base64,${boss.toString('base64')}`);
const bundledCss = css.replace('./lab-arena.webp', `data:image/webp;base64,${lab.toString('base64')}`);
const sourceHash = createHash('sha256').update(content).update(arcade).update(css).update(boss).update(lab).digest('hex');
if (/<\/script/i.test(js) || /<\/style/i.test(css)) throw new Error('Unexpected closing tag in demo source.');
const html = `<!doctype html>\n<!-- Lab Rush source SHA-256: ${sourceHash} -->\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"><title>Lab Rush sample · HSC Legends</title><style>${bundledCss}</style></head><body><div id="app"></div><noscript>JavaScript is needed for this sample game.</noscript><script>(()=>{\n'use strict';\n${js}\n})();</script></body></html>\n`;
await writeFile(new URL('../public/lab-rush.html', import.meta.url), html);
console.log('Built public/lab-rush.html from the offline sample.');
