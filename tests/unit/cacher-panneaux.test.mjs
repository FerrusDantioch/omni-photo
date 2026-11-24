/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { creerContexte, chargerScripts, executer, lireSymbole, creerEl, creerToile, annulerMinuteurs } from './_harness.mjs';

function creerEnvCacherPanneaux(opts = {}) {
  const ctx = creerContexte(opts);
  ctx.Editeur = {
    outil: null,
    choisirOutil(o) { this.outil = o; },
    redessiner() {},
    ecranVersCalque: (_c, x, y) => ({ x, y }),
    calqueVersEcran: (_c, x, y) => ({ x, y }),
    zoomCalque: () => 1,
    toile: { parentElement: { clientWidth: 800, clientHeight: 600 } }
  };
  ctx.Sauvegarde = { programmer() {} };
  ctx.Fond = {};
  ctx.nomParDefaut = () => 'Montage test';

  // Préparer les éléments DOM utilisés par Panneaux, Cacher, Fond, Lumiere, Formes
  const fenetreTexte = creerEl('dialog', ctx, { id: 'fenetre-texte' });
  const tPolices = creerEl('div', ctx, { id: 't-polices' });
  const tTaille = creerEl('input', ctx, { id: 't-taille', type: 'range', max: '40', value: '8' });
  const tCouleur = creerEl('input', ctx, { id: 't-couleur', value: '#ffffff' });
  const tTexte = creerEl('textarea', ctx, { id: 't-texte', value: '' });
  const tGras = creerEl('input', ctx, { id: 't-gras', type: 'checkbox', checked: true });
  const tContour = creerEl('input', ctx, { id: 't-contour', type: 'checkbox', checked: false });
  const tContourCouleur = creerEl('input', ctx, { id: 't-contour-couleur', value: '#1b1726' });
  const tContourEp = creerEl('input', ctx, { id: 't-contour-epaisseur', value: '8' });
  const tOmbre = creerEl('input', ctx, { id: 't-ombre', type: 'checkbox', checked: true });
  const tOmbreCouleur = creerEl('input', ctx, { id: 't-ombre-couleur', value: '#000000' });
  const tOmbreFlou = creerEl('input', ctx, { id: 't-ombre-flou', value: '12' });
  const tOmbreDist = creerEl('input', ctx, { id: 't-ombre-distance', value: '5' });
  const tCourbure = creerEl('input', ctx, { id: 't-courbure', value: '0' });
  const tEspacement = creerEl('input', ctx, { id: 't-espacement', value: '0' });
  const tBandeau = creerEl('input', ctx, { id: 't-bandeau', type: 'checkbox', checked: false });
  const tBandeauCouleur = creerEl('input', ctx, { id: 't-bandeau-couleur', value: '#1b1726' });
  const tBandeauOpacite = creerEl('input', ctx, { id: 't-bandeau-opacite', value: '80' });
  const nuancier = creerEl('div', ctx, { className: 'nuancier' });
  nuancier.dataset.cible = 't-couleur';

  const alignFieldset = creerEl('fieldset', ctx);
  for (const val of ['gauche', 'centre', 'droite']) {
    const r = creerEl('input', ctx, { type: 'radio', name: 't-align', value: val, checked: val === 'centre' });
    alignFieldset.append(r);
  }
  fenetreTexte.append(
    tPolices, tTaille, tCouleur, tTexte, tGras, tContour, tContourCouleur, tContourEp,
    tOmbre, tOmbreCouleur, tOmbreFlou, tOmbreDist, tCourbure, tEspacement,
    tBandeau, tBandeauCouleur, tBandeauOpacite, nuancier, alignFieldset
  );
  ctx.document._register(fenetreTexte);

  for (const id of ['zone-contour', 'zone-ombre', 'zone-bandeau', 'titre-texte', 'fenetre-calques', 'r-taille', 'r-rotation', 'r-opacite']) {
    ctx.document._register(creerEl('div', ctx, { id }));
  }

  chargerScripts(ctx, [
    'outils.js', 'polices.js', 'ressources.js', 'montage.js', 'rendu.js',
    'panneaux.js', 'retouches.js', 'cacher.js', 'fond.js', 'lumiere.js', 'formes.js'
  ]);
  return { ctx, nuancier, tCouleur, tTaille, tGras, fenetreTexte };
}

