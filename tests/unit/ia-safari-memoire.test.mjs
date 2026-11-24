/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  creerContexte, chargerScripts, executer, lireSymbole,
  creerToile, avancerMinuteur, annulerMinuteurs
} from './_harness.mjs';

function creerWorkerMockClass(mode = 'module') {
  const instances = [];
  class MockWorker {
    constructor(url, opts) {
      this.url = url;
      this.terminated = false;
      this.posted = [];
      // Accès à opts.type pour tester le support Worker module
      this.typeRead = mode === 'module' ? (opts && opts.type) : 'classic';
      instances.push(this);
    }
    postMessage(msg, transfer) {
      this.posted.push({ msg, transfer });
      if (this.onPostMessage) this.onPostMessage(msg, transfer);
    }
    terminate() { this.terminated = true; }
  }
  return { MockWorker, instances };
}

function creerEnvIa(overrides = {}) {
  const { MockWorker, instances } = creerWorkerMockClass(overrides.workerMode || 'module');
  const ctx = creerContexte({
    Worker: overrides.noWorker ? undefined : MockWorker,
    ...overrides
  });
  ctx.Editeur = {
    outil: null,
    choisirOutil(o) { this.outil = o; },
    redessiner() {},
    toile: { parentElement: { clientWidth: 800, clientHeight: 600 } }
  };
  ctx.Sauvegarde = { programmer() {} };
  ctx.Persistance = { demander() {} };
  ctx.nomParDefaut = () => 'Montage test';

  chargerScripts(ctx, [
    'outils.js', 'polices.js', 'ressources.js', 'montage.js', 'rendu.js',
    'retouches.js', 'lumiere.js', 'effets.js', 'ia.js', 'flou.js'
  ]);
  return { ctx, workerInstances: instances };
}

test('Detourage.possible() vérifie SIMD + Module Worker, met _workerModuleOk en cache et libère la sonde', () => {
  // 1. Support complet
  const { ctx, workerInstances } = creerEnvIa();
  assert.equal(executer(ctx, `Detourage.possible()`), true);
  assert.equal(lireSymbole(ctx, `Detourage._workerModuleOk`), true);
  assert.equal(workerInstances.length, 1);
  assert.equal(workerInstances[0].terminated, true);
  // 2e appel utilise le cache (pas de nouveau Worker sonde)
  assert.equal(executer(ctx, `Detourage.possible()`), true);
  assert.equal(workerInstances.length, 1);
  avancerMinuteur(ctx, 1000);
  assert.equal(ctx._revokedUrls.length, 1);

  // 2. Classic worker seulement (opts.type non lu)
  const { ctx: cClassic } = creerEnvIa({ workerMode: 'classic' });
  assert.equal(executer(cClassic, `Detourage.possible()`), false);

  // 3. Sans Worker ou sans WebAssembly.validate
  const { ctx: cNoW } = creerEnvIa({ noWorker: true });
  assert.equal(executer(cNoW, `Detourage.possible()`), false);
  const { ctx: cNoSimd } = creerEnvIa({ WebAssembly: { validate: () => false } });
  assert.equal(executer(cNoSimd, `Detourage.possible()`), false);
  annulerMinuteurs(ctx);
  annulerMinuteurs(cClassic);
});

