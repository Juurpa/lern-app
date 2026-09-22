export const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export const isHttpUrl = u => /^https?:\/\/\S/i.test(String(u ?? '').trim());

const SAFE_URL = /^(https?:|mailto:|#|\/|\.|[^:]*$)/i;
const configured = new WeakSet();

// Rohes HTML wird nie als HTML ausgegeben: Java-Generics (List<E>) bleiben sichtbar,
// importierte Inhalte können kein Markup/Script einschleusen.
function lib() {
  const m = globalThis.marked;
  if (m && !configured.has(m)) {
    m.use({
      renderer: {
        html(token) {
          const text = typeof token === 'string' ? token : token.text;
          return token.block ? `<p>${esc(text.trim())}</p>\n` : esc(text);
        },
      },
      walkTokens(t) {
        if ((t.type === 'link' || t.type === 'image') && !SAFE_URL.test(String(t.href ?? '').trim())) t.href = '#';
      },
    });
    configured.add(m);
  }
  return m;
}

function withMath(text, parse) {
  const math = [];
  const guarded = String(text ?? '').replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g, m => `@@M${math.push(m) - 1}@@`);
  return parse(guarded).replace(/@@M(\d+)@@/g, (_, i) => esc(math[Number(i)]));
}

export function md(text = '') {
  const m = lib();
  if (!m) return esc(text).replace(/\n/g, '<br>');
  return withMath(text, s => m.parse(s));
}

export function mdInline(text = '') {
  const m = lib();
  if (!m) return esc(text);
  return withMath(text, s => m.parseInline(s));
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