test('OutilCacher.valider() pendant le debounce 150ms recalcule synchronement travail et travailSource avec la nouvelle force', () => {
  const { ctx } = creerEnvCacherPanneaux();
  // Damier contrasté 120x120
  const t = creerToile(ctx, 120, 120);
  for (let y = 0; y < 120; y++) {
    for (let x = 0; x < 120; x++) {
      const i = (y * 120 + x) * 4;
      const v = ((Math.floor(x / 4) + Math.floor(y / 4)) % 2) ? 250 : 10;
      t._pixels[i] = v; t._pixels[i + 1] = 255 - v; t._pixels[i + 2] = 128; t._pixels[i + 3] = 255;
    }
  }
  ctx.__t = t;
  const caForce = creerEl('input', ctx, { id: 'ca-force', type: 'range', value: '5' });
  const caTaille = creerEl('input', ctx, { id: 'ca-taille', type: 'range', value: '18' });
  const caEffetPix = creerEl('input', ctx, { type: 'radio', name: 'ca-effet', value: 'pixels', checked: true });
  const caFormeRect = creerEl('input', ctx, { type: 'radio', name: 'ca-forme', value: 'rectangle', checked: true });
  ctx.document._register(caForce);
  ctx.document._register(caTaille);
  ctx.document._register(caEffetPix);
  ctx.document._register(caFormeRect);

  let validatedCount = 0;
  ctx.__onValidate = () => { validatedCount++; };

  executer(ctx, `
    Montage.nouveau(120, 120);
    const r1 = Ressources.depuisToile(__t);
    const s = document.createElement('canvas'); s.width = 120; s.height = 120; s.getContext('2d').drawImage(__t, 0, 0);
    const r2 = Ressources.depuisToile(s);
    const c = Montage.ajouterImage(r1, 120, 120);
    c.source = r2;
    OutilCacher.commencer(c);
    OutilCacher.appui({ x: 10, y: 10 });
    OutilCacher.mouvement({ x: 110, y: 110 });
    OutilCacher.relache();
  `);

  const avantForce10 = executer(ctx, `[...OutilCacher.travail._pixels.slice(0, 120 * 4)]`);
  assert.equal(lireSymbole(ctx, 'OutilCacher._minuteurCalcul'), null);

  // Changement rapide à force=10 (debounce 150ms actif) puis valider() immédiat
  executer(ctx, `
    $('#ca-force').value = '10';
    OutilCacher.reglageChange({ type: 'input', target: $('#ca-force') });
  `);
  assert.ok(lireSymbole(ctx, 'OutilCacher._minuteurCalcul') !== null);

  executer(ctx, `
    const orig = Retouche.valider.bind(Retouche);
    Retouche.valider = function (c, toile, opts) {
      __onValidate();
      return orig(c, toile, opts);
    };
    OutilCacher.valider();
  `);

  assert.equal(validatedCount, 1);
  assert.equal(lireSymbole(ctx, 'OutilCacher._minuteurCalcul'), null);
  assert.equal(lireSymbole(ctx, 'OutilCacher.travail'), null);
  const resId = lireSymbole(ctx, 'Montage.doc.calques[0].ressource');
  const srcId = lireSymbole(ctx, 'Montage.doc.calques[0].source');
  const apresForce10 = executer(ctx, `[...Ressources.obtenir(${JSON.stringify(resId)}).image._pixels.slice(0, 120 * 4)]`);
  const srcForce10 = executer(ctx, `[...Ressources.obtenir(${JSON.stringify(srcId)}).image._pixels.slice(0, 120 * 4)]`);
  assert.notDeepEqual(apresForce10, avantForce10);
  assert.deepEqual(srcForce10, apresForce10);
  annulerMinuteurs(ctx);
});

test('OutilCacher.commencer()/fermer() annulent les minuteurs et _flouter() fonctionne sous Safari (sans ctx.filter)', () => {
  const { ctx } = creerEnvCacherPanneaux({ safariFilter: true });
  ctx.__t = creerToile(ctx, 60, 60, [200, 100, 50, 255]);
  const caForce = creerEl('input', ctx, { id: 'ca-force', type: 'range', value: '6' });
  const caEffetFlou = creerEl('input', ctx, { type: 'radio', name: 'ca-effet', value: 'flou', checked: true });
  ctx.document._register(caForce);
  ctx.document._register(caEffetFlou);

  executer(ctx, `
    Montage.nouveau(60, 60);
    const r = Ressources.depuisToile(__t);
    const c = Montage.ajouterImage(r, 60, 60);
    OutilCacher.commencer(c);
    OutilCacher._flouter(__t, { points: [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 50 }, { x: 10, y: 50 }] }, 8);
    OutilCacher.reglageChange({ type: 'input', target: $('#ca-force') });
    OutilCacher.zones.push({ points: [{ x: 10, y: 10 }, { x: 40, y: 40 }] });
    OutilCacher.reglageChange({ type: 'input', target: $('#ca-force') });
    OutilCacher.fermer();
  `);
  assert.equal(lireSymbole(ctx, 'OutilCacher._minuteurCalcul'), null);
  assert.equal(lireSymbole(ctx, 'OutilCacher._minuteurReglage'), null);
  assert.ok(ctx._zeroedCanvases.length >= 3);
  annulerMinuteurs(ctx);
});

