export const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export function md(text = '') {
  if (!globalThis.marked) return esc(text).replace(/\n/g, '<br>');
  const math = [];
  const guarded = text.replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g, m => `@@M${math.push(m) - 1}@@`);
  return globalThis.marked.parse(guarded).replace(/@@M(\d+)@@/g, (_, i) => esc(math[Number(i)]));
}

export function enhance(el) {
  globalThis.renderMathInElement?.(el, {
    delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
    throwOnError: false,
  });
  if (globalThis.hljs) el.querySelectorAll('pre code').forEach(b => globalThis.hljs.highlightElement(b));
}

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function download(filename, text, mime = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
