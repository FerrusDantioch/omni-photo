/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   Tests automatiques d'Omni-Photo.
   Ils ouvrent l'application dans un vrai navigateur (Chromium, piloté
   par Playwright), imitent un téléphone, ouvrent des photos de test
   (fabriquées sur place), ajoutent des textes et des images, bougent
   les calques « au doigt », annulent, exportent, et vérifient les
   messages d'erreur. Rien n'est envoyé sur internet.

   Lancer (Playwright doit être installé) :  node tests/tester.js
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { lancer, section, verifier, nouvellePage, controlesCommuns, RACINE } = require('./outils.js');

const attendre = (p, ms) => p.waitForTimeout(ms);
const texte = (p, sel) => p.$eval(sel, (el) => el.textContent.replace(/\s+/g, ' ').trim());
const etat = (p) => p.evaluate(() => ({
  doc: Montage.doc && JSON.parse(JSON.stringify(Montage.doc)),
  selection: Montage.selection,
  passe: Historique.passe.length,
  futur: Historique.futur.length,
  vue: document.body.dataset.vue
}));

/* Fabrique une image de test dans la page (dégradé + disque), renvoyée
   sous forme de fichier (octets). */
async function fabriquerImage(p, largeur, hauteur, { type = 'image/jpeg', transparent = false } = {}) {
  const b64 = await p.evaluate(async ({ largeur, hauteur, type, transparent }) => {
    const c = document.createElement('canvas');
    c.width = largeur; c.height = hauteur;
    const x = c.getContext('2d');
    if (!transparent) {
      const g = x.createLinearGradient(0, 0, largeur, hauteur);
      g.addColorStop(0, '#3a6ea5'); g.addColorStop(1, '#c0d6df');
      x.fillStyle = g; x.fillRect(0, 0, largeur, hauteur);
    }
    x.fillStyle = '#e4572e';
    x.beginPath(); x.arc(largeur / 2, hauteur / 2, Math.min(largeur, hauteur) / 4, 0, Math.PI * 2); x.fill();
    const blob = await new Promise((ok) => c.toBlob(ok, type, 0.9));
    c.width = 0;
    const tampon = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < tampon.length; i += 0x8000) s += String.fromCharCode(...tampon.subarray(i, i + 0x8000));
    return btoa(s);
  }, { largeur, hauteur, type, transparent });
  return Buffer.from(b64, 'base64');
}

/* Toucher un bouton, puis donner un fichier au sélecteur qui s'ouvre. */
async function donnerFichier(p, selecteurBouton, fichier) {
  const [choix] = await Promise.all([p.waitForEvent('filechooser'), p.click(selecteurBouton)]);
  await choix.setFiles(fichier);
}

/* Attendre la fin de « Patiente… » */
async function attendreFin(p) {
  await p.waitForFunction(() => document.querySelector('#patience').hidden, null, { timeout: 30000 });
  await attendre(p, 300);
}

/* Imiter des doigts sur la toile (événements « pointer » de type tactile). */
async function doigts(p, etapes) {
  await p.evaluate(async (etapes) => {
    const toile = document.querySelector('#toile');
    const r = toile.getBoundingClientRect();
    for (const [type, id, x, y] of etapes) {
      toile.dispatchEvent(new PointerEvent(type, {
        pointerId: id, pointerType: 'touch', isPrimary: id === 1, bubbles: true, cancelable: true,
        clientX: r.left + x, clientY: r.top + y, buttons: type === 'pointerup' ? 0 : 1
      }));
      await new Promise((ok) => requestAnimationFrame(ok));
    }
  }, etapes);
}

const ecranDe = (p, id) => p.evaluate((id) => {
  const c = Montage.calque(id);
  return Editeur.montageVersEcran(c.x, c.y);
}, id);


/* Un faux visage : peau, deux pupilles rouges avec un reflet blanc, et
   des lèvres rouges (qui ne doivent PAS être touchées). 600 × 400. */
async function fabriquerVisage(p) {
  const b64 = await p.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 600; c.height = 400;
    const x = c.getContext('2d');
    x.fillStyle = '#d9a07a'; x.fillRect(0, 0, 600, 400);                      // peau
    for (const cx of [200, 400]) {
      x.fillStyle = '#f2ede6'; x.beginPath(); x.ellipse(cx, 200, 45, 28, 0, 0, 7); x.fill();   // blanc de l'œil
      x.fillStyle = '#4a7a5a'; x.beginPath(); x.arc(cx, 200, 26, 0, 7); x.fill();              // iris vert
      x.fillStyle = '#c41a1a'; x.beginPath(); x.arc(cx, 200, 18, 0, 7); x.fill();              // pupille rouge
      x.fillStyle = '#fbfbf8'; x.beginPath(); x.arc(cx + 6, 194, 4, 0, 7); x.fill();           // reflet
    }
    x.fillStyle = '#c03030'; x.beginPath(); x.ellipse(300, 330, 60, 22, 0, 0, 7); x.fill();     // lèvres
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
    const t = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (const v of t) s += String.fromCharCode(v);
    return btoa(s);
  });
  return Buffer.from(b64, 'base64');
}

/* La couleur d'un pixel de l'image d'un calque (ou de l'aperçu en cours). */
const pixel = (p, id, x, y, apercu = false) => p.evaluate(({ id, x, y, apercu }) => {
  const image = apercu ? Rendu.remplacements.get(id) : Ressources.obtenir(id).image;
  const c = new OffscreenCanvas(1, 1);
  const ctx = c.getContext('2d');
  ctx.drawImage(image, -x, -y);
  return [...ctx.getImageData(0, 0, 1, 1).data];
}, { id, x, y, apercu });

const versEcran = (p, x, y) => p.evaluate(({ x, y }) => {
  const c = Retouche.cible() || Montage.doc.calques[0];
  return Editeur.calqueVersEcran(Editeur.outil ? Editeur.outil.calque : c, x, y);
}, { x, y });

const toucherEcran = (p, e) => doigts(p, [['pointerdown', 1, e.x, e.y], ['pointerup', 1, e.x, e.y]]);


/* Un sujet bien visible : un disque orangé texturé, sur un fond gris clair
   légèrement dégradé (de quoi intéresser l'IA). */
async function fabriquerSujet(p, largeur = 600, hauteur = 400) {
  const b64 = await p.evaluate(async ({ largeur, hauteur }) => {
    const c = document.createElement('canvas');
    c.width = largeur; c.height = hauteur;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, hauteur);
    g.addColorStop(0, '#e3e6ea'); g.addColorStop(1, '#c9ced6');
    x.fillStyle = g; x.fillRect(0, 0, largeur, hauteur);
    const r = Math.min(largeur, hauteur) * 0.3;
    const d = x.createRadialGradient(largeur / 2 - r / 3, hauteur / 2 - r / 3, r / 6, largeur / 2, hauteur / 2, r);
    d.addColorStop(0, '#f6a04d'); d.addColorStop(1, '#b5481c');
    x.fillStyle = d; x.beginPath(); x.arc(largeur / 2, hauteur / 2, r, 0, 7); x.fill();
    x.fillStyle = '#5a2a12';
    for (let i = 0; i < 9; i++) { x.beginPath(); x.arc(largeur / 2 + Math.cos(i) * r * 0.55, hauteur / 2 + Math.sin(i * 1.7) * r * 0.5, r * 0.07, 0, 7); x.fill(); }
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.92));
    c.width = 0;
    const t = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < t.length; i += 0x8000) s += String.fromCharCode(...t.subarray(i, i + 0x8000));
    return btoa(s);
  }, { largeur, hauteur });
  return Buffer.from(b64, 'base64');
}

