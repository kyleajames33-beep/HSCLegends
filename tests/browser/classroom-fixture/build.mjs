import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, '../../..');
if (!process.argv[2])
    throw new Error('Pass a local output directory; generated bundles must remain outside the source tree.');
const out = path.resolve(process.argv[2]);
if (out === repo || out.startsWith(repo + path.sep))
    throw new Error('Output must be outside the source tree');
await fs.mkdir(out, { recursive: true });
const require = createRequire(import.meta.url);
// Uses an already installed esbuild; this builder never installs dependencies.
const esbuild = require(process.env.CLASSROOM_ESBUILD_PATH || 'esbuild');
const plugin = { name: 'only-explicit-fixture-injection', setup(build) { build.onResolve({ filter: /^@\// }, args => { let p = args.path === '@/lib/use-user' ? path.join(dir, 'fixture-state.mjs') : args.path === '@/lib/classroom-recovery' ? path.join(dir, 'transport.mjs') : path.join(repo, args.path.slice(2)); if (!path.extname(p))
        p += p.includes('/components/') ? '.tsx' : '.ts'; return { path: p }; }); } };
const options = { bundle: true, jsx: 'automatic', plugins: [plugin], nodePaths: [path.join(repo, 'node_modules')], loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'info' };
await esbuild.build({ ...options, entryPoints: [path.join(dir, 'client.jsx')], outfile: path.join(out, 'bundle.js'), platform: 'browser', format: 'iife' });
await esbuild.build({ ...options, entryPoints: [path.join(dir, 'server.jsx')], outfile: path.join(out, 'ssr.cjs'), platform: 'node', format: 'cjs' });
const { render } = require(path.join(out, 'ssr.cjs'));
const bundle = await fs.readFile(path.join(out, 'bundle.js'), 'utf8');
const instrumentation = `const d={hydrated:false,nodeRetained:false,mainRetained:false,recoverable:[],errors:[],warnings:[],unhandled:[],blockedNetwork:0};const first=document.getElementById('root').firstChild;const main=document.querySelector('#root main');function report(){document.getElementById('diagnostics').textContent=JSON.stringify(d)}window.__hydrated=()=>{d.hydrated=true;d.nodeRetained=first===document.getElementById('root').firstChild;d.mainRetained=main===document.querySelector('#root main');report()};window.__recoverable=e=>{d.recoverable.push(String(e));report()};for(const k of ['error','warn']){const orig=console[k];console[k]=(...a)=>{d[k==='error'?'errors':'warnings'].push(a.map(String).join(' '));report();orig(...a)}}window.addEventListener('error',e=>{d.unhandled.push(e.message);report()});window.addEventListener('unhandledrejection',e=>{d.unhandled.push(String(e.reason));report()});const blocked=()=>{d.blockedNetwork++;report();throw Error('Network disabled in synthetic fixture')};window.fetch=blocked;window.XMLHttpRequest=class {constructor(){blocked()}};window.WebSocket=class {constructor(){blocked()}};window.EventSource=class {constructor(){blocked()}};navigator.sendBeacon=blocked;report();`;
const css = `body{margin:0;background:#f5f0e8;color:#241e2a;font:17px system-ui,sans-serif}aside{background:#e9deef;padding:12px 20px;font-size:14px}aside p{margin:5px 0}aside button{font-size:12px;margin:5px}output{display:block;font:12px monospace;margin-top:8px}main{padding:22px;max-width:700px;margin:auto;min-height:500px}h1{font-size:30px}button{padding:12px;border:1px solid #96869d;border-radius:8px;cursor:pointer;background:#fff}button:disabled{opacity:.45;cursor:default}input{box-sizing:border-box;display:block;width:100%;padding:16px;font-size:20px;margin:12px 0;border:1px solid #96869d;border-radius:8px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px}.grid button{font-size:23px;min-height:65px}.text-2xl{font-size:24px}.text-3xl{font-size:30px}.text-6xl{font-size:45px}.text-center{text-align:center}.mt-3,.mt-4,.mt-5,.mt-6{margin-top:15px}.w-full{width:100%}[role=alert]{color:#9d2434}#diagnostics{font:12px monospace;white-space:pre-wrap;background:#fff;border-bottom:1px solid #aaa;margin:0;padding:10px}.leading-relaxed{line-height:1.6}a{color:#493267}`;
// Test-only mutation control, never a production route or feature flag.
const scenarios = ['fresh', 'committed', 'historical'];
if (process.env.CLASSROOM_HYDRATION_NEGATIVE_CONTROL === '1') scenarios.push('hydration-negative');
for (const scenario of scenarios) {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Classroom synthetic hydration ${scenario}</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><link rel="icon" href="data:,"><style>${css}</style></head><body><pre id="diagnostics" aria-label="Hydration diagnostics"></pre><div id="root">${scenario === 'hydration-negative' ? render(scenario).replace('Join a game', 'Intentionally mismatched SSR heading') : render(scenario)}</div><script>${instrumentation}</script><script>${bundle.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
    await fs.writeFile(path.join(out, `${scenario}.html`), html);
    if (scenario === 'fresh')
        await fs.writeFile(path.join(out, 'index.html'), html);
}
console.log('Wrote SSR + inline hydration fixture with development React; production source unchanged.');
