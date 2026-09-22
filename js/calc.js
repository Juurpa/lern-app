// Rechenaufgaben: kleiner Ausdrucksparser (ohne eval), Zufallswerte, Platzhalter, Antwortprüfung.
const FUNCS = { sqrt: Math.sqrt, exp: Math.exp, ln: Math.log, log10: Math.log10, sin: Math.sin, cos: Math.cos, tan: Math.tan, abs: Math.abs };
const CONSTS = { pi: Math.PI, e: Math.E };

function tokenize(src) {
  const tokens = [];
  const re = /\s*(?:(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(\S))/y;
  while (re.lastIndex < src.length) {
    const m = re.exec(src);
    if (!m) break; // nur noch Leerzeichen
    if (m[1] !== undefined) tokens.push({ t: 'num', v: Number(m[1]) });
    else if (m[2] !== undefined) tokens.push({ t: 'id', v: m[2] });
    else {
      if (!'+-*/^(),'.includes(m[3])) throw new Error(`Unerwartetes Zeichen '${m[3]}'`);
      tokens.push({ t: 'op', v: m[3] });
    }
  }
  return tokens;
}

export function evaluate(expr, vars = {}) {
  const tk = tokenize(String(expr));
  let i = 0;
  const peek = () => tk[i]?.v;
  const take = want => {
    const t = tk[i];
    if (!t || (want !== undefined && t.v !== want)) throw new Error(`Erwartet '${want ?? 'Ausdruck'}'`);
    i++;
    return t;
  };
  function expression() {
    let v = term();
    while (peek() === '+' || peek() === '-') v = take().v === '+' ? v + term() : v - term();
    return v;
  }
  function term() {
    let v = unary();
    while (peek() === '*' || peek() === '/') v = take().v === '*' ? v * unary() : v / unary();
    return v;
  }
  function unary() {
    if (peek() === '-') { take(); return -unary(); }
    if (peek() === '+') { take(); return unary(); }
    return power();
  }
  function power() {
    const base = primary();
    if (peek() === '^') { take(); return base ** unary(); }
    return base;
  }
  function primary() {
    const t = take();
    if (t.t === 'num') return t.v;
    if (t.v === '(') { const v = expression(); take(')'); return v; }
    if (t.t === 'id') {
      if (peek() === '(') {
        const f = FUNCS[t.v];
        if (!f) throw new Error(`Unbekannte Funktion ${t.v}`);
        take('(');
        const a = expression();
        take(')');
        return f(a);
      }
      if (Object.hasOwn(vars, t.v)) return Number(vars[t.v]);
      if (Object.hasOwn(CONSTS, t.v)) return CONSTS[t.v];
      throw new Error(`Unbekannte Variable ${t.v}`);
    }
    throw new Error(`Unerwartet '${t.v}'`);
  }
  const v = expression();
  if (i < tk.length) throw new Error(`Unerwartet '${tk[i].v}'`);
  return v;
}

const decimals = x => { const s = String(x); const k = s.indexOf('.'); return k < 0 ? 0 : s.length - k - 1; };

export function drawVars(spec, rng = Math.random) {
  const out = {};
  for (const [name, [min, max, step]] of Object.entries(spec)) {
    const n = Math.floor((max - min) / step + 1e-9) + 1;
    const v = min + step * Math.floor(rng() * n);
    out[name] = Number(v.toFixed(Math.max(decimals(step), decimals(min))));
  }
  return out;
}

export function formatNumber(v) {
  if (!Number.isFinite(v)) return String(v);
  return Number(v.toPrecision(4)).toLocaleString('de-DE', { useGrouping: false, maximumFractionDigits: 10 });
}

export function fill(template, vars) {
  return String(template ?? '').replace(/\[\[(=)?\s*([^[\]]+?)\s*\]\]/g, (m, isExpr, body) => {
    if (isExpr) return formatNumber(evaluate(body, vars));
    return Object.hasOwn(vars, body) ? formatNumber(vars[body]) : m;
  });
}

export function parseNumber(input) {
  const s = String(input ?? '').replace(/\s/g, '').replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;
  return Number(s);
}

export function checkAnswer(input, expected, tolerance = 0.02) {
  const v = parseNumber(input);
  if (v === null) return { ok: false, value: null };
  const ok = expected === 0 ? Math.abs(v) < 1e-9 : Math.abs(v - expected) <= tolerance * Math.abs(expected);
  return { ok, value: v };
}

export function prepareCalc(calc, rng = Math.random) {
  const vars = drawVars(calc.vars ?? {}, rng);
  return {
    vars,
    expected: evaluate(calc.solution, vars),
    given: fill(calc.given, vars),
    steps: (calc.steps ?? []).map(s => fill(s, vars)),
    unit: calc.unit ?? '',
    tolerance: calc.tolerance ?? 0.02,
  };
}

export function checkCalcSpec(calc) {
  const errors = [];
  if (!calc || typeof calc !== 'object') return ['calc fehlt'];
  if (!calc.given) errors.push('calc.given fehlt');
  if (!calc.solution) errors.push('calc.solution fehlt');
  const vars = calc.vars ?? {};
  for (const [k, r] of Object.entries(vars)) {
    if (!Array.isArray(r) || r.length !== 3 || !r.every(Number.isFinite) || r[2] <= 0 || r[1] < r[0]) errors.push(`calc.vars.${k} muss [min, max, step] sein`);
  }
  if (errors.length) return errors;
  for (const p of [0, 0.5, 0.999999]) {
    try {
      const t = prepareCalc(calc, () => p);
      if (!Number.isFinite(t.expected)) errors.push(`calc.solution ergibt ${t.expected}`);
    } catch (e) {
      errors.push(`calc: ${e.message}`);
    }
  }
  if (calc.example) {
    try {
      const r = evaluate(calc.solution, calc.example.vars);
      if (!checkAnswer(String(r), calc.example.result, 0.005).ok && !checkAnswer(String(calc.example.result), r, 0.005).ok) errors.push(`calc.example: ${r} ≠ ${calc.example.result}`);
    } catch (e) {
      errors.push(`calc.example: ${e.message}`);
    }
  }
  return [...new Set(errors)];
}
