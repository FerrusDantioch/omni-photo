/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { creerContexte, chargerScripts, executer, lireSymbole, creerToile } from './_harness.mjs';

function creerEnvSauvegarde(overrides = {}) {
  const images = new Map();
  const montages = new Map();
  const calls = { effacer: [], ecrire: [], liberer: 0 };

  const ctx = creerContexte({
    VERSION: '1.3.1',
    createImageBitmap: async (blob) => ({ width: 20, height: 15, _blob: blob }),
    ...overrides
  });

  // Stubs de dépendances avant chargement
  ctx.Rendu = { dessinerMontage() {} };
  ctx.Accueil = { _libererRessourcesOutils() { calls.liberer++; } };

  chargerScripts(ctx, ['outils.js', 'ressources.js', 'montage.js', 'sauvegarde.js']);

  // Stub de Base (IndexedDB simulée)
  executer(ctx, `
    Base.lire = async (t, k) => (t === 'images' ? __db.images.get(k) : __db.montages.get(k));
    Base.ecrire = async (t, k, v) => {
      __db.calls.ecrire.push([t, k]);
      if (__db.failWrite && __db.failWrite(t, k, v)) throw new Error('QuotaExceededError');
      (t === 'images' ? __db.images : __db.montages).set(k, v);
    };
    Base.effacer = async (t, k) => {
      __db.calls.effacer.push([t, k]);
      (t === 'images' ? __db.images : __db.montages).delete(k);
    };
    Base.cles = async (t) => [...(t === 'images' ? __db.images : __db.montages).keys()];
    Base.tout = async (t) => [...(t === 'images' ? __db.images : __db.montages).values()];
    Sauvegarde._miniature = async () => new Blob(['mini'], { type: 'image/jpeg' });
  `);
  ctx.__db = { images, montages, calls, failWrite: null };

  return { ctx, images, montages, calls };
}

function construireOmniphoto(entete, jsonObj, blobs = []) {
  const txt = new TextEncoder().encode(JSON.stringify(jsonObj));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, txt.length, true);
  return new Blob([entete, len, txt, ...blobs], { type: 'application/octet-stream' });
}

test('Export/import .omniphoto : remappage strict des IDs, normalisation image/jpg, paramètres MIME, maxCote et OMNIPHOTO-TOUT-1', async () => {
  const { ctx: c2, images: im2, montages: mo2 } = creerEnvSauvegarde();
  c2.__t1 = creerToile(c2, 20, 15, [10, 20, 30, 255]);
  c2.__t2 = creerToile(c2, 20, 15, [40, 50, 60, 255]);
  const [rid1, rid2, mid] = await executer(c2, `(async () => {
    Montage.nouveau(200, 150);
    Montage.nom = 'Vacances';
    const r1 = Ressources.depuisToile(__t1, 99999);
    const r2 = Ressources.depuisToile(__t2, 4096);
    const c = Montage.ajouterImage(r1, 20, 15);
    c.source = r2;
    await Sauvegarde.maintenant();
    return [r1, r2, Montage.id];
  })()`);

  assert.equal(im2.get(rid1).blob.type, 'image/webp');
  const blobUnique = await executer(c2, `Sauvegarde.versFichier(${JSON.stringify(mid)})`);

  c2.__blobUnique = blobUnique;
  const importedIds = await executer(c2, `Sauvegarde.depuisFichier(__blobUnique)`);
  assert.equal(importedIds.length, 1);
  assert.notEqual(importedIds[0], mid);
  const mImp = mo2.get(importedIds[0]);
  const docImp = JSON.parse(mImp.doc);
  assert.notEqual(docImp.calques[0].ressource, rid1);
  assert.notEqual(docImp.calques[0].source, rid2);
  assert.ok(im2.has(docImp.calques[0].ressource));
  assert.ok(im2.has(docImp.calques[0].source));

  // Maintenant 2 montages existent en base -> versFichierTout() en exporte 2
  const blobTout = await executer(c2, `Sauvegarde.versFichierTout()`);
  c2.__blobTout = blobTout;
  const importedAll = await executer(c2, `Sauvegarde.depuisFichier(__blobTout)`);
  assert.equal(importedAll.length, 2);

  // Normalisation MIME image/jpg; charset=binary et bornage maxCote > LIMITES.photo
  const raw = new Uint8Array([1, 2, 3, 4, 5]);
  const fNorm = construireOmniphoto('OMNIPHOTO-MONTAGE-1\n', {
    nom: '  Test   MIME  ',
    doc: {
      largeur: 100, hauteur: 80,
      calques: [{ id: 'c1', type: 'image', x: 50, y: 40, echelle: 1, rotation: 0, opacite: 1, ressource: 'f1', largeur: 10, hauteur: 10 }]
    },
    fichiers: [{ id: 'f1', taille: raw.length, type: 'image/jpg; charset=utf-8', maxCote: 999999 }]
  }, [raw]);
  c2.__fNorm = fNorm;
  const idsNorm = await executer(c2, `Sauvegarde.depuisFichier(__fNorm)`);
  const mNorm = mo2.get(idsNorm[0]);
  const rNormId = JSON.parse(mNorm.doc).calques[0].ressource;
  assert.equal(im2.get(rNormId).blob.type, 'image/jpeg');
  assert.equal(im2.get(rNormId).maxCote, 4096);
});

