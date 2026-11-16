'use client';

import 'katex/dist/katex.min.css';
import katex from 'katex';

// Renders a string that may contain $…$ (inline) or $$…$$ (display) LaTeX.
function render(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, { throwOnError: false, displayMode: display });
  } catch {
    // This value is inserted as HTML below. If KaTeX rejects unexpected input,
    // keep the source visible without treating its contents as HTML.
    return tex.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
  }
}

export default function MathText({ text, className }: { text?: string | null; className?: string }) {
  if (!text || !text.includes('$')) return <span className={className}>{text}</span>;

  const parts: { kind: 'text' | 'math'; value: string; display?: boolean }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const pattern = /\$\$([^$]+)\$\$|\$([^$]+)\$/g;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) parts.push({ kind: 'text', value: text.slice(last, m.index) });
    const display = m[1] !== undefined;
    parts.push({ kind: 'math', value: display ? m[1] : m[2], display });
    last = pattern.lastIndex;
  }
  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) });

  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.kind === 'text' ? (
          <span key={i}>{p.value}</span>
        ) : (
          <span key={i} dangerouslySetInnerHTML={{ __html: render(p.value, !!p.display) }} />
        )
      )}
    </span>
  );
}