/* Attendre la fin du détourage (l'aperçu est prêt, ou l'outil s'est fermé). */
async function attendreIA(p) {
  await p.waitForFunction(() => document.querySelector('#patience').hidden && (OutilIA.apercu || Editeur.outil !== OutilIA), null, { timeout: 120000 });
  await p.waitForTimeout(200);
}

lancer('Omni-Photo', async () => {
  if (!process.env.RAPIDE) await controlesCommuns({ serviceWorker: 'sw.js' });

  await section('Fichiers du dépôt', async () => {
    for (const f of ['README.md', 'LICENCES-TIERS.md', 'LICENCE-APACHE-2.0.txt', 'LICENCE-ONNXRUNTIME-MIT.txt', 'LICENSE']) {
      verifier(fs.existsSync(path.join(RACINE, f)), f + ' existe');
    }
  });

  // ---------------- Téléphone en portrait ----------------
  const { ctx, p } = await nouvellePage();
  await p.waitForFunction(() => document.body.dataset.pret === 'oui');

  let photoId;
  await section('Ouvrir une photo', async () => {
    const photo = await fabriquerImage(p, 1200, 800);
    await donnerFichier(p, '[data-action="ouvrir-galerie"]', { name: 'vacances.jpg', mimeType: 'image/jpeg', buffer: photo });
    await attendreFin(p);
    const e = await etat(p);
    verifier(e.vue === 'editeur', 'l’éditeur s’ouvre', e.vue);
    verifier(e.doc.largeur === 1200 && e.doc.hauteur === 800, 'le montage a la taille de la photo', [e.doc.largeur, e.doc.hauteur]);
    verifier(e.doc.calques.length === 1 && e.doc.calques[0].verrouille, 'la photo est un calque verrouillé');
    photoId = e.doc.calques[0].id;
    const pixel = await p.evaluate(() => {
      const t = document.querySelector('#toile');
      const d = t.getContext('2d').getImageData(t.width / 2, t.height / 2, 1, 1).data;
      return [...d];
    });
    verifier(pixel[3] === 255 && pixel[0] > 150, 'la photo est dessinée à l’écran', pixel);
    const debord = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    verifier(debord <= 0, 'l’éditeur tient dans l’écran du téléphone', debord);
  });

  let texteId;
  await section('Ajouter un texte', async () => {
    await p.click('[data-action="ajouter-texte"]');
    await attendre(p, 300);
    verifier(await p.$eval('#fenetre-texte', (d) => d.open), 'la fenêtre « Texte » s’ouvre');
    await p.fill('#t-texte', 'Bonjour\nla mer');
    await p.click('label.choix-police:has(input[value="special-elite"])');
    await p.click('label.interrupteur:has(#t-contour)');
    await p.click('#zone-contour .nuancier .pastille:nth-child(2)');
    await p.click('label.choix:has(input[value="gauche"])');
    await p.$eval('#t-taille', (el) => { el.value = 12; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await p.click('#fenetre-texte [data-action="fermer-fenetre"]');
    await attendre(p, 300);
    const e = await etat(p);
    const t = e.doc.calques[1];
    texteId = t.id;
    verifier(e.doc.calques.length === 2 && t.type === 'texte', 'un calque texte est ajouté');
    verifier(t.texte === 'Bonjour\nla mer', 'le texte est enregistré (deux lignes)', t.texte);
    verifier(t.police === 'special-elite' && t.contour.actif && t.contour.couleur === '#1b1726' && t.alignement === 'gauche',
      'police, contour et alignement choisis', [t.police, t.contour, t.alignement]);
    const taille = (t.taille * t.echelle) / 800 * 100;
    verifier(Math.abs(taille - 12) < 0.5, 'taille des lettres : 12 % de la hauteur', taille);
    verifier(e.passe === 1, 'ajouter + écrire = une seule étape d’« Annuler »', e.passe);
    verifier(e.selection === texteId && !(await p.$eval('#outils-calque', (el) => el.hidden)), 'le texte est choisi, ses réglages sont affichés');
  });

  await section('Bouger le texte au doigt', async () => {
    const avant = (await etat(p)).doc.calques[1];
    const c = await ecranDe(p, texteId);
    await doigts(p, [['pointerdown', 1, c.x, c.y], ['pointermove', 1, c.x + 20, c.y + 10], ['pointermove', 1, c.x + 60, c.y + 30], ['pointerup', 1, c.x + 60, c.y + 30]]);
    const apres = (await etat(p)).doc.calques[1];
    const vue = await p.evaluate(() => Editeur.vue.e);
    verifier(Math.abs(apres.x - avant.x - 60 / vue) < 1 && Math.abs(apres.y - avant.y - 30 / vue) < 1, 'glisser déplace le texte', [apres.x - avant.x, apres.y - avant.y]);

    // Pincer et tourner à deux doigts
    const m = await ecranDe(p, texteId);
    await doigts(p, [
      ['pointerdown', 1, m.x - 30, m.y], ['pointerdown', 2, m.x + 30, m.y],
      ['pointermove', 2, m.x + 50, m.y + 30], ['pointermove', 1, m.x - 50, m.y - 30],
      ['pointerup', 2, m.x + 50, m.y + 30], ['pointerup', 1, m.x - 50, m.y - 30]
    ]);
    const pince = (await etat(p)).doc.calques[1];
    verifier(pince.echelle > apres.echelle * 1.7, 'pincer agrandit le texte', [apres.echelle, pince.echelle]);
    verifier(Math.abs(pince.rotation - 31) < 2, 'deux doigts tournent le texte (≈31°)', pince.rotation);

    // La poignée ronde : agrandir et tourner d'un seul doigt
    const coin = await p.evaluate((id) => Editeur.coinsEcran(Montage.calque(id))[2], texteId);
    const centre = await ecranDe(p, texteId);
    const dx = coin.x - centre.x, dy = coin.y - centre.y;
    await doigts(p, [['pointerdown', 1, coin.x, coin.y], ['pointermove', 1, centre.x + dx * 0.8, centre.y + dy * 0.8],
      ['pointermove', 1, centre.x - dy * 0.5, centre.y + dx * 0.5], ['pointerup', 1, centre.x - dy * 0.5, centre.y + dx * 0.5]]);
    const poignee = (await etat(p)).doc.calques[1];
    verifier(Math.abs(poignee.echelle / pince.echelle - 0.5) < 0.05, 'la poignée change la taille', poignee.echelle / pince.echelle);
    verifier(Math.abs(normaliser(poignee.rotation - pince.rotation) - 90) < 5, 'la poignée tourne (≈90°, calé tout seul)', poignee.rotation);

    // Toucher dans le vide : plus rien n'est choisi
    await doigts(p, [['pointerdown', 1, 5, 5], ['pointerup', 1, 5, 5]]);
    verifier((await etat(p)).selection === null, 'toucher à côté enlève la sélection');
    // Toucher la photo verrouillée ne la choisit pas
    const ph = await ecranDe(p, photoId);
    const ailleurs = { x: ph.x - 150, y: ph.y + 100 };
    await doigts(p, [['pointerdown', 1, ailleurs.x, ailleurs.y], ['pointerup', 1, ailleurs.x, ailleurs.y]]);
    verifier((await etat(p)).selection === null, 'la photo verrouillée ne se choisit pas par erreur');
  });

  await section('Zoom à deux doigts sur la photo', async () => {
    const avant = await p.evaluate(() => Editeur.vue.e);
    await doigts(p, [['pointerdown', 1, 150, 200], ['pointerdown', 2, 230, 200], ['pointermove', 2, 310, 200], ['pointerup', 2, 310, 200], ['pointerup', 1, 150, 200]]);
    const apres = await p.evaluate(() => Editeur.vue.e);
    verifier(apres > avant * 1.8, 'deux doigts sans rien choisir : la vue zoome', [avant, apres]);
    await p.click('[data-action="voir-tout"]');
    await attendre(p, 200);
    verifier(Math.abs((await p.evaluate(() => Editeur.vue.e)) - avant) < 1e-6, '« Voir tout » remet la vue', avant);
  });

  await section('Réglages du calque', async () => {
    await p.evaluate((id) => Montage.choisir(id), texteId);
    const passe = (await etat(p)).passe;
    await p.$eval('#r-opacite', (el) => {
      for (const v of [80, 60, 50]) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    let e = await etat(p);
    verifier(e.doc.calques[1].opacite === 0.5, 'opacité à 50 %', e.doc.calques[1].opacite);
    verifier(e.passe === passe + 1, 'tout un mouvement de curseur = une étape', e.passe - passe);
    await p.click('[data-action="miroir-h"]');
    e = await etat(p);
    verifier(e.doc.calques[1].miroirH === true, 'retourner de gauche à droite');
    await p.click('[data-action="dupliquer"]');
    e = await etat(p);
    verifier(e.doc.calques.length === 3 && e.selection === e.doc.calques[2].id, 'dupliquer ajoute une copie au-dessus');
    await p.click('[data-action="reculer"]');
    e = await etat(p);
    verifier(e.doc.calques[1].id === e.selection, '« Reculer » passe la copie sous le texte');
    const supprimer = '#outils-calque [data-action="supprimer"]';
    await p.click(supprimer);
    e = await etat(p);
    verifier(e.doc.calques.length === 3, 'supprimer : le premier appui ne fait que prévenir');
    verifier((await texte(p, supprimer)).includes('Toucher encore'), 'le bouton demande un deuxième appui');
    await p.click(supprimer);
    e = await etat(p);
    verifier(e.doc.calques.length === 2, 'le deuxième appui supprime');
  });

  await section('Ajouter une image en calque', async () => {
    const logo = await fabriquerImage(p, 300, 300, { type: 'image/png', transparent: true });
    await donnerFichier(p, '[data-action="ajouter-image"]', { name: 'logo.png', mimeType: 'image/png', buffer: logo });
    await attendreFin(p);
    const e = await etat(p);
    const c = e.doc.calques[e.doc.calques.length - 1];
    verifier(e.doc.calques.length === 3 && c.type === 'image' && c.largeur === 300, 'l’image est ajoutée au-dessus', c && c.largeur);
    verifier(c.hauteur * c.echelle <= 800 * 0.6 + 1, 'elle est posée assez petite pour la voir entière');
  });

  await section('La fenêtre « Calques »', async () => {
    await p.click('[data-action="deselectionner"]');
    await p.click('[data-action="ouvrir-calques"]');
    await attendre(p, 200);
    const lignes = await p.$$eval('#liste-calques .ligne-calque', (l) => l.map((x) => x.textContent));
    verifier(lignes.length === 3 && lignes[2].includes('Photo') && lignes[2].includes('verrouillé'), 'trois calques, la photo en bas', lignes);
    // Masquer le calque du haut, puis le faire descendre
    await p.click('#liste-calques .ligne-calque:first-child [data-action="calque-visible"]');
    await p.click('#liste-calques .ligne-calque:first-child [data-action="calque-descendre"]');
    await p.click('#fenetre-calques [data-action="fermer-fenetre"]');
    await attendre(p, 200);
    const e = await etat(p);
    verifier(e.doc.calques[1].type === 'image' && !e.doc.calques[1].visible, 'le calque est masqué et descendu d’un cran');
  });

  await section('Annuler / Rétablir', async () => {
    let e = await etat(p);
    const etapes = e.passe;
    verifier(etapes >= 8, 'chaque modification a son étape', etapes);
    for (let i = 0; i < etapes; i++) await p.tap('[data-action="annuler"]');
    e = await etat(p);
    verifier(e.doc.calques.length === 1, 'tout annuler ramène à la photo seule', e.doc.calques.length);
    verifier(await p.$eval('[data-action="annuler"]', (b) => b.disabled), '« Annuler » est grisé quand il n’y a plus rien');
    for (let i = 0; i < etapes; i++) await p.tap('[data-action="retablir"]');
    e = await etat(p);
    verifier(e.doc.calques.length === 3 && e.futur === 0, 'tout rétablir redonne le montage', e.doc.calques.length);

    // Au moins 20 niveaux (30 prévus)
    await p.evaluate(() => {
      const id = Montage.doc.calques[2].id;
      for (let i = 0; i < 40; i++) Historique.action(() => Montage.modifier(id, { rotation: i }));
    });
    e = await etat(p);
    verifier(e.passe === 30, '30 niveaux d’« Annuler » gardés', e.passe);
    for (let i = 0; i < 25; i++) await p.click('[data-action="annuler"]');
    e = await etat(p);
    verifier(e.doc.calques[2].rotation === 14, '25 annulations de suite fonctionnent', e.doc.calques[2].rotation);
  });

  await section('Exporter en PNG et en JPG', async () => {
    await p.click('[data-action="ouvrir-export"]');
    await attendre(p, 200);
    verifier((await texte(p, '#e-dimensions')).includes('1 200 × 800') || (await texte(p, '#e-dimensions')).includes('1 200 × 800'), 'la taille de l’image est annoncée', await texte(p, '#e-dimensions'));
    let [telechargement] = await Promise.all([p.waitForEvent('download'), p.click('[data-action="enregistrer"]')]);
    let octets = fs.readFileSync(await telechargement.path());
    verifier(/^omni-photo-\d{4}-\d\d-\d\d-\d{4}\.png$/.test(telechargement.suggestedFilename()), 'nom du fichier PNG', telechargement.suggestedFilename());
    verifier(octets.slice(1, 4).toString() === 'PNG' && octets.readUInt32BE(16) === 1200 && octets.readUInt32BE(20) === 800, 'vrai fichier PNG de 1 200 × 800');

    await p.click('[data-action="ouvrir-export"]');
    await p.click('label.choix:has(input[value="jpg"])');
    verifier(!(await p.$eval('#zone-qualite', (z) => z.hidden)), 'le réglage de qualité apparaît pour le JPG');
    await p.$eval('#e-qualite', (el) => { el.value = 60; el.dispatchEvent(new Event('input', { bubbles: true })); });
    [telechargement] = await Promise.all([p.waitForEvent('download'), p.click('[data-action="enregistrer"]')]);
    const jpg60 = fs.readFileSync(await telechargement.path());
    verifier(jpg60[0] === 0xff && jpg60[1] === 0xd8 && telechargement.suggestedFilename().endsWith('.jpg'), 'vrai fichier JPG');
    await p.click('[data-action="ouvrir-export"]');
    await p.$eval('#e-qualite', (el) => { el.value = 100; el.dispatchEvent(new Event('input', { bubbles: true })); });
    [telechargement] = await Promise.all([p.waitForEvent('download'), p.click('[data-action="enregistrer"]')]);
    const jpg100 = fs.readFileSync(await telechargement.path());
    verifier(jpg100.length > jpg60.length, 'qualité 100 % : fichier plus lourd qu’à 60 %', [jpg60.length, jpg100.length]);
    verifier((await texte(p, '#message-texte')).includes('Téléchargements'), 'un message dit où trouver l’image');
  });

  await section('Sauvegarde automatique et reprise', async () => {
    const avant = (await etat(p)).doc;
    await p.evaluate(() => Sauvegarde.maintenant());
    await p.reload();
    await p.waitForFunction(() => document.body.dataset.pret === 'oui');
    await p.waitForSelector('#bloc-reprise:not([hidden])', { timeout: 5000 });
    verifier(true, '« Reprendre mon montage » apparaît après réouverture');
    await p.click('[data-action="reprendre"]');
    await attendreFin(p);
    const apres = (await etat(p)).doc;
    verifier(apres && JSON.stringify(apres) === JSON.stringify(avant), 'le montage revient à l’identique', apres && apres.calques.length);
  });

  await section('Toile vide transparente et PNG transparent', async () => {
    await p.click('[data-action="accueil"]');
    await attendre(p, 300);
    await p.click('[data-action="ouvrir-toile"]');
    verifier(!(await p.$eval('#fenetre-toile', (d) => d.open)), 'un montage existe : le premier appui prévient');
    await p.click('[data-action="ouvrir-toile"]');
    await attendre(p, 200);
    await p.click('label.choix:has(input[value="1080x1350"])');
    await p.click('[data-action="creer-toile"]');
    await attendre(p, 400);
    let e = await etat(p);
    verifier(e.doc.largeur === 1080 && e.doc.hauteur === 1350 && e.doc.calques.length === 0, 'toile vide 1 080 × 1 350');
    await p.click('[data-action="ajouter-texte"]');
    await p.fill('#t-texte', 'Été');
    await p.click('#fenetre-texte [data-action="fermer-fenetre"]');
    await p.click('[data-action="ouvrir-export"]');
    await p.click('label.choix:has(input[value="png"])');
    const [telechargement] = await Promise.all([p.waitForEvent('download'), p.click('[data-action="enregistrer"]')]);
    const b64 = fs.readFileSync(await telechargement.path()).toString('base64');
    const pixels = await p.evaluate(async (b64) => {
      const blob = await (await fetch('data:image/png;base64,' + b64)).blob();
      const img = await createImageBitmap(blob);
      const c = new OffscreenCanvas(img.width, img.height);
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      return { coin: x.getImageData(5, 5, 1, 1).data[3], taille: [img.width, img.height] };
    }, b64);
    verifier(pixels.coin === 0, 'le fond transparent est gardé dans le PNG', pixels.coin);
  });

  await section('Messages d’erreur', async () => {
    await p.click('[data-action="accueil"]');
    await attendre(p, 300);
    const essai = async (fichier) => {
      await p.click('[data-action="ouvrir-galerie"]');          // premier appui (montage en cours)
      await donnerFichier(p, '[data-action="ouvrir-galerie"]', fichier);
      await attendreFin(p);
      return texte(p, '#message-texte');
    };
    // HEIC (faux fichier commençant comme un HEIC)
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(200, 7)]);
    let m = await essai({ name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: heic });
    verifier(m.includes('HEIC') && m.includes('JPG'), 'photo HEIC : explication claire', m);
    verifier((await etat(p)).vue === 'accueil', 'on reste sur l’accueil');
    await p.click('[data-action="fermer-message"]');
    m = await essai({ name: 'document.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('ceci n’est pas une image'.repeat(20)) });
    verifier(m.includes('pas pris en charge'), 'fichier qui n’est pas une image : message', m);
    await p.click('[data-action="fermer-message"]');
    m = await essai({ name: 'vide.png', mimeType: 'image/png', buffer: Buffer.alloc(0) });
    verifier(m.includes('vide'), 'fichier vide : message', m);
    await p.click('[data-action="fermer-message"]');

    // Manque de mémoire (simulé : le navigateur refuse d'ouvrir l'image)
    await p.evaluate(() => {
      window._cib = window.createImageBitmap;
      window._dec = HTMLImageElement.prototype.decode;
      window.createImageBitmap = () => Promise.reject(new Error('out of memory'));
      HTMLImageElement.prototype.decode = () => Promise.reject(new Error('out of memory'));
    });
    m = await essai({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: await fabriquerImage(p, 400, 300) });
    verifier(m.includes('manque de mémoire'), 'manque de mémoire à l’ouverture : message rassurant', m);
    await p.evaluate(() => { window.createImageBitmap = window._cib; HTMLImageElement.prototype.decode = window._dec; });
    await p.click('[data-action="fermer-message"]');
    // Après l'erreur, le montage précédent peut toujours être repris
    verifier(!(await p.$eval('#bloc-reprise', (b) => b.hidden)), 'après une erreur, l’ancien montage peut être repris');
  });

  await section('Photo très grande', async () => {
    const grande = await fabriquerImage(p, 6000, 4500);
    await p.click('[data-action="ouvrir-galerie"]');
    await donnerFichier(p, '[data-action="ouvrir-galerie"]', { name: 'grande.jpg', mimeType: 'image/jpeg', buffer: grande });
    await attendreFin(p);
    const e = await etat(p);
    verifier(e.doc.largeur === 4096 && e.doc.hauteur === 3072, 'réduite à 4 096 × 3 072', [e.doc.largeur, e.doc.hauteur]);
    verifier((await texte(p, '#message-texte')).includes('réduite'), 'un message explique la réduction');
  });

  await section('Export impossible (manque de mémoire simulé)', async () => {
    await p.evaluate(() => {
      window._toBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (rappel) { setTimeout(() => rappel(null), 10); };
    });
    await p.click('[data-action="ouvrir-export"]');
    await p.click('[data-action="enregistrer"]');
    await attendreFin(p);
    const m = await texte(p, '#message-texte');
    verifier(m.includes('manque de mémoire') && m.includes('intact'), 'message rassurant, montage intact', m);
    verifier(!(await p.$eval('#fenetre-export', (d) => d.open)), 'la fenêtre d’export se ferme pour laisser lire le message');
    await p.evaluate(() => { HTMLCanvasElement.prototype.toBlob = window._toBlob; });
    await p.click('[data-action="fermer-message"]');
    verifier((await etat(p)).doc.largeur === 4096, 'le montage est toujours là');
  });


  // ---------------- Étape 2 : yeux rouges et découpe ----------------
  await section('Yeux rouges', async () => {
    const t = await nouvellePage();
    const p = t.p;
    await p.waitForFunction(() => document.body.dataset.pret === 'oui');
    await donnerFichier(p, '[data-action="ouvrir-galerie"]', { name: 'visage.png', mimeType: 'image/png', buffer: await fabriquerVisage(p) });
    await attendreFin(p);
    const photo = (await etat(p)).doc.calques[0];
    await p.click('[data-action="outil-yeux"]');
    verifier(await p.evaluate(() => Editeur.outil === OutilYeux) && !(await p.$eval('#outil-yeux', (el) => el.hidden)), 'l’outil s’ouvre avec son panneau');
    verifier((await texte(p, '#outil-yeux .nom-cible')).includes('Photo'), 'il dit quelle image est retouchée');
    verifier(await p.$eval('[data-action="yeux-valider"]', (b) => b.disabled), '« Valider » attend une correction');

    // Zone réglée un peu plus grande que la pupille
    await p.evaluate(() => { const r = document.querySelector('#y-taille'); r.value = 40; r.dispatchEvent(new Event('input', { bubbles: true })); });
    await toucherEcran(p, await versEcran(p, 200, 200));
    let n = await p.evaluate(() => OutilYeux.corrections.length);
    verifier(n === 1, 'toucher l’œil gauche : une correction', n);
    let px = await pixel(p, photo.ressource, 192, 206, true);
    verifier(px[0] < 60 && Math.abs(px[0] - px[1]) < 20, 'aperçu : la pupille devient sombre et naturelle', px);
    px = await pixel(p, photo.ressource, 192, 206);
    verifier(px[0] > 180, 'la vraie image n’est pas encore touchée', px);
    px = await pixel(p, photo.ressource, 206, 194, true);
    verifier(px[0] > 220 && px[1] > 220, 'le reflet blanc de l’œil est gardé', px);
    px = await pixel(p, photo.ressource, 200 - 22, 200, true);
    verifier(px[1] > 100 && px[0] < 120, 'l’iris vert n’est pas abîmé', px);
    px = await pixel(p, photo.ressource, 200, 240, true);
    verifier(Math.abs(px[0] - 217) < 4, 'la peau autour n’est pas touchée', px);

    // Toucher la peau : rien à corriger
    await toucherEcran(p, await versEcran(p, 300, 80));
    verifier((await p.evaluate(() => OutilYeux.corrections.length)) === 1 && (await texte(p, '#message-texte')).includes('Pas de rouge'),
      'toucher sans rouge : message, rien n’est changé');

    // Avant / après
    await p.click('[data-action="yeux-comparer"]');
    verifier(await p.evaluate(() => Rendu.remplacements.size === 0), '« Voir l’original » montre la photo d’avant');
    await p.click('[data-action="yeux-comparer"]');
    verifier(await p.evaluate(() => Rendu.remplacements.size === 1), '« Voir la correction » remontre l’aperçu');

    // Zoom à deux doigts, puis l'autre œil (la précision au zoom)
    const avant = await p.evaluate(() => Editeur.vue.e);
    await doigts(p, [['pointerdown', 1, 150, 200], ['pointerdown', 2, 230, 200], ['pointermove', 2, 330, 200], ['pointerup', 2, 330, 200], ['pointerup', 1, 150, 200]]);
    const zoom = await p.evaluate(() => Editeur.vue.e);
    verifier(zoom > avant * 2, 'deux doigts zooment pendant la retouche', [avant, zoom]);
    verifier((await p.evaluate(() => OutilYeux.corrections.length)) === 1, 'zoomer n’ajoute pas de correction');
    await p.click('[data-action="voir-tout"]').catch(() => {});
    await p.evaluate(() => { const r = document.querySelector('#y-taille'); r.value = 80; r.dispatchEvent(new Event('input', { bubbles: true })); });
    await doigts(p, [['pointerdown', 1, 200, 300], ['pointermove', 1, 260, 320], ['pointerup', 1, 260, 320]]);   // glisser = déplacer la vue
    verifier((await p.evaluate(() => OutilYeux.corrections.length)) === 1, 'glisser un doigt déplace la vue sans corriger');
    await toucherEcran(p, await versEcran(p, 400, 200));
    verifier((await p.evaluate(() => OutilYeux.corrections.length)) === 2, 'l’œil droit est corrigé aussi (zoomé)');
    await p.click('[data-action="yeux-retirer"]');
    verifier((await p.evaluate(() => OutilYeux.corrections.length)) === 1, '« Retirer le dernier » enlève le dernier œil');
    px = await pixel(p, photo.ressource, 392, 206, true);
    verifier(px[0] > 180, 'l’œil droit est redevenu comme avant', px);
    await toucherEcran(p, await versEcran(p, 400, 200));
    await p.click('[data-action="annuler"]');
    verifier((await p.evaluate(() => OutilYeux.corrections.length)) === 1 && (await etat(p)).passe === 0, '« Annuler » en haut retire aussi le dernier œil');
    await toucherEcran(p, await versEcran(p, 400, 200));

    // Export bloqué tant que ce n'est pas validé
    await p.click('[data-action="ouvrir-export"]');
    verifier(!(await p.$eval('#fenetre-export', (d) => d.open)) && (await texte(p, '#message-texte')).includes('Valider'), 'exporter demande d’abord de valider la retouche');
    await p.click('[data-action="fermer-message"]');

    await p.click('[data-action="yeux-valider"]');
    let e = await etat(p);
    const corrigee = e.doc.calques[0].ressource;
    verifier(corrigee !== photo.ressource && e.passe === 1 && !(await p.evaluate(() => Editeur.outil)), 'valider : nouvelle image, une étape d’« Annuler », outil fermé');
    for (const cx of [192, 392]) {
      px = await pixel(p, corrigee, cx, 206);
      verifier(px[0] < 60, `pupille corrigée dans l’image (x=${cx})`, px);
    }
    px = await pixel(p, corrigee, 300, 330);
    verifier(px[0] > 180 && px[1] < 70, 'les lèvres rouges ne sont pas touchées', px);
    await p.click('[data-action="annuler"]');
    verifier((await etat(p)).doc.calques[0].ressource === photo.ressource, '« Annuler » rend les yeux d’origine');
    await p.click('[data-action="retablir"]');
    verifier((await etat(p)).doc.calques[0].ressource === corrigee, '« Rétablir » remet la correction');

    // ---- Découpe par points (photo de fond) ----
    await p.click('[data-action="outil-decoupe"]');
    await p.click('label.choix:has(input[value="points"])');
    for (const [x, y] of [[100, 100], [500, 100], [500, 300], [100, 300]]) await toucherEcran(p, await versEcran(p, x, y));
    let pts = await p.evaluate(() => OutilDecoupe.points.map((q) => [Math.round(q.x), Math.round(q.y)]));
    verifier(pts.length === 4 && Math.abs(pts[2][0] - 500) <= 2 && Math.abs(pts[2][1] - 300) <= 2, 'quatre points posés au bon endroit', pts);
    // Glisser le 3e point pour le corriger
    const p3 = await versEcran(p, 500, 300), cible3 = await versEcran(p, 520, 340);
    await doigts(p, [['pointerdown', 1, p3.x, p3.y], ['pointermove', 1, (p3.x + cible3.x) / 2, (p3.y + cible3.y) / 2], ['pointermove', 1, cible3.x, cible3.y], ['pointerup', 1, cible3.x, cible3.y]]);
    pts = await p.evaluate(() => OutilDecoupe.points.map((q) => [Math.round(q.x), Math.round(q.y)]));
    verifier(pts.length === 4 && Math.abs(pts[2][0] - 520) <= 3 && Math.abs(pts[2][1] - 340) <= 3, 'un point se déplace en le faisant glisser', pts);
    await p.click('[data-action="decoupe-apercu"]');
    verifier(!(await p.$eval('#d-resultat', (el) => el.hidden)) && (await p.evaluate(() => Rendu.remplacements.size)) === 1, 'aperçu de la découpe avant validation');
    px = await pixel(p, corrigee, 50, 50, true);
    verifier(px[3] === 0, 'aperçu : l’extérieur devient transparent', px);
    await p.click('[data-action="decoupe-reprendre"]');
    verifier((await p.evaluate(() => OutilDecoupe.points.length)) === 4 && (await p.evaluate(() => Rendu.remplacements.size)) === 0, '« Reprendre le tracé » garde les points');
    await p.click('[data-action="decoupe-apercu"]');
    await p.click('[data-action="decoupe-valider"]');
    e = await etat(p);
    const decoupee = e.doc.calques[0].ressource;
    px = await pixel(p, decoupee, 50, 50);
    verifier(px[3] === 0, 'dehors : transparent', px);
    px = await pixel(p, decoupee, 300, 200);
    verifier(px[3] === 255, 'dedans : gardé', px);
    verifier((await texte(p, '#message-texte')).includes('PNG'), 'le message conseille le PNG pour la transparence');
    await p.click('[data-action="annuler"]');
    verifier((await etat(p)).doc.calques[0].ressource === corrigee, '« Annuler » annule la découpe');

    // ---- Tracé libre sur une image tournée et retournée, en gardant l'extérieur ----
    await donnerFichier(p, '[data-action="ajouter-image"]', { name: 'carre.jpg', mimeType: 'image/jpeg', buffer: await fabriquerImage(p, 300, 300) });
    await attendreFin(p);
    const carre = (await etat(p)).doc.calques[1];
    await p.evaluate((id) => Historique.action(() => Montage.modifier(id, { rotation: 30, miroirH: true, echelle: 1 })), carre.id);
    await p.click('#retouches-calque [data-action="outil-decoupe"]');
    verifier((await texte(p, '#outil-decoupe .nom-cible')).includes(carre.nom), 'découper depuis le calque choisi le prend pour cible', await texte(p, '#outil-decoupe .nom-cible'));
    await p.click('label.choix:has(input[value="libre"])');
    await p.click('label.choix:has(input[value="exterieur"])');
    // Un 2e doigt pendant le tracé : ce bout de trait est oublié
    const c0 = await versEcran(p, 150, 150);
    await doigts(p, [['pointerdown', 1, c0.x, c0.y], ['pointermove', 1, c0.x + 10, c0.y], ['pointerdown', 2, c0.x + 80, c0.y],
      ['pointermove', 2, c0.x + 100, c0.y], ['pointerup', 2, c0.x + 100, c0.y], ['pointerup', 1, c0.x + 10, c0.y]]);
    verifier((await p.evaluate(() => OutilDecoupe.points.length)) === 0, 'un 2e doigt transforme le trait en zoom (trait oublié)');
    await p.click('[data-action="voir-tout"]').catch(() => {});
    // Un cercle de rayon 80 autour du centre de l'image, en deux traits
    const cercle = [];
    for (let i = 0; i <= 48; i++) cercle.push(await versEcran(p, 150 + 80 * Math.cos(i / 48 * 2 * Math.PI), 150 + 80 * Math.sin(i / 48 * 2 * Math.PI)));
    const trait = (morceau) => [['pointerdown', 1, morceau[0].x, morceau[0].y], ...morceau.slice(1).map((q) => ['pointermove', 1, q.x, q.y]), ['pointerup', 1, morceau[morceau.length - 1].x, morceau[morceau.length - 1].y]];
    await doigts(p, trait(cercle.slice(0, 25)));
    await doigts(p, trait(cercle.slice(25)));
    const nb = await p.evaluate(() => [OutilDecoupe.points.length, OutilDecoupe.traits.length]);
    verifier(nb[0] > 20 && nb[1] === 2, 'le tracé reprend où il s’était arrêté (2 traits)', nb);
    // Fermer avec un tracé en cours : deux appuis
    await p.click('#outil-decoupe [data-action="outil-fermer"]');
    verifier(await p.evaluate(() => Editeur.outil === OutilDecoupe), 'fermer avec un tracé en cours demande un 2e appui');
    await p.waitForTimeout(4200);   // le bouton se désarme tout seul
    await p.click('[data-action="decoupe-apercu"]');
    await p.click('[data-action="decoupe-valider"]');
    e = await etat(p);
    const trou = e.doc.calques[1].ressource;
    px = await pixel(p, trou, 150, 150);
    verifier(px[3] === 0, 'garder l’extérieur : le centre est retiré', px);
    px = await pixel(p, trou, 10, 10);
    verifier(px[3] === 255, 'les coins sont gardés', px);
    px = await pixel(p, trou, 150, 60);
    verifier(px[3] === 255, 'juste hors du cercle : gardé (tracé juste malgré la rotation et le miroir)', px);
    px = await pixel(p, trou, 150, 80);
    verifier(px[3] === 0, 'juste dans le cercle : retiré', px);
    await t.ctx.close();
  });


  // ---------------- Étape 3 : détourage par IA, pinceau, nouveau fond ----------------
  await section('Détourage automatique par IA', async () => {
    const t = await nouvellePage();
    const p = t.p;
    await p.waitForFunction(() => document.body.dataset.pret === 'oui');
    await donnerFichier(p, '[data-action="ouvrir-galerie"]', { name: 'sujet.jpg', mimeType: 'image/jpeg', buffer: await fabriquerSujet(p) });
    await attendreFin(p);
    const photo = (await etat(p)).doc.calques[0];
    // On note chaque étape de la barre de progression
    await p.evaluate(() => { window._etapes = []; const f = Patience.avancer.bind(Patience); Patience.avancer = (x, t) => { window._etapes.push([x, t || '']); f(x, t); }; });
    await p.click('[data-action="outil-ia"]');
    await p.waitForTimeout(300);
    verifier(await p.$eval('#patience', (el) => !el.hidden) && !(await p.$eval('#patience-progression', (el) => el.hidden)), 'une barre de progression s’affiche');
    await attendreIA(p);
    const etapes = await p.evaluate(() => window._etapes);
    const fractions = etapes.map((e) => e[0]);
    verifier(fractions.every((f, i) => i === 0 || f >= fractions[i - 1] - 1e-9) && fractions[fractions.length - 1] === 1, 'la barre avance toujours et arrive à 100 %', fractions.map((f) => Math.round(f * 100)).join(','));
    const textes = [...new Set(etapes.map((e) => e[1]).filter(Boolean))];
    verifier(textes.some((x) => /Recherche du sujet/.test(x)) && textes.some((x) => /bords/.test(x)), 'les étapes sont expliquées', textes);
    verifier(await p.evaluate(() => !!OutilIA.apercu && Rendu.remplacements.size === 1), 'aperçu avant validation');
    let px = await pixel(p, photo.ressource, 300, 200, true);
    verifier(px[3] > 200, 'le sujet est gardé', px);
    px = await pixel(p, photo.ressource, 15, 15, true);
    const coin = px[3];
    verifier(coin < 40, 'le fond est retiré', px);
    px = await pixel(p, photo.ressource, 300, 200);
    verifier(px[3] === 255, 'la vraie photo n’est pas encore touchée');
    await p.click('[data-action="ia-comparer"]');
    verifier(await p.evaluate(() => Rendu.remplacements.size === 0), '« Voir l’original » compare');
    await p.click('[data-action="ia-comparer"]');
    await p.click('[data-action="ia-valider"]');
    let e = await etat(p);
    const detouree = e.doc.calques[0];
    verifier(detouree.ressource !== photo.ressource && detouree.source === photo.ressource && e.passe === 1, 'valider : nouvelle image, l’origine est gardée pour le pinceau');
    px = await pixel(p, detouree.ressource, 15, 15);
    verifier(px[3] < 40, 'le fond est transparent dans l’image', px);
    await p.click('[data-action="annuler"]');
    e = await etat(p);
    verifier(e.doc.calques[0].ressource === photo.ressource && !e.doc.calques[0].source, '« Annuler » rend la photo d’origine');
    await p.click('[data-action="retablir"]');

    // ---- Pinceau : gommer puis restaurer ----
    await p.click('[data-action="outil-pinceau"]');
    verifier(await p.evaluate(() => Editeur.outil === OutilPinceau && Rendu.fantomes.size === 1), 'le pinceau s’ouvre, le fond retiré est visible en transparence');
    await p.click('label.choix:has(input[value="gommer"])');
    await p.evaluate(() => { const r = document.querySelector('#p-taille'); r.value = 30; r.dispatchEvent(new Event('input', { bubbles: true })); });
    const centre = await versEcran(p, 300, 200), centre2 = await versEcran(p, 330, 200);
    await doigts(p, [['pointerdown', 1, centre.x, centre.y], ['pointermove', 1, (centre.x + centre2.x) / 2, centre.y], ['pointermove', 1, centre2.x, centre2.y], ['pointerup', 1, centre2.x, centre2.y]]);
    px = await pixel(p, detouree.ressource, 300, 200, true);
    verifier(px[3] < 10, 'la gomme rend le centre transparent', px);
    await p.click('[data-action="pinceau-retirer"]');
    px = await pixel(p, detouree.ressource, 300, 200, true);
    verifier(px[3] > 200, '« Retirer le dernier » annule ce coup de gomme', px);
    await p.click('label.choix:has(input[value="restaurer"])');
    const c1 = await versEcran(p, 15, 15), c2 = await versEcran(p, 40, 15);
    await doigts(p, [['pointerdown', 1, c1.x, c1.y], ['pointermove', 1, c2.x, c2.y], ['pointerup', 1, c2.x, c2.y]]);
    px = await pixel(p, detouree.ressource, 15, 15, true);
    verifier(px[3] > 240 && px[0] > 180, '« Restaurer » fait revenir la photo d’origine', px);
    // Un 2e doigt pendant un trait : c'est un zoom, le trait est oublié
    const n = await p.evaluate(() => OutilPinceau.traits.length);
    await doigts(p, [['pointerdown', 1, centre.x, centre.y], ['pointermove', 1, centre.x + 5, centre.y], ['pointerdown', 2, centre.x + 90, centre.y], ['pointermove', 2, centre.x + 120, centre.y], ['pointerup', 2, centre.x + 120, centre.y], ['pointerup', 1, centre.x + 5, centre.y]]);
    verifier((await p.evaluate(() => OutilPinceau.traits.length)) === n, 'deux doigts zooment sans peindre');
    await p.click('[data-action="pinceau-valider"]');
    e = await etat(p);
    const retouchee = e.doc.calques[0];
    px = await pixel(p, retouchee.ressource, 15, 15);
    verifier(px[3] > 240 && retouchee.source === photo.ressource && !(await p.evaluate(() => Editeur.outil)), 'pinceau validé, l’origine est toujours gardée');
    px = await pixel(p, retouchee.ressource, 585, 385);
    verifier(px[3] < 40, 'le reste du fond reste transparent', px);

    // ---- Nouveau fond ----
    await p.click('[data-action="ouvrir-fond"]');
    await p.waitForTimeout(200);
    verifier(await p.$eval('#fenetre-fond', (d) => d.open), 'la fenêtre « Nouveau fond » s’ouvre');
    verifier(await p.$eval('#b-conseil', (el) => el.hidden), 'pas d’avertissement : le sujet est détouré');
    await p.click('#b-zone-couleur .nuancier .pastille:nth-child(8)');
    e = await etat(p);
    verifier(e.doc.calques[0].type === 'fond' && e.doc.calques[0].couleur === '#4ea8de', 'un fond de couleur est posé tout en bas', e.doc.calques[0]);
    verifier(e.doc.calques[1].verrouille === false, 'le sujet devient déplaçable');
    await p.click('label.choix:has(input[name="b-mode"][value="degrade"])');
    verifier(!(await p.$eval('#b-zone-couleur2', (el) => el.hidden)), 'le dégradé propose une 2e couleur');
    await p.click('label.choix:has(input[value="rond"])');
    e = await etat(p);
    verifier(e.doc.calques[0].mode === 'degrade' && e.doc.calques[0].direction === 'rond', 'dégradé rond');
    await p.click('label.choix:has(input[name="b-mode"][value="photo"])');
    await donnerFichier(p, '[data-action="fond-photo"]', { name: 'plage.jpg', mimeType: 'image/jpeg', buffer: await fabriquerImage(p, 900, 600) });
    await attendreFin(p);
    e = await etat(p);
    verifier(e.doc.calques[0].mode === 'photo' && !!e.doc.calques[0].ressource, 'une photo de la galerie comme fond');
    const passeAvant = (await etat(p)).passe;
    await p.click('#fenetre-fond [data-action="fermer-fenetre"]');
    await p.waitForTimeout(300);
    e = await etat(p);
    verifier(e.passe === passeAvant + 1, 'tout le réglage du fond = une étape d’« Annuler »', e.passe - passeAvant);
    verifier(e.selection === e.doc.calques[1].id, 'le sujet est choisi pour être placé');
    // Déplacer et réduire le sujet sur son nouveau fond
    const s0 = e.doc.calques[1];
    const m = await ecranDe(p, s0.id);
    await doigts(p, [['pointerdown', 1, m.x, m.y], ['pointermove', 1, m.x + 20, m.y], ['pointermove', 1, m.x + 40, m.y + 10], ['pointerup', 1, m.x + 40, m.y + 10]]);
    const deplace = (await etat(p)).doc.calques[1];
    const vue = await p.evaluate(() => Editeur.vue.e);
    verifier(Math.abs(deplace.x - s0.x - 40 / vue) < 1, 'le sujet se déplace sur le nouveau fond', deplace.x - s0.x);
    await doigts(p, [['pointerdown', 1, m.x - 40, m.y], ['pointerdown', 2, m.x + 80, m.y], ['pointermove', 2, m.x + 20, m.y], ['pointerup', 2, m.x + 20, m.y], ['pointerup', 1, m.x - 40, m.y]]);
    const s1 = (await etat(p)).doc.calques[1];
    verifier(Math.abs(s1.echelle / s0.echelle - 0.5) < 0.02, 'pincer réduit le sujet', s1.echelle / s0.echelle);
    // Le fond se voit dans le fichier exporté, autour du sujet
    await p.click('[data-action="ouvrir-export"]');
    const [telechargement] = await Promise.all([p.waitForEvent('download'), p.click('[data-action="enregistrer"]')]);
    const b64 = fs.readFileSync(await telechargement.path()).toString('base64');
    const coins = await p.evaluate(async (b64) => {
      const img = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
      const c = new OffscreenCanvas(img.width, img.height); const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      return [...x.getImageData(img.width - 5, img.height - 5, 1, 1).data];
    }, b64);
    verifier(coins[3] === 255, 'le PNG exporté a le nouveau fond (plus de transparence)', coins);
    // Annuler le fond
    for (let i = 0; i < 3; i++) await p.click('[data-action="annuler"]');
    e = await etat(p);
    verifier(!e.doc.calques.some((c) => c.type === 'fond'), '« Annuler » retire le fond', e.doc.calques.map((c) => c.type));

    // ---- Sauvegarde : l'origine du sujet revient aussi ----
    for (let i = 0; i < 3; i++) await p.click('[data-action="retablir"]');
    await p.evaluate(() => Sauvegarde.maintenant());
    await p.reload();
    await p.waitForFunction(() => document.body.dataset.pret === 'oui');
    await p.click('[data-action="reprendre"]');
    await attendreFin(p);
    e = await etat(p);
    verifier(e.doc.calques[0].type === 'fond' && e.doc.calques[1].source && await p.evaluate((id) => !!Ressources.obtenir(id), e.doc.calques[1].source),
      'après réouverture : fond, sujet et image d’origine sont là');

    // ---- Arrêter pendant le calcul ----
    await p.evaluate(() => Montage.choisir(Montage.doc.calques[1].id));
    await p.click('#retouches-calque [data-action="outil-ia"]');
    await p.waitForSelector('#patience-arreter:not([hidden])');
    await p.click('#patience-arreter');
    await attendreIA(p);
    verifier((await texte(p, '#message-texte')).includes('arrêté') && !(await p.evaluate(() => Editeur.outil)), '« Arrêter » interrompt le détourage sans rien changer');

    // ---- Panne du moteur (manque de mémoire simulé) ----
    await p.evaluate(() => {
      Detourage._jeter();
      window._Worker = window.Worker;
      window.Worker = class { constructor() { setTimeout(() => this.onerror && this.onerror({ preventDefault() {} }), 30); } postMessage() {} terminate() {} };
    });
    const avantPanne = (await etat(p)).doc.calques[1].ressource;
    await p.click('[data-action="outil-ia"]:visible');
    await attendreIA(p);
    verifier((await texte(p, '#message-texte')).includes('mémoire') && (await etat(p)).doc.calques[1].ressource === avantPanne, 'panne de l’IA : message rassurant, photo intacte', await texte(p, '#message-texte'));
    await p.evaluate(() => { window.Worker = window._Worker; Detourage._jeter(); });
    await p.click('[data-action="fermer-message"]');
    await t.ctx.close();
  });

  await section('Détourage hors ligne et grande photo', async () => {
    const t = await nouvellePage();
    const p = t.p;
    await p.waitForFunction(() => document.body.dataset.pret === 'oui');
    // Le service worker range tout (modèle d'IA compris), puis on coupe internet
    const pret = await p.evaluate(() => Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((ok) => setTimeout(() => ok(false), 20000))]));
    await p.waitForFunction(async () => {
      const c = await caches.open((await caches.keys()).find((k) => k.startsWith('omni-photo-')));
      return !!(await c.match('./u2netp.onnx')) && !!(await c.match('./ort-wasm-simd-threaded.wasm'));
    }, null, { timeout: 60000 });
    verifier(pret, 'le modèle d’IA est rangé dans le téléphone');
    await p.reload();
    await p.waitForFunction(() => document.body.dataset.pret === 'oui');
    await t.ctx.setOffline(true);
    await p.reload();
    await p.waitForFunction(() => document.body.dataset.pret === 'oui');
    await donnerFichier(p, '[data-action="ouvrir-galerie"]', { name: 'grande.jpg', mimeType: 'image/jpeg', buffer: await fabriquerSujet(p, 6000, 4500) });
    await attendreFin(p);
    const photo = (await etat(p)).doc.calques[0];
    verifier(photo.largeur === 4096, 'grande photo réduite à 4 096 pixels pour rester fluide', photo.largeur);
    await p.click('[data-action="outil-ia"]');
    await attendreIA(p);
    const ok = await p.evaluate(() => !!OutilIA.apercu && [OutilIA.apercu.width, OutilIA.apercu.height]);
    verifier(ok && ok[0] === 4096 && ok[1] === 3072, 'sans internet, le détourage marche, en taille réelle (4 096 × 3 072)', ok || await texte(p, '#message-texte'));
    if (ok) {
      let px = await pixel(p, photo.ressource, 2048, 1536, true);
      verifier(px[3] > 200, 'grande photo : sujet gardé', px);
      px = await pixel(p, photo.ressource, 60, 60, true);
      verifier(px[3] < 40, 'grande photo : fond retiré', px);
    }
    await t.ctx.setOffline(false);
    await t.ctx.close();
  });

  await section('Page « À propos »', async () => {
    await p.click('[data-action="accueil"]');
    await attendre(p, 300);
    await p.click('[data-action="voir-apropos"]');
    await attendre(p, 300);
    const t = await texte(p, '[data-vue="apropos"]');
    verifier(t.includes('Ferrus Dantioch'), 'auteur : Ferrus Dantioch');
    verifier(t.includes('Application gratuite et sans publicité'), 'mention « Application gratuite et sans publicité »');
    verifier(/Version \d+\.\d+\.\d+/.test(t), 'numéro de version affiché');
    verifier(t.includes('Apache 2.0') && t.includes('Roboto Slab') && t.includes('Satisfy'), 'licences tierces listées');
    verifier(t.includes('ONNX Runtime Web') && t.includes('MIT') && t.includes('U²-Netp'), 'licences de l’IA listées');
    await p.goBack();
    await attendre(p, 300);
    verifier((await etat(p)).vue === 'accueil', 'le bouton retour du téléphone ramène à l’accueil');
  });
  await ctx.close();

  // ---------------- Tablette en paysage ----------------
  await section('Tablette en paysage', async () => {
    const t = await nouvellePage({ viewport: { width: 1280, height: 800 } });
    await t.p.waitForFunction(() => document.body.dataset.pret === 'oui');
    await t.p.click('[data-action="ouvrir-galerie"]');
    await donnerFichier(t.p, '[data-action="ouvrir-galerie"]', { name: 'p.jpg', mimeType: 'image/jpeg', buffer: await fabriquerImage(t.p, 800, 1200) });
    await attendreFin(t.p);
    const mesure = await t.p.evaluate(() => {
      const toile = document.querySelector('.zone-toile').getBoundingClientRect();
      const panneau = document.querySelector('#panneau').getBoundingClientRect();
      return { aDroite: panneau.left >= toile.right - 1, hauteurToile: toile.height, debord: document.documentElement.scrollWidth - innerWidth };
    });
    verifier(mesure.aDroite, 'les réglages sont à droite de la photo');
    verifier(mesure.hauteurToile > 600, 'la photo prend toute la hauteur', mesure.hauteurToile);
    verifier(mesure.debord <= 0, 'aucun défilement sur le côté');
    await t.ctx.close();
  });
});

function normaliser(a) { a = ((a % 360) + 360) % 360; return a > 180 ? a - 360 : a; }
