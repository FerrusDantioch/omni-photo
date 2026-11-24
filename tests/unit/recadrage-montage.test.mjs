/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { creerContexte, chargerScripts, executer, lireSymbole, creerEl } from './_harness.mjs';

function creerEnvRecadrage() {
  const ctx = creerContexte();
  ctx.Editeur = {
    outil: null,
    vue: { e: 1 },
    choisirOutil(o) { this.outil = o; },
    ajusterVue() {},
    redessiner() {},
    montageVersEcran: (x, y) => ({ x, y }),
    ecranVersMontage: (x, y) => ({ x, y })
  };
  ctx.Sauvegarde = { programmer() {} };
  ctx.nomParDefaut = () => 'Montage test';
  ctx.document._register(creerEl('input', ctx, { type: 'radio', name: 'rc-format', value: 'libre', checked: true }));
  ctx.document._register(creerEl('input', ctx, { id: 'rc-redresser', type: 'range', value: '0' }));
  chargerScripts(ctx, ['outils.js', 'polices.js', 'ressources.js', 'montage.js', 'rendu.js', 'recadrage.js']);
  return ctx;
}

function coinsDansCouche(c, docL, docH) {
  const rad = (c.rotation * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const hw = (c.largeur * c.echelle) / 2, hh = (c.hauteur * c.echelle) / 2;
  for (const [cx, cy] of [[0, 0], [docL, 0], [docL, docH], [0, docH]]) {
    const dx = cx - c.x, dy = cy - c.y;
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;
    if (Math.abs(lx) > hw + 0.5 || Math.abs(ly) > hh + 0.5) return false;
  }
  return true;
}

test('Montage._bornerPosition préserve un recadrage excentré valide et borne les débordements extrêmes (y compris pivotés)', () => {
  const ctx = creerEnvRecadrage();
  executer(ctx, `
    Montage.nouveau(400, 300);
    const c = Montage.ajouterImage('r1', 1200, 900);
    Montage.modifier(c.id, { echelle: 1, x: 700, y: 400 });
  `);
  const c1 = lireSymbole(ctx, 'Montage.doc.calques[0]');
  assert.equal(c1.x, 700);
  assert.equal(c1.y, 400);

  // Trop loin hors cadre -> ramené en gardant 20 px de recouvrement
  executer(ctx, `
    Montage.modifier(Montage.doc.calques[0].id, { rotation: 45, x: 5000, y: -5000 });
  `);
  const c2 = lireSymbole(ctx, 'Montage.doc.calques[0]');
  assert.ok(c2.x < 5000 && c2.x > 400);
  assert.ok(c2.y > -5000 && c2.y < 0);

  // dupliquer() appelle aussi _bornerPosition
  executer(ctx, `
    Montage.doc.calques[0].x = 5000;
    Montage.dupliquer(Montage.doc.calques[0].id);
  `);
  const dup = lireSymbole(ctx, 'Montage.doc.calques[1]');
  assert.ok(dup.x < 5000);
});

test('OutilRecadrage.redresser (couvrant le centre) garde les 4 coins couverts à 0° et 90° sans dérive au retour à 0', () => {
  const ctx = creerEnvRecadrage();
  executer(ctx, `
    Montage.nouveau(400, 300);
    const c = Montage.ajouterImage('r1', 1200, 900);
    Montage.modifier(c.id, { echelle: 1, x: 450, y: 280, rotation: 0 });
    OutilRecadrage.ouvrir();
  `);

  for (const angle of [-12, 8, 15, -5, 0]) {
    executer(ctx, `OutilRecadrage.redresser(${angle});`);
    const c = lireSymbole(ctx, 'Montage.doc.calques[0]');
    assert.ok(coinsDansCouche(c, 400, 300), `Coin découvert à angle=${angle}° : ${JSON.stringify(c)}`);
    if (angle === 0) {
      assert.equal(c.echelle, 1);
      assert.ok(Math.abs(c.x - 450) < 1e-6 && Math.abs(c.y - 280) < 1e-6);
    }
  }

  // Rotation 90° (quart de tour) puis redressement
  executer(ctx, `
    OutilRecadrage.tourner(1);
    OutilRecadrage.redresser(10);
  `);
  const c90 = lireSymbole(ctx, 'Montage.doc.calques[0]');
  const doc90 = lireSymbole(ctx, 'Montage.doc');
  assert.equal(lireSymbole(ctx, 'OutilRecadrage._quart'), 90);
  assert.ok(coinsDansCouche(c90, doc90.largeur, doc90.hauteur), 'Coins couverts après quart de tour + redressement');
});

test('OutilRecadrage.redresser (ne couvrant pas le centre) garde k=1 et position en place même après tourner(1)', () => {
  const ctx = creerEnvRecadrage();
  executer(ctx, `
    Montage.nouveau(400, 400);
    const c = Montage.ajouterImage('r1', 100, 100);
    Montage.modifier(c.id, { echelle: 1, x: 350, y: 200, rotation: 0 });
    OutilRecadrage.ouvrir();
    OutilRecadrage.redresser(10);
  `);
  let c = lireSymbole(ctx, 'Montage.doc.calques[0]');
  assert.equal(c.echelle, 1);
  assert.equal(c.x, 350);
  assert.equal(c.y, 200);
  assert.equal(c.rotation, 10);

  executer(ctx, `
    OutilRecadrage.tourner(1);
    OutilRecadrage.redresser(12);
  `);
  c = lireSymbole(ctx, 'Montage.doc.calques[0]');
  assert.equal(c.echelle, 1);
  assert.equal(c.x, 200);
  assert.equal(c.y, 350);
  assert.equal(c.rotation, 102);

  // fermer() commit Historique.fin()
  assert.ok(lireSymbole(ctx, 'Historique._avant') !== null);
  executer(ctx, `OutilRecadrage.fermer();`);
  assert.equal(lireSymbole(ctx, 'Historique._avant'), null);
  assert.ok(lireSymbole(ctx, 'Historique.passe.length') >= 1);
});