test('Rejet des fichiers .omniphoto malformés, hors bornes, MIME interdits, et absence de repli || c.ressource / || c.source', async () => {
  const { ctx, images, montages } = creerEnvSauvegarde();
  // Pré-peuple une ressource existante dans Base pour prouver qu'aucun détournement n'est possible
  images.set('r_existant', { blob: new Blob(['secret'], { type: 'image/png' }), maxCote: 4096 });

  const imgBytes = new Uint8Array([1, 2, 3]);
  const docValide = {
    largeur: 100, hauteur: 100,
    calques: [{ id: 'c1', type: 'image', x: 50, y: 50, echelle: 1, rotation: 0, opacite: 1, ressource: 'f1', largeur: 10, hauteur: 10 }]
  };

  const casInvalides = [
    new Blob(['MAUVAIS-ENTETE\n0000'], { type: 'application/octet-stream' }),
    construireOmniphoto('OMNIPHOTO-MONTAGE-1\n', { nom: 'x', doc: docValide, fichiers: [{ id: 'f1', taille: 999, type: 'image/png' }] }, [imgBytes]),
    new Blob(['OMNIPHOTO-MONTAGE-1\n', new Uint8Array([0, 0, 0, 1]), '{'], { type: 'application/octet-stream' }),
    construireOmniphoto('OMNIPHOTO-TOUT-1\n', { montages: [], fichiers: [] }),
    construireOmniphoto('OMNIPHOTO-MONTAGE-1\n', { doc: docValide, fichiers: [{ id: '', taille: 3, type: 'image/png' }] }, [imgBytes]),
    construireOmniphoto('OMNIPHOTO-MONTAGE-1\n', {
      doc: docValide,
      fichiers: [{ id: 'f1', taille: 3, type: 'image/png' }, { id: 'f1', taille: 3, type: 'image/png' }]
    }, [imgBytes, imgBytes]),
    construireOmniphoto('OMNIPHOTO-MONTAGE-1\n', { doc: docValide, fichiers: [{ id: 'f1', taille: 0, type: 'image/png' }] }),
    construireOmniphoto('OMNIPHOTO-MONTAGE-1\n', { doc: docValide, fichiers: [{ id: 'f1', taille: 300 * 1024 * 1024, type: 'image/png' }] }, [imgBytes]),
    construireOmniphoto('OMNIPHOTO-MONTAGE-1\n', { doc: docValide, fichiers: [{ id: 'f1', taille: 3, type: 'image/svg+xml' }] }, [imgBytes]),
    construireOmniphoto('OMNIPHOTO-MONTAGE-1\n', { doc: docValide, fichiers: [{ id: 'f1', taille: 3, type: 'text/html' }] }, [imgBytes]),
    construireOmniphoto('OMNIPHOTO-MONTAGE-1\n', { doc: { largeur: 0, hauteur: 100, calques: [] }, fichiers: [] }),
    construireOmniphoto('OMNIPHOTO-MONTAGE-1\n', { doc: { largeur: 16385, hauteur: 100, calques: [] }, fichiers: [] }),
    construireOmniphoto('OMNIPHOTO-MONTAGE-1\n', { doc: { largeur: 100, hauteur: 16385, calques: [] }, fichiers: [] }),
    construireOmniphoto('OMNIPHOTO-MONTAGE-1\n', { doc: { largeur: 100.5, hauteur: 100, calques: [] }, fichiers: [] }),
    construireOmniphoto('OMNIPHOTO-MONTAGE-1\n', {
      doc: { largeur: 100, hauteur: 100, calques: [{ type: 'image', x: 0, y: 0, echelle: 0, rotation: 0, opacite: 1, ressource: 'f1', largeur: 10, hauteur: 10 }] },
      fichiers: [{ id: 'f1', taille: 3, type: 'image/png' }]
    }, [imgBytes]),
    // Détournement de ressource existante ou 'constructor' (correspondance stricte Map.has)
    construireOmniphoto('OMNIPHOTO-MONTAGE-1\n', {
      doc: { largeur: 100, hauteur: 100, calques: [{ type: 'image', x: 0, y: 0, echelle: 1, rotation: 0, opacite: 1, ressource: 'r_existant', largeur: 10, hauteur: 10 }] },
      fichiers: [{ id: 'f1', taille: 3, type: 'image/png' }]
    }, [imgBytes]),
    construireOmniphoto('OMNIPHOTO-MONTAGE-1\n', {
      doc: { largeur: 100, hauteur: 100, calques: [{ type: 'image', x: 0, y: 0, echelle: 1, rotation: 0, opacite: 1, ressource: 'f1', source: 'r_existant', largeur: 10, hauteur: 10 }] },
      fichiers: [{ id: 'f1', taille: 3, type: 'image/png' }]
    }, [imgBytes]),
    construireOmniphoto('OMNIPHOTO-MONTAGE-1\n', {
      doc: { largeur: 100, hauteur: 100, calques: [{ type: 'image', x: 0, y: 0, echelle: 1, rotation: 0, opacite: 1, ressource: 'constructor', largeur: 10, hauteur: 10 }] },
      fichiers: [{ id: 'f1', taille: 3, type: 'image/png' }]
    }, [imgBytes])
  ];

  for (let i = 0; i < casInvalides.length; i++) {
    ctx.__bad = casInvalides[i];
    await assert.rejects(() => executer(ctx, `Sauvegarde.depuisFichier(__bad)`), `Cas invalide #${i} aurait dû être rejeté`);
  }
  assert.equal(montages.size, 0);
  assert.equal(images.size, 1);
});