test('Panneaux.ouvrirTexte & _appliquerTexte préservent une échelle texte > 40% sur couleur / nuancier / police / align / gras', () => {
  const { ctx, nuancier, tCouleur, tTaille, tGras } = creerEnvCacherPanneaux();
  executer(ctx, `Panneaux.initialiser();`);

  executer(ctx, `
    Montage.nouveau(1000, 1000);
    const c = Montage.ajouterTexte('Grand');
    // taille = 80 ; echelle = 7.5 => 60% (> 40%)
    Montage.modifier(c.id, { echelle: 7.5 });
    Panneaux.ouvrirTexte(c.id);
  `);

  assert.equal(tTaille.max, '60');
  const echelleInitiale = lireSymbole(ctx, 'Montage.doc.calques[0].echelle');
  assert.equal(echelleInitiale, 7.5);

  // 1. Changement couleur direct
  tCouleur.value = '#e4572e';
  tCouleur.dispatchEvent({ type: 'input', target: tCouleur, bubbles: true });
  assert.equal(lireSymbole(ctx, 'Montage.doc.calques[0].echelle'), echelleInitiale);
  assert.equal(lireSymbole(ctx, 'Montage.doc.calques[0].couleur'), '#e4572e');

  // 2. Clic sur pastille nuancier
  nuancier.children[2].click();
  assert.equal(lireSymbole(ctx, 'Montage.doc.calques[0].echelle'), echelleInitiale);

  // 3. Changement police, alignement, gras
  const pRadio = ctx.document.querySelector('input[name="t-police"][value="satisfy"]');
  pRadio.checked = true;
  pRadio.dispatchEvent({ type: 'change', target: pRadio, bubbles: true });
  const aRadio = ctx.document.querySelector('input[name="t-align"][value="gauche"]');
  aRadio.checked = true;
  aRadio.dispatchEvent({ type: 'change', target: aRadio, bubbles: true });
  tGras.checked = false;
  tGras.dispatchEvent({ type: 'change', target: tGras, bubbles: true });
  assert.equal(lireSymbole(ctx, 'Montage.doc.calques[0].echelle'), echelleInitiale);

  // 4. Modification volontaire de #t-taille -> met à jour echelle
  tTaille.value = '50';
  tTaille.dispatchEvent({ type: 'input', target: tTaille, bubbles: true });
  assert.ok(Math.abs(lireSymbole(ctx, 'Montage.doc.calques[0].echelle') - 6.25) < 1e-6);
  annulerMinuteurs(ctx);
});

test('CSS.escape() sécurise les sélecteurs avec caractères adversariaux dans Panneaux, Fond, Lumiere et Formes', () => {
  const { ctx } = creerEnvCacherPanneaux();
  const adv = 'x"y]z\\';

  // Panneaux : police / alignement / dataset.cible adversariaux
  const radioPolice = creerEl('input', ctx, { type: 'radio', name: 't-police', value: adv, checked: false });
  const radioAlign = creerEl('input', ctx, { type: 'radio', name: 't-align', value: adv, checked: false });
  const fenetreTexte = ctx.document.querySelector('#fenetre-texte');
  fenetreTexte.append(radioPolice, radioAlign);
  executer(ctx, `Panneaux.initialiser();`);
  executer(ctx, `
    Montage.nouveau(500, 500);
    const c = Montage.ajouterTexte('Test');
    c.police = ${JSON.stringify(adv)};
    c.alignement = ${JSON.stringify(adv)};
    Panneaux.ouvrirTexte(c.id);
  `);
  assert.equal(radioPolice.checked, true);
  assert.equal(radioAlign.checked, true);

  // Formes : FenetreForme.ouvrir()
  const radioForme = creerEl('input', ctx, { type: 'radio', name: 'fo-forme', value: adv, checked: false });
  ctx.document._register(radioForme);
  executer(ctx, `
    const f = { id: 'f1', type: 'forme', forme: ${JSON.stringify(adv)}, largeur: 100, hauteur: 100, remplissage: { actif: true, couleur: '#fff' }, trait: { actif: false, couleur: '#000', epaisseur: 0.04 }, arrondi: 0 };
    Montage.doc.calques.push(f);
    FenetreForme.ouvrir('f1');
  `);
  assert.equal(radioForme.checked, true);

  // OutilLumiere._remplir()
  const radioFiltre = creerEl('input', ctx, { type: 'radio', name: 'lu-filtre', value: adv, checked: false });
  ctx.document._register(radioFiltre);
  executer(ctx, `
    const im = { id: 'i1', type: 'image', reglages: { filtre: ${JSON.stringify(adv)} } };
    Montage.doc.calques.push(im);
    OutilLumiere.calque = im;
    OutilLumiere._remplir();
  `);
  assert.equal(radioFiltre.checked, true);

  // Fond._remplir(c)
  const radioFondMode = creerEl('input', ctx, { type: 'radio', name: 'b-mode', value: adv, checked: false });
  const radioFondDir = creerEl('input', ctx, { type: 'radio', name: 'b-direction', value: adv, checked: false });
  ctx.document._register(radioFondMode);
  ctx.document._register(radioFondDir);
  executer(ctx, `
    Fond._remplir({ id: 'fd1', type: 'fond', mode: ${JSON.stringify(adv)}, couleur: '#000', couleur2: '#fff', direction: ${JSON.stringify(adv)} });
  `);
  assert.equal(radioFondMode.checked, true);
  assert.equal(radioFondDir.checked, true);
  annulerMinuteurs(ctx);
});
