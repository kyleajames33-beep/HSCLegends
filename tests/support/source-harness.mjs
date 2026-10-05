import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
export function sourceText(path) { return fs.readFileSync(new URL(path, root), 'utf8'); }

export function loadSourceModule(path, dependencies = {}, globals = {}) {
  const code = ts.transpileModule(sourceText(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  const context = {
    module: loaded, exports: loaded.exports, Error, TypeError, SyntaxError, JSON,
    require(name) {
      if (!Object.hasOwn(dependencies, name)) throw new Error(`Unmocked dependency: ${name} in ${path}`);
      return dependencies[name];
    },
    setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {},
    ...globals,
  };
  vm.runInNewContext(code, context, { filename: fileURLToPath(new URL(path, root)), timeout: 1000 });
  return loaded.exports;
}

export function loadSourceFunction(path, name) {
  const source = sourceText(path);
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!declaration) throw new Error(`Function ${name} not found in ${path}; update the regression adapter.`);
  const js = ts.transpileModule(declaration.getText(file), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(`${js}; ${name}`, {}, { timeout: 1000 });
}

export function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
}

// Minimal hooks test double: executes the actual page functions and handlers.
// It does not implement React scheduling, hydration, DOM, browser history or CSS.
export function pageHarness(path, sb, storage = memoryStorage(), auth = { user: path.includes('/host/') ? { id: 'synthetic-host-1' } : null, loading: false }, options = {}) {
  const slots = [];
  let cursor = 0, dirty = false;
  let pending = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!Object.hasOwn(slots, i)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (value) => {
        const next = typeof value === 'function' ? value(slots[i]) : value;
        if (!Object.is(slots[i], next)) { slots[i] = next; dirty = true; }
      }];
    },
    useRef(initial) {
      const i = cursor++;
      if (!Object.hasOwn(slots, i)) slots[i] = { current: initial };
      return slots[i];
    },
    useMemo(factory, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: factory() };
      return slots[i].value;
    },
    useSyncExternalStore(subscribe, getSnapshot) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { cleanup: subscribe(() => { dirty = true; }) };
      return getSnapshot();
    },
    useEffect(effect, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        pending.push(() => { slots[i]?.cleanup?.(); const cleanup = effect(); slots[i] = { deps, cleanup }; });
      }
    },
  };
  const window = options.scheduler ?? { setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {} };
  const document = { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} };
  const globals = { ...window, window, document, localStorage: storage };
  const cache = loadSourceModule('lib/live-session-cache.ts', {}, globals);
  const learning = loadSourceModule('lib/classroom-learning.ts');
  const dependencies = {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment' },
    'next/link': { default: 'a' },
    'next/navigation': { useRouter: () => ({ push: () => {} }) },
    '@/lib/supabase/client': { createClient: () => sb },
    '@/lib/use-user': { useUser: () => auth },
    '@/lib/use-countdown': { useCountdown: () => options.countdown ?? ({ remaining: 15, frac: 1, expired: false }) },
    '@/lib/questions': loadSourceModule('lib/questions.ts'),
    '@/lib/live': loadSourceModule('lib/live.ts'),
    '@/lib/live-session-cache': cache,
    '@/lib/classroom-learning': learning,
    '@/lib/live-host-controller': loadSourceModule('lib/live-host-controller.ts', { './live': loadSourceModule('lib/live.ts'), './live-session-cache': cache }, globals),
    '@/lib/presence': loadSourceModule('lib/presence.ts', {}, globals),
    '@/components/answer-tile': { default: 'AnswerTile' },
    '@/components/math-text': { default: ({ text }) => text },
    '@/components/avatar': { default: 'Avatar' },
  };
  const Page = loadSourceModule(path, dependencies, globals).default;
  return {
    storage,
    async render() {
      let tree;
      for (let pass = 0; pass < 8; pass++) {
        cursor = 0; dirty = false; tree = Page();
        const effects = pending; pending = [];
        for (const effect of effects) effect();
        await Promise.resolve(); await Promise.resolve();
        if (!dirty) return tree;
      }
      throw new Error('Hook test double did not settle');
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

export function elements(node) {
  if (node == null || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  if (typeof node !== 'object') return [];
  if (typeof node.type === 'function') return elements(node.type(node.props));
  return [node, ...elements(node.props?.children)];
}
export function textContent(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (typeof node.type === 'function') return textContent(node.type(node.props));
  return textContent(node.props?.children);
}
