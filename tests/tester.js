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

lancer('Omni-Photo', async () => {
  if (!process.env.RAPIDE) await controlesCommuns({ serviceWorker: 'sw.js' });

  await section('Fichiers du dépôt', async () => {
    for (const f of ['README.md', 'LICENCES-TIERS.md', 'LICENCE-APACHE-2.0.txt', 'LICENSE']) {
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