test('Detourage._classerErreur() et chemins d’erreur worker (onerror, type erreur, postMessage)', async () => {
  const { ctx, workerInstances } = creerEnvIa();
  assert.equal(executer(ctx, `Detourage._classerErreur('no available backend')`), 'impossible');
  assert.equal(executer(ctx, `Detourage._classerErreur('RangeError: out of memory')`), 'memoire');
  assert.equal(executer(ctx, `Detourage._classerErreur('Aborted()')`), 'memoire');
  assert.equal(executer(ctx, `Detourage._classerErreur('HTTP 404 Failed to load u2netp.onnx')`), 'fichiers');
  assert.equal(executer(ctx, `Detourage._classerErreur('modele-absent')`), 'fichiers');
  assert.equal(executer(ctx, `Detourage._classerErreur('inconnu')`), 'echec');

  // Erreur reçue via onerror sans message -> 'memoire'
  executer(ctx, `Detourage._workerModuleOk = true;`);
  const r = { image: creerToile(ctx, 32, 32, [10, 20, 30, 255]), largeur: 32, hauteur: 32 };
  ctx.__r = r;
  const pErr = executer(ctx, `Detourage.masque(__r, 'objet', () => {})`);
  // Attendre laisserAfficher() pour que postMessage soit appelé
  await new Promise((ok) => setTimeout(ok, 60));
  const w = workerInstances[workerInstances.length - 1];
  w.onerror({ message: '', preventDefault() {} });
  await assert.rejects(() => pErr, (e) => e.code === 'memoire');

  // Erreur via m.type === 'erreur'
  const pErr2 = executer(ctx, `Detourage.masque(__r, 'objet', () => {})`);
  await new Promise((ok) => setTimeout(ok, 60));
  const w2 = workerInstances[workerInstances.length - 1];
  w2.onmessage({ data: { type: 'erreur', message: 'no available backend found' } });
  await assert.rejects(() => pErr2, (e) => e.code === 'impossible');
  annulerMinuteurs(ctx);
});

test('Detourage minuteur d’inactivité 150s, réarmement dans finally sur erreur précoce et fermerTravailleur()', async () => {
  const { ctx, workerInstances } = creerEnvIa();
  assert.equal(lireSymbole(ctx, 'DELAI_INACTIVITE_IA'), 150000);

  executer(ctx, `Detourage._workerModuleOk = true; Detourage._travail();`);
  const w1 = workerInstances[workerInstances.length - 1];
  assert.ok(lireSymbole(ctx, 'Detourage._minuteurInactivite') !== null);
  avancerMinuteur(ctx, 150000);
  assert.equal(w1.terminated, true);
  assert.equal(lireSymbole(ctx, 'Detourage._travailleur'), null);

  // Réarmement garanti même si masque() échoue précocement (_verifierArret après _travail)
  ctx.__r = { image: creerToile(ctx, 20, 20, [1, 2, 3, 255]), largeur: 20, hauteur: 20 };
  executer(ctx, `
    Detourage._travail();
    Detourage._arretDemande = true;
  `);
  const w2 = workerInstances[workerInstances.length - 1];
  // Forcer _verifierArret après annulation du minuteur en simulant laisserAfficher + _arretDemande
  const pFail = executer(ctx, `(async () => {
    const orig = Detourage._entree.bind(Detourage);
    Detourage._entree = () => { Detourage._arretDemande = true; throw new ErreurIA('arret', 'stop'); };
    return Detourage.masque(__r, 'objet', () => {});
  })()`);
  await assert.rejects(() => pFail, (e) => e.code === 'arret');
  assert.ok(lireSymbole(ctx, 'Detourage._minuteurInactivite') !== null, 'Le minuteur d’inactivité doit être réarmé dans outer finally');

  // fermerTravailleur() pendant _enCours rejette avec 'arret' et termine le worker
  const { ctx: c3, workerInstances: wi3 } = creerEnvIa();
  c3.__r = { image: creerToile(c3, 20, 20, [1, 2, 3, 255]), largeur: 20, hauteur: 20 };
  executer(c3, `Detourage._workerModuleOk = true;`);
  const pActive = executer(c3, `Detourage.masque(__r, 'objet', () => {})`);
  await new Promise((ok) => setTimeout(ok, 60));
  const w3 = wi3[wi3.length - 1];
  executer(c3, `Detourage.fermerTravailleur();`);
  await assert.rejects(() => pActive, (e) => e.code === 'arret');
  assert.equal(w3.terminated, true);

  annulerMinuteurs(ctx);
  annulerMinuteurs(c3);
});

