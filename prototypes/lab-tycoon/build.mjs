import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const sources=await Promise.all(['content.mjs','model.mjs','app.mjs'].map(f=>readFile(path.join(root,'src',f),'utf8')));
// All imports are local and one-line; no transpilation or external dependencies.
const js=sources.join('\n').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
if(/<\/script/i.test(js)) throw new Error('Unexpected script close in source');
const css=await readFile(path.join(root,'src/styles.css'),'utf8');
const html=`<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'"><meta name="color-scheme" content="light"><title>Equilibrium Lab · HSC Legends offline prototype</title><style>${css}</style></head><body><div id="app"></div><noscript>This offline sample needs JavaScript to run. It does not use accounts or network connections.</noscript><script>(()=>{\n'use strict';\n${js}\n})();</script></body></html>\n`;
await writeFile(path.join(root,'lab-tycoon.html'),html);
console.log('Built self-contained lab-tycoon.html. No network or build dependencies.');
