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

test('OutilRecadrage.redresser borne k au plafond echelle <= 40 avant de calculer (x, y) pour garder le pivot dans l’image', () => {
  // 1. Cas extrême (echelle=2, bord à 10 px du centre) : k borné à 20 -> centre du montage conservé dans le calque
  const ctx = creerEnvRecadrage();
  executer(ctx, `
    Montage.nouveau(400, 300);
    const c = Montage.ajouterImage('r1', 1200, 900);
    Montage.modifier(c.id, { echelle: 2, x: 1390, y: 150, rotation: 0 });
    OutilRecadrage.ouvrir();
    OutilRecadrage.redresser(10);
  `);

  const c10 = lireSymbole(ctx, 'Montage.doc.calques[0]');
  assert.equal(c10.echelle, 40);
  const rad = (10 * Math.PI) / 180;
  const attenduX = 200 + 20 * 1190 * Math.cos(rad);
  const attenduY = 150 + 20 * 1190 * Math.sin(rad);
  assert.ok(Math.abs(c10.x - attenduX) < 1e-6, `x attendu=${attenduX}, obtenu=${c10.x}`);
  assert.ok(Math.abs(c10.y - attenduY) < 1e-6, `y attendu=${attenduY}, obtenu=${c10.y}`);

  // Le centre du montage (200, 150) reste bien à l'intérieur du calque (200 px de marge)
  const dx = 200 - c10.x, dy = 150 - c10.y;
  const lx = dx * Math.cos(rad) + dy * Math.sin(rad);
  const ly = -dx * Math.sin(rad) + dy * Math.cos(rad);
  assert.ok(Math.abs(lx) <= (c10.largeur * c10.echelle) / 2 - 190);
  assert.ok(Math.abs(ly) <= (c10.hauteur * c10.echelle) / 2);

  // 2. Cas valide à 0° proche du plafond (echelle=38, marge 201 px) : redresser(10) dépasse 40x -> borné cohérent, retour à 0° exact
  const ctx2 = creerEnvRecadrage();
  executer(ctx2, `
    Montage.nouveau(400, 300);
    const c = Montage.ajouterImage('r1', 1200, 900);
    // halfW = 600 * 38 = 22800 ; ox = 22599 => bord gauche à -1 px du document à 0°
    Montage.modifier(c.id, { echelle: 38, x: 22799, y: 150, rotation: 0 });
    OutilRecadrage.ouvrir();
    OutilRecadrage.redresser(10);
  `);
  const c38 = lireSymbole(ctx2, 'Montage.doc.calques[0]');
  assert.equal(c38.echelle, 40);
  const kClamp = 40 / 38;
  assert.ok(Math.abs(c38.x - (200 + kClamp * 22599 * Math.cos(rad))) < 1e-5);
  assert.ok(Math.abs(c38.y - (150 + kClamp * 22599 * Math.sin(rad))) < 1e-5);

  executer(ctx2, `OutilRecadrage.redresser(0);`);
  const c0 = lireSymbole(ctx2, 'Montage.doc.calques[0]');
  assert.equal(c0.echelle, 38);
  assert.ok(Math.abs(c0.x - 22799) < 1e-6);
  assert.ok(Math.abs(c0.y - 150) < 1e-6);
  assert.equal(c0.rotation, 0);
});