test('OutilFlou._masquePropre préserve le masque emprunté mais libère le masque IA possédé, et fonctionne sous Safari', () => {
  const { ctx } = creerEnvIa({ safariFilter: true });
  const imgOrig = creerToile(ctx, 40, 40, [100, 120, 140, 255]);
  const imgDetouree = creerToile(ctx, 40, 40, [200, 50, 50, 255]);
  ctx.__orig = imgOrig;
  ctx.__det = imgDetouree;

  executer(ctx, `
    Montage.nouveau(40, 40);
    const rDet = Ressources.depuisToile(__det);
    const rOrig = Ressources.depuisToile(__orig);
    const c = Montage.ajouterImage(rDet, 40, 40);
    c.source = rOrig;
    $('#fl-force').value = '30';
    OutilFlou.commencer(c);
  `);
  assert.equal(lireSymbole(ctx, 'OutilFlou._masquePropre'), false);
  const res = executer(ctx, `OutilFlou.composer(40, 40)`);
  assert.equal(res.width, 40);
  executer(ctx, `OutilFlou.fermer();`);
  // Le masque emprunté (imgDetouree) n'a PAS été remis à zéro
  assert.equal(imgDetouree.width, 40);

  // Masque possédé -> remis à zéro à fermer()
  const masquePropre = creerToile(ctx, 40, 40, [0, 0, 0, 255]);
  ctx.__mp = masquePropre;
  executer(ctx, `
    OutilFlou.masque = __mp;
    OutilFlou._masquePropre = true;
    OutilFlou.fermer();
  `);
  assert.equal(masquePropre.width, 0);
  annulerMinuteurs(ctx);
});

test('outils.js repli flou Safari (supporteFiltreToile, flouBoite, dessinerAvecFlou, flouterToileEnPlace)', () => {
  const { ctx } = creerEnvIa({ safariFilter: true });
  assert.equal(executer(ctx, `supporteFiltreToile(document.createElement('canvas').getContext('2d'))`), false);

  const src = creerToile(ctx, 20, 20, [255, 0, 0, 255]);
  // Demi-moitié transparente (alpha = 0) pour tester la non-contamination des pixels transparents
  for (let y = 0; y < 20; y++) for (let x = 10; x < 20; x++) {
    const i = (y * 20 + x) * 4;
    src._pixels[i] = 0; src._pixels[i + 1] = 255; src._pixels[i + 2] = 0; src._pixels[i + 3] = 0;
  }
  const dst = creerToile(ctx, 20, 20);
  ctx.__src = src;
  ctx.__dst = dst;

  // rayon 0 / NaN -> copie directe sans erreur
  executer(ctx, `
    dessinerAvecFlou(__dst.getContext('2d'), __src, 0, 0, 20, 20, 0);
    dessinerAvecFlou(__dst.getContext('2d'), __src, 0, 0, 20, 20, NaN);
  `);
  assert.equal(dst._pixels[0], 255);

  // rayon > 0 sous Safari -> libère la toile temporaire
  ctx._zeroedCanvases.length = 0;
  executer(ctx, `dessinerAvecFlou(__dst.getContext('2d'), __src, 0, 0, 20, 20, 4);`);
  assert.ok(ctx._zeroedCanvases.length >= 1);

  // flouterToileEnPlace restaure globalCompositeOperation et libère la toile temporaire
  ctx._zeroedCanvases.length = 0;
  executer(ctx, `
    const c = __dst.getContext('2d');
    c.globalCompositeOperation = 'source-over';
    flouterToileEnPlace(__dst, c, 3);
  `);
  assert.equal(dst.getContext('2d').globalCompositeOperation, 'source-over');
  assert.ok(ctx._zeroedCanvases.length >= 1);
  annulerMinuteurs(ctx);
});

