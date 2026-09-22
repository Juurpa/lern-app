import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marked } from 'marked';
import { md, mdInline, isHttpUrl } from '../js/render.js';

globalThis.marked = marked;

test('md: Java-Generics bleiben als Text sichtbar', () => {
  const out = md('Eine List<E> speichert Elemente, Map<K, V> Paare.');
  assert.ok(out.includes('List&lt;E&gt;'), out);
  assert.ok(out.includes('Map&lt;K, V&gt;'), out);
});

test('md: HTML-Block (z. B. FXML) wird escaped statt als Element gerendert', () => {
  const out = md('<VBox>\n  <Button text="OK"/>\n</VBox>');
  assert.ok(!/<vbox|<button/i.test(out), out);
  assert.ok(out.includes('&lt;Button'), out);
});

test('md: kein XSS über rohes HTML oder javascript:-Links', () => {
  assert.ok(!md('<img src=x onerror=alert(1)>').includes('<img'));
  assert.ok(!md('Text <script>alert(1)</script>').includes('<script'));
  assert.ok(!md('[klick](javascript:alert(1))').includes('javascript:'));
});

test('md: Code und Mathe funktionieren weiter', () => {
  assert.ok(md('`List<E>`').includes('<code>List&lt;E&gt;</code>'));
  assert.ok(md('```java\nList<E> l;\n```').includes('List&lt;E&gt; l;'));
  const m = md('Es gilt $a<b$ und **fett**.');
  assert.ok(m.includes('$a&lt;b$'), m);
  assert.ok(m.includes('<strong>fett</strong>'), m);
});

test('mdInline: kein <p>, Markdown und Escaping aktiv', () => {
  const out = mdInline('**ArrayList<E>** mit $O(1)$');
  assert.ok(!out.startsWith('<p>'), out);
  assert.ok(out.includes('<strong>ArrayList&lt;E&gt;</strong>'), out);
  assert.ok(out.includes('$O(1)$'), out);
  assert.ok(!mdInline('<img src=x onerror=alert(1)>').includes('<img'));
});

test('isHttpUrl: nur http(s)-Links für Videos', () => {
  assert.equal(isHttpUrl('https://www.youtube.com/watch?v=x'), true);
  assert.equal(isHttpUrl('http://example.org'), true);
  assert.equal(isHttpUrl('javascript:alert(1)'), false);
  assert.equal(isHttpUrl('data:text/html,x'), false);
  assert.equal(isHttpUrl(undefined), false);
});