test('Rollback complet IndexedDB et _rangees en cas d’échec pendant l’import .omniphoto', async () => {
  const { ctx, images, montages } = creerEnvSauvegarde();
  const b1 = new Uint8Array([1, 2, 3]), b2 = new Uint8Array([4, 5, 6]);
  const f = construireOmniphoto('OMNIPHOTO-MONTAGE-1\n', {
    nom: 'Rollback',
    doc: {
      largeur: 100, hauteur: 100,
      calques: [
        { id: 'c1', type: 'image', x: 50, y: 50, echelle: 1, rotation: 0, opacite: 1, ressource: 'f1', source: 'f2', largeur: 10, hauteur: 10 }
      ]
    },
    fichiers: [
      { id: 'f1', taille: 3, type: 'image/png' },
      { id: 'f2', taille: 3, type: 'image/png' }
    ]
  }, [b1, b2]);

  // Échec lors de l'écriture du montage après écriture des 2 images
  ctx.__db.failWrite = (t) => t === 'montages';
  ctx.__f = f;
  await assert.rejects(() => executer(ctx, `Sauvegarde.depuisFichier(__f)`), /QuotaExceededError/);
  assert.equal(images.size, 0);
  assert.equal(montages.size, 0);
  assert.equal(lireSymbole(ctx, `Sauvegarde._rangees.size`), 0);
});

test('Sauvegarde._versFichier encode en WebP, se replie sur PNG, lève memoire si les deux échouent, et libère la toile', async () => {
  const { ctx } = creerEnvSauvegarde();
  ctx.__src = creerToile(ctx, 16, 12, [100, 150, 200, 255]);

  // 1. WebP supporté
  const bWebp = await executer(ctx, `Sauvegarde._versFichier(__src)`);
  assert.equal(bWebp.type, 'image/webp');
  assert.ok(ctx._zeroedCanvases.length >= 1);

  // 2. Safari renvoie image/png au lieu de image/webp -> repli PNG
  ctx._zeroedCanvases.length = 0;
  ctx._onToBlob = (_c, cb, type) => {
    if (type === 'image/webp') cb(new Blob(['fake'], { type: 'image/png' }));
    else cb(new Blob(['png'], { type: 'image/png' }));
  };
  const bPng = await executer(ctx, `Sauvegarde._versFichier(__src)`);
  assert.equal(bPng.type, 'image/png');
  assert.ok(ctx._zeroedCanvases.length >= 1);

  // 3. Les deux échouent (null) -> Error('memoire') et toile libérée dans finally
  ctx._zeroedCanvases.length = 0;
  ctx._onToBlob = (_c, cb) => cb(null);
  await assert.rejects(() => executer(ctx, `Sauvegarde._versFichier(__src)`), /memoire/);
  assert.ok(ctx._zeroedCanvases.length >= 1);
});

test('Sauvegarde.supprimer(activeId) vide Montage.selection, Ressources, Historique et appelle Accueil._libererRessourcesOutils()', async () => {
  const { ctx, calls, montages } = creerEnvSauvegarde();
  ctx.__t = creerToile(ctx, 10, 10, [255, 0, 0, 255]);
  const mid = await executer(ctx, `(async () => {
    Montage.nouveau(100, 100);
    const r = Ressources.depuisToile(__t);
    Montage.ajouterImage(r, 10, 10);
    await Sauvegarde.maintenant();
    return Montage.id;
  })()`);
  assert.ok(montages.has(mid));
  await executer(ctx, `Sauvegarde.supprimer(${JSON.stringify(mid)})`);
  assert.equal(lireSymbole(ctx, 'Montage.doc'), null);
  assert.equal(lireSymbole(ctx, 'Montage.id'), null);
  assert.equal(lireSymbole(ctx, 'Montage.selection'), null);
  assert.equal(lireSymbole(ctx, 'Historique.passe.length'), 0);
  assert.equal(calls.liberer, 1);
  assert.equal(montages.has(mid), false);
});