test('Lumiere.dessinerAvecFiltre() pipeline pixels Safari, cache WeakMap et libération mémoire', () => {
  const { ctx } = creerEnvIa({ safariFilter: true });
  const src = creerToile(ctx, 10, 10, [100, 150, 200, 255]);
  // Pixel transparent à préserver
  src._pixels[3] = 0;
  const dst = creerToile(ctx, 10, 10);
  ctx.__src = src;
  ctx.__dst = dst;

  // Sans garder -> libère immédiatement dans finally
  ctx._zeroedCanvases.length = 0;
  executer(ctx, `
    Lumiere.dessinerAvecFiltre(__dst.getContext('2d'), __src, 0, 0, 10, 10, { lumiere: 20, contraste: 10, saturation: -50, chaleur: 30, filtre: 'sepia' }, false);
  `);
  assert.ok(ctx._zeroedCanvases.length >= 1);
  // Pixel (0,0) avait alpha 0 -> reste transparent
  assert.equal(dst._pixels[3], 0);
  // Pixel (1,0) a été filtré
  assert.notEqual(dst._pixels[4], 100);

  // Avec garder=true -> mis en cache, puis ancien cache libéré au changement de clé
  ctx._zeroedCanvases.length = 0;
  executer(ctx, `
    Lumiere.dessinerAvecFiltre(__dst.getContext('2d'), __src, 0, 0, 10, 10, { filtre: 'nb' }, true);
  `);
  const entree1 = executer(ctx, `Lumiere._cachePixels.get(__src).toile`);
  executer(ctx, `
    Lumiere.dessinerAvecFiltre(__dst.getContext('2d'), __src, 0, 0, 10, 10, { filtre: 'vintage' }, true);
  `);
  assert.equal(entree1.width, 0);
  annulerMinuteurs(ctx);
});

test('Effets._contour() / dessinerImage(), OutilDecoupe.fabriquer() et OutilYeux libèrent leurs toiles temporaires', () => {
  const { ctx } = creerEnvIa({ safariFilter: true });
  const img = creerToile(ctx, 16, 16, [200, 100, 50, 255]);
  const cible = creerToile(ctx, 32, 32);
  ctx.__img = img;
  ctx.__cible = cible;

  // Effets : éviction parImage (> 3) et libération ecran=false
  ctx._zeroedCanvases.length = 0;
  executer(ctx, `
    for (const col of ['#111111', '#222222', '#333333', '#444444', '#555555']) {
      Effets.dessinerImage(__cible.getContext('2d'), { largeur: 16, hauteur: 16, effet: { contour: { actif: true, couleur: col, epaisseur: 0.1 } } }, __img, 'none', true);
    }
    Effets.dessinerImage(__cible.getContext('2d'), { largeur: 16, hauteur: 16, effet: { contour: { actif: true, couleur: '#abcdef', epaisseur: 0.1 } } }, __img, 'none', false);
  `);
  assert.ok(ctx._zeroedCanvases.length >= 5);

  // OutilDecoupe.fabriquer() Safari + libération masque dans finally même sur erreur
  ctx._zeroedCanvases.length = 0;
  executer(ctx, `
    const dg = document.createElement('input');
    dg.type = 'radio'; dg.name = 'd-garder'; dg.value = 'interieur'; dg.checked = true;
    document._register(dg);
    Montage.nouveau(16, 16);
    const rid = Ressources.depuisToile(__img);
    const c = Montage.ajouterImage(rid, 16, 16);
    $('#d-adoucir').value = '3';
    OutilDecoupe.commencer(c);
    OutilDecoupe.points = [{ x: 2, y: 2 }, { x: 14, y: 2 }, { x: 14, y: 14 }];
    const out = OutilDecoupe.fabriquer();
    out.width = 0;
  `);
  assert.ok(ctx._zeroedCanvases.length >= 2);

  // OutilYeux libère travail dans retirerDernier() et fermer()
  executer(ctx, `(() => {
    const c = Montage.doc.calques[0];
    OutilYeux.commencer(c);
    OutilYeux.travail = Retouche.copier(c);
    const tRef = OutilYeux.travail;
    OutilYeux.fermer();
    if (tRef.width !== 0) throw new Error('travail non libéré');
  })()`);
  annulerMinuteurs(ctx);
});
