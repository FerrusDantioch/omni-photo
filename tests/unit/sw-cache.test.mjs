/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { creerContexte, creerMocksCaches, chargerScripts, lireSymbole } from './_harness.mjs';

const SCOPE = 'https://ferrusdantioch.github.io/omni-photo/';

function creerSw(overrides = {}) {
  const caches = creerMocksCaches(SCOPE);
  let claimed = false;
  let skipped = false;
  const ctx = creerContexte({
    scope: SCOPE,
    caches,
    registration: { scope: SCOPE },
    clients: { async claim() { claimed = true; } },
    skipWaiting() { skipped = true; },
    ...overrides
  });
  chargerScripts(ctx, ['sw.js']);
  return { ctx, caches, getClaimed: () => claimed, getSkipped: () => skipped };
}

test('Constantes SW alignées (CACHE, CACHE_IA, CACHE_PARTAGE, PREFIXE)', () => {
  const { ctx } = creerSw();
  assert.equal(lireSymbole(ctx, 'CACHE'), 'omni-photo-v7');
  assert.equal(lireSymbole(ctx, 'CACHE_IA'), 'omni-photo-ia-v1');
  assert.equal(lireSymbole(ctx, 'CACHE_PARTAGE'), 'omni-photo-partage');
  assert.equal(lireSymbole(ctx, 'PREFIXE'), 'omni-photo-');
  assert.equal(lireSymbole(ctx, 'FICHIERS_IA').length, 4);
});

test('activate migre v1-v3 vers CACHE_IA sans écraser, exclut omni-photo-ia-v0/v4-v6, et préserve les autres apps', async () => {
  const { ctx, caches, getClaimed } = creerSw();

  const v3 = await caches.open('omni-photo-v3');
  await v3.put('./u2netp.onnx', new Response('from-v3', { status: 200 }));
  await v3.put('./modnet.onnx', new Response('modnet-from-v3', { status: 200 }));

  const iaV0 = await caches.open('omni-photo-ia-v0');
  await iaV0.put('./ort.wasm.bundle.min.mjs', new Response('from-ia-v0', { status: 200 }));
  await iaV0.put('./u2netp.onnx', new Response('poison-ia-v0', { status: 200 }));

  const v6 = await caches.open('omni-photo-v6');
  await v6.put('./ort-wasm-simd-threaded.wasm', new Response('from-v6', { status: 200 }));

  const iaV1 = await caches.open('omni-photo-ia-v1');
  await iaV1.put('./modnet.onnx', new Response('existing-ia-v1', { status: 200 }));

  const sibling = await caches.open('omni-video-v9');
  await sibling.put('https://ferrusdantioch.github.io/omni-video/app.js', new Response('video', { status: 200 }));

  let waitPromise = null;
  ctx.dispatchEvent('activate', { waitUntil(p) { waitPromise = p; } });
  await waitPromise;

  assert.equal(getClaimed(), true);
  const cles = await caches.keys();
  assert.equal(cles.includes('omni-photo-v3'), false);
  assert.equal(cles.includes('omni-photo-ia-v0'), false);
  assert.equal(cles.includes('omni-photo-v6'), false);
  assert.equal(cles.includes('omni-video-v9'), true);

  // u2netp migré depuis v3 ; modnet existant non écrasé ; ort.wasm (uniquement dans ia-v0) et wasm (dans v6) non migrés
  assert.equal(await (await iaV1.match('./u2netp.onnx')).text(), 'from-v3');
  assert.equal(await (await iaV1.match('./modnet.onnx')).text(), 'existing-ia-v1');
  assert.equal(await iaV1.match('./ort.wasm.bundle.min.mjs'), undefined);
  assert.equal(await iaV1.match('./ort-wasm-simd-threaded.wasm'), undefined);
  assert.equal(await (await sibling.match('https://ferrusdantioch.github.io/omni-video/app.js')).text(), 'video');
});

test('activate sans cache v1-v3 à migrer n’ouvre pas CACHE_IA inutilement', async () => {
  const { ctx, caches } = creerSw();
  const v6 = await caches.open('omni-photo-v6');
  await v6.put('./index.html', new Response('old'));
  const iaV0 = await caches.open('omni-photo-ia-v0');
  await iaV0.put('./u2netp.onnx', new Response('old-ia'));
  caches._opened.clear();

  let waitPromise = null;
  ctx.dispatchEvent('activate', { waitUntil(p) { waitPromise = p; } });
  await waitPromise;

  assert.equal(caches._opened.has('omni-photo-ia-v1'), false);
  assert.equal((await caches.keys()).includes('omni-photo-ia-v1'), false);
});

test('install remplit le cache principal avec MockRequest et fetch route IA / app / partage / hors-scope', async () => {
  const fetched = [];
  const { ctx, caches } = creerSw({
    fetch: async (req) => {
      fetched.push(typeof req === 'string' ? req : req.url);
      return new Response('net:' + (typeof req === 'string' ? req : req.url), { status: 200 });
    }
  });

  let installPromise = null;
  ctx.dispatchEvent('install', { waitUntil(p) { installPromise = p; } });
  await installPromise;
  const c = await caches.open('omni-photo-v7');
  assert.ok(await c.match('./index.html'));
  assert.ok(await c.match('./detourage-travail.js'));

  // Requête IA -> CACHE_IA
  const iaCache = await caches.open('omni-photo-ia-v1');
  await iaCache.put('./u2netp.onnx', new Response('ia-cached', { status: 200 }));
  let respIa = null;
  ctx.dispatchEvent('fetch', {
    request: new ctx.Request('./u2netp.onnx?v=1'),
    respondWith(p) { respIa = p; },
    waitUntil() {}
  });
  assert.equal(await (await respIa).text(), 'ia-cached');

  // Requête app avec ignoreSearch
  await c.put('./styles.css', new Response('css-cached', { status: 200 }));
  let respCss = null;
  ctx.dispatchEvent('fetch', {
    request: new ctx.Request('./styles.css?cachebust=1'),
    respondWith(p) { respCss = p; },
    waitUntil() {}
  });
  assert.equal(await (await respCss).text(), 'css-cached');

  // Hors scope -> non intercepté
  let crossCalled = false;
  ctx.dispatchEvent('fetch', {
    request: new ctx.Request('https://ferrusdantioch.github.io/omni-video/index.html'),
    respondWith() { crossCalled = true; },
    waitUntil() {}
  });
  assert.equal(crossCalled, false);

  // POST ./partage -> CACHE_PARTAGE + redirection 303
  const fd = new FormData();
  fd.append('photos', new File(['abc'], 'vacances.jpg', { type: 'image/jpeg' }));
  let respPartage = null;
  ctx.dispatchEvent('fetch', {
    request: new ctx.Request('./partage', { method: 'POST', formData: fd }),
    respondWith(p) { respPartage = p; },
    waitUntil() {}
  });
  const redir = await respPartage;
  assert.equal(redir.status, 303);
  assert.equal(redir.headers.get('location'), SCOPE + 'index.html#partage');
  const partageCache = await caches.open('omni-photo-partage');
  assert.equal((await partageCache.keys()).length, 1);
});
