import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasUpdate, fetchRemoteVersion, applyUpdate, DATA_URLS } from '../js/update.js';

test('hasUpdate', () => {
  assert.equal(hasUpdate({ version: 'a' }, { version: 'b' }), true);
  assert.equal(hasUpdate({ version: 'a' }, { version: 'a' }), false);
  assert.equal(hasUpdate({ version: 'a' }, null), false);
  assert.equal(hasUpdate(undefined, { version: 'b' }), true);
});

test('fetchRemoteVersion umgeht den Cache und toleriert Fehler', async () => {
  let seen;
  const r = await fetchRemoteVersion(async (u, o) => { seen = { u, o }; return { ok: true, json: async () => ({ version: 'x' }) }; });
  assert.deepEqual(r, { version: 'x' });
  assert.match(seen.u, /^data\/version\.json\?check=\d+$/);
  assert.equal(seen.o.cache, 'no-store');
  assert.equal(await fetchRemoteVersion(async () => ({ ok: false })), null);
  assert.equal(await fetchRemoteVersion(async () => { throw new Error('offline'); }), null);
});

test('applyUpdate lädt alle Datendateien frisch in den App-Cache', async () => {
  const put = [];
  const cache = { put: async (u) => put.push(u) };
  const cachesApi = { keys: async () => ['andere', 'lernapp-v5'], open: async name => { assert.equal(name, 'lernapp-v5'); return cache; } };
  const fetched = [];
  await applyUpdate({ cachesApi, fetchFn: async (u, o) => { fetched.push({ u, cache: o.cache }); return { ok: true, clone() { return this; } }; }, urls: ['data/a.json', 'data/version.json'] });
  // Der Fetch muss den SW-Cache umgehen (?check= + no-store), sonst schreibt der SW den alten Stand zurück.
  assert.match(fetched[0].u, /^data\/a\.json\?check=\d+$/);
  assert.match(fetched[1].u, /^data\/version\.json\?check=\d+$/);
  assert.deepEqual(fetched.map(f => f.cache), ['no-store', 'no-store']);
  // Im App-Cache landet trotzdem die reine URL (ohne ?check=), damit die App sie offline unter dem gewohnten Key findet.
  assert.deepEqual(put, ['data/a.json', 'data/version.json']);
});

test('applyUpdate bricht bei HTTP-Fehler ab', async () => {
  await assert.rejects(applyUpdate({ cachesApi: null, fetchFn: async () => ({ ok: false, status: 404 }), urls: ['data/a.json'] }), /data\/a\.json: HTTP 404/);
});

test('DATA_URLS enthält alle Datendateien und version.json', () => {
  for (const u of ['data/meta.json', 'data/units.json', 'data/cards-inf2.json', 'data/cards-mts.json', 'data/cards-radar.json', 'data/bridges.json', 'data/synthesis.json', 'data/version.json']) assert.ok(DATA_URLS.includes(u), u);
});
