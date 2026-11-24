/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { creerContexte, chargerScripts, executer, lireSymbole, creerToile } from './_harness.mjs';

function creerEnvCorrecteur(avecSource = false) {
  const ctx = creerContexte();
  ctx.Editeur = {
    outil: null,
    ecranVersCalque: (_c, x, y) => ({ x, y }),
    calqueVersEcran: (_c, x, y) => ({ x, y }),
    zoomCalque: () => 1,
    choisirOutil(o) { this.outil = o; },
    redessiner() {},
    toile: { parentElement: { clientWidth: 800, clientHeight: 600 } }
  };
  ctx.Rendu = { replacements: new Map(), remplace: null, remplacements: new Map(), fantomes: new Map() };
  ctx.nomParDefaut = () => 'Montage test';
  chargerScripts(ctx, ['outils.js', 'ressources.js', 'montage.js', 'retouches.js', 'correcteur.js']);

  // Fond bleu uni avec une tache rouge au centre (80x80)
  const t = creerToile(ctx, 80, 80, [40, 120, 200, 255]);
  for (let y = 34; y < 46; y++) {
    for (let x = 34; x < 46; x++) {
      const i = (y * 80 + x) * 4;
      t._pixels[i] = 240; t._pixels[i + 1] = 20; t._pixels[i + 2] = 20; t._pixels[i + 3] = 255;
    }
  }
  ctx.__toile = t;
  ctx.__avecSource = avecSource;

  executer(ctx, `
    Montage.nouveau(80, 80);
    const rid = Ressources.depuisToile(__toile);
    const c = Montage.ajouterImage(rid, 80, 80);
    if (__avecSource) {
      const s = document.createElement('canvas'); s.width = 80; s.height = 80;
      s.getContext('2d').drawImage(__toile, 0, 0);
      c.source = Ressources.depuisToile(s);
    }
    $('#cr-taille').value = '8';
    OutilCorrecteur.commencer(c);
  `);

  return ctx;
}

test('OutilCorrecteur._appliquerEffacer (BFS O(l*h)) remplit la zone depuis les voisins sans modifier hors _boiteTrait', () => {
  const ctx = creerEnvCorrecteur(false);
  executer(ctx, `
    OutilCorrecteur.appui({ x: 38, y: 40 });
    OutilCorrecteur.mouvement({ x: 42, y: 40 });
    OutilCorrecteur.relache();
  `);
  assert.equal(lireSymbole(ctx, 'OutilCorrecteur.operations.length'), 1);

  const pxCentre = executer(ctx, `[...OutilCorrecteur.travail.getContext('2d').getImageData(40, 40, 1, 1).data]`);
  // La tache rouge (240, 20, 20) doit avoir été remplacée vers le fond bleu (40, 120, 200)
  assert.ok(pxCentre[2] > pxCentre[0], `Attendu bleu > rouge après inpainting, obtenu ${JSON.stringify(pxCentre)}`);

  // Hors de la boîte du trait : inchangé (40, 120, 200, 255)
  const pxCoin = Array.from(executer(ctx, `[...OutilCorrecteur.travail.getContext('2d').getImageData(2, 2, 1, 1).data]`));
  assert.deepEqual(pxCoin, [40, 120, 200, 255]);
});

test('OutilCorrecteur._appliquerEffacer passe à l’échelle en O(l*h) sur un masque 200x200', () => {
  const ctx = creerContexte();
  ctx.Editeur = { ecranVersCalque: (_c, x, y) => ({ x, y }), zoomCalque: () => 1, choisirOutil() {}, redessiner() {} };
  ctx.Rendu = { remplacements: new Map(), fantomes: new Map() };
  chargerScripts(ctx, ['outils.js', 'ressources.js', 'montage.js', 'retouches.js', 'correcteur.js']);
  ctx.__big = creerToile(ctx, 200, 200, [80, 140, 210, 255]);

  const debut = performance.now();
  executer(ctx, `
    OutilCorrecteur._appliquerEffacer(__big, { mode: 'effacer', rayon: 20, points: [{ x: 60, y: 100 }, { x: 140, y: 100 }] });
  `);
  const duree = performance.now() - debut;
  assert.ok(duree < 2000, `BFS 200x200 trop lent : ${duree.toFixed(1)} ms`);
});

test('relache() ne pousse pas le trait et libère travail/travailSource si le 1er trait échoue', () => {
  const ctx = creerEnvCorrecteur(true);
  executer(ctx, `
    OutilCorrecteur._appliquerEffacer = () => { throw new Error('OOM'); };
    OutilCorrecteur.appui({ x: 40, y: 40 });
    OutilCorrecteur.relache();
  `);
  assert.equal(lireSymbole(ctx, 'OutilCorrecteur.operations.length'), 0);
  assert.equal(lireSymbole(ctx, 'OutilCorrecteur.travail'), null);
  assert.equal(lireSymbole(ctx, 'OutilCorrecteur.travailSource'), null);
  assert.equal(lireSymbole(ctx, `$('#message').dataset.type`), 'erreur');
});

test('relache() restaure la boîte du 2e trait au pixel près en cas d’OOM partiel sur travailSource', () => {
  const ctx = creerEnvCorrecteur(true);
  executer(ctx, `
    OutilCorrecteur.appui({ x: 20, y: 20 });
    OutilCorrecteur.relache();
  `);
  assert.equal(lireSymbole(ctx, 'OutilCorrecteur.operations.length'), 1);
  const avantTrait2 = executer(ctx, `[...OutilCorrecteur.travail.getContext('2d').getImageData(0, 0, 80, 80).data]`);

  // Le 2e trait réussit sur travail, puis lève une OOM sur travailSource
  executer(ctx, `
    const orig = OutilCorrecteur._appliquerEffacer.bind(OutilCorrecteur);
    OutilCorrecteur._appliquerEffacer = function (toile, t) {
      if (toile === this.travailSource) throw new Error('OOM source');
      return orig(toile, t);
    };
    OutilCorrecteur.appui({ x: 40, y: 40 });
    OutilCorrecteur.relache();
  `);

  assert.equal(lireSymbole(ctx, 'OutilCorrecteur.operations.length'), 1);
  assert.ok(lireSymbole(ctx, 'OutilCorrecteur.travail') !== null);
  const apresRollback = executer(ctx, `[...OutilCorrecteur.travail.getContext('2d').getImageData(0, 0, 80, 80).data]`);
  assert.deepEqual(apresRollback, avantTrait2);
});

test('retirerDernier() rejoue les traits restants et attrape une OOM dans try/catch', () => {
  const ctx = creerEnvCorrecteur(false);
  executer(ctx, `
    OutilCorrecteur.appui({ x: 20, y: 20 });
    OutilCorrecteur.relache();
    OutilCorrecteur.appui({ x: 40, y: 40 });
    OutilCorrecteur.relache();
  `);
  assert.equal(lireSymbole(ctx, 'OutilCorrecteur.operations.length'), 2);
  assert.equal(executer(ctx, `OutilCorrecteur.retirerDernier()`), true);
  assert.equal(lireSymbole(ctx, 'OutilCorrecteur.operations.length'), 1);

  // Ajouter un 2e trait puis simuler OOM lors du replay de retirerDernier()
  executer(ctx, `
    OutilCorrecteur.appui({ x: 40, y: 40 });
    OutilCorrecteur.relache();
    OutilCorrecteur._appliquerEffacer = () => { throw new Error('OOM replay'); };
  `);
  assert.equal(executer(ctx, `OutilCorrecteur.retirerDernier()`), true);
  assert.equal(lireSymbole(ctx, 'OutilCorrecteur.operations.length'), 0);
  assert.equal(lireSymbole(ctx, 'OutilCorrecteur.travail'), null);
  assert.equal(lireSymbole(ctx, `$('#message').dataset.type`), 'erreur');
});

test('valider() sans opérations ou sans travail ferme proprement sans appeler Retouche.valider', () => {
  const ctx = creerEnvCorrecteur(false);
  let valide = 0;
  ctx.__onValider = () => { valide++; };
  executer(ctx, `Retouche.valider = __onValider;`);
  executer(ctx, `OutilCorrecteur.valider();`);
  assert.equal(valide, 0);
  assert.equal(lireSymbole(ctx, 'OutilCorrecteur.travail'), null);
});
