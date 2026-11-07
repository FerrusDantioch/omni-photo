/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   Imprimer : le montage posé sur une feuille de vraie taille (photo
   10 × 15, 13 × 18, A5 ou A4), une ou plusieurs fois.

   - « Imprimer… » ouvre l'impression du téléphone (une imprimante, ou
     « Enregistrer au format PDF »).
   - « Enregistrer en PDF » / « Partager le PDF » : un fichier PDF aux
     dimensions exactes de la feuille, pour un magasin photo ou pour
     imprimer plus tard. Le PDF est fabriqué ici même (quelques lignes de
     texte autour d'une image JPG) : aucune bibliothèque, rien n'est
     envoyé sur internet.

   La feuille est d'abord dessinée dans une image (entre 150 et 300
   points par pouce) : l'impression et le PDF utilisent la même.
   (Le blanc pur, ici, est celui du papier, pas de l'interface.)
   ============================================================ */
'use strict';

const PAPIERS = {
  '10x15': { nom: 'Photo 10 × 15', l: 100, h: 150 },
  '13x18': { nom: 'Photo 13 × 18', l: 127, h: 178 },
  a5: { nom: 'A5', l: 148, h: 210 },
  a4: { nom: 'A4', l: 210, h: 297 }
};

/* Combien d'exemplaires → colonnes × lignes */
const GRILLES_IMPRESSION = { 1: [1, 1], 2: [1, 2], 4: [2, 2], 9: [3, 3] };

const MM_PAR_POUCE = 25.4;

/* Où poser chaque exemplaire sur la feuille (en millimètres).
   « rapport » = largeur / hauteur du montage. On essaie la feuille en
   hauteur et en largeur, et la grille dans les deux sens : on garde ce
   qui donne la plus grande image (ou, en « remplir », ce qui coupe le
   moins). */
function miseEnPage(papier, nombre, rapport, { remplir = false, marge = true } = {}) {
  const p = PAPIERS[papier] || PAPIERS.a4;
  const [a, b] = GRILLES_IMPRESSION[nombre] || GRILLES_IMPRESSION[1];
  const m = marge ? 5 : 0;
  const ecart = a * b > 1 ? 4 : 0;
  let meilleure = null;
  for (const paysage of [false, true]) {
    const L = paysage ? p.h : p.l, H = paysage ? p.l : p.h;
    for (const [col, lig] of [[a, b], [b, a]]) {
      const cl = (L - 2 * m - (col - 1) * ecart) / col, ch = (H - 2 * m - (lig - 1) * ecart) / lig;
      if (cl <= 0 || ch <= 0) continue;
      const il = Math.min(cl, ch * rapport), ih = il / rapport;
      const note = remplir ? Math.min(cl / ch, rapport) / Math.max(cl / ch, rapport) : il * ih;
      if (!meilleure || note > meilleure.note + 1e-9) meilleure = { note, L, H, col, lig, cl, ch, paysage };
    }
  }
  const { L, H, col, lig, cl, ch, paysage } = meilleure;
  const ox = (L - (col * cl + (col - 1) * ecart)) / 2, oy = (H - (lig * ch + (lig - 1) * ecart)) / 2;
  const cases = [], images = [];
  for (let r = 0; r < lig; r++) {
    for (let k = 0; k < col; k++) {
      const x = ox + k * (cl + ecart), y = oy + r * (ch + ecart);
      cases.push({ x, y, l: cl, h: ch });
      // L'image entière, centrée dans sa case… ou agrandie pour la remplir
      const il = remplir ? Math.max(cl, ch * rapport) : Math.min(cl, ch * rapport);
      const ih = il / rapport;
      images.push({ x: x + (cl - il) / 2, y: y + (ch - ih) / 2, l: il, h: ih });
    }
  }
  return { papier: p, L, H, paysage, cases, images, remplir };
}

/* Un PDF d'une page de « largeurMm × hauteurMm », couverte par une
   image JPG (« jpeg » : ses octets). */
function fabriquerPDF(jpeg, pxL, pxH, largeurMm, hauteurMm, titre = 'Omni-Photo') {
  const pt = (mm) => ((mm * 72) / MM_PAR_POUCE).toFixed(2);
  const W = pt(largeurMm), H = pt(hauteurMm);
  const encodeur = new TextEncoder();
  const morceaux = [];
  let taille = 0;
  const ajouter = (x) => {
    const octets = typeof x === 'string' ? encodeur.encode(x) : x;
    morceaux.push(octets);
    taille += octets.length;
  };
  const positions = [];
  // En-tête (la 2e ligne, binaire, dit aux logiciels que le fichier n'est pas du texte)
  ajouter('%PDF-1.4\n');
  ajouter(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  const objet = (n, texte) => { positions[n] = taille; ajouter(`${n} 0 obj\n${texte}\nendobj\n`); };
  objet(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objet(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objet(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] ` +
    '/Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>');
  positions[4] = taille;
  ajouter(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pxL} /Height ${pxH} /ColorSpace /DeviceRGB ` +
    `/BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  ajouter(jpeg);
  ajouter('\nendstream\nendobj\n');
  const dessin = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
  positions[5] = taille;
  ajouter(`5 0 obj\n<< /Length ${dessin.length} >>\nstream\n${dessin}\nendstream\nendobj\n`);
  // Le titre, en UTF-16 (pour les accents)
  let hex = 'FEFF';
  for (let i = 0; i < titre.length; i++) hex += titre.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  objet(6, `<< /Title <${hex}> /Producer (Omni-Photo) /Creator (Omni-Photo) >>`);
  // La table des positions : chaque ligne fait exactement 20 caractères
  const debutTable = taille;
  ajouter('xref\n0 7\n0000000000 65535 f \n' +
    positions.slice(1).map((p) => String(p).padStart(10, '0') + ' 00000 n \n').join(''));
  ajouter(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${debutTable}\n%%EOF\n`);
  return new Blob(morceaux, { type: 'application/pdf' });
}

const Impression = {
  enCours: false,
  _pret: null,          // la dernière feuille fabriquée { empreinte, blob, mp, pdf }
  _miniature: null,
  _url: null,

  initialiser() {
    const f = $('#fenetre-impression');
    f.addEventListener('input', () => this.apercu());
    f.addEventListener('change', () => { this._retenir(); this.apercu(); });
    f.addEventListener('close', () => { if (this._miniature) this._miniature.width = 0; this._miniature = null; });
    $('[data-action="partager-pdf"]').hidden = !this._peutPartager();
    // Les derniers choix (papier, nombre…)
    try {
      const r = JSON.parse(localStorage.getItem('omniphoto-impression') || 'null');
      if (r) {
        const p = $(`input[name="i-papier"][value="${r.papier}"]`); if (p) p.checked = true;
        const n = $(`input[name="i-nombre"][value="${r.nombre}"]`); if (n) n.checked = true;
        $('#i-remplir').checked = !!r.remplir;
        $('#i-marge').checked = r.marge !== false;
      }
    } catch (e) { /* sans gravité : on garde les choix de départ */ }
  },

  _retenir() {
    try { localStorage.setItem('omniphoto-impression', JSON.stringify(this.reglages())); } catch (e) { /* sans gravité */ }
  },

  reglages() {
    return {
      papier: ($('input[name="i-papier"]:checked') || {}).value || 'a4',
      nombre: Number(($('input[name="i-nombre"]:checked') || {}).value) || 1,
      remplir: $('#i-remplir').checked,
      marge: $('#i-marge').checked
    };
  },

  _miseEnPage() {
    const r = this.reglages(), d = Montage.doc;
    return miseEnPage(r.papier, r.nombre, d.largeur / d.hauteur, r);
  },

  /* Les points par pouce de l'image imprimée (sa finesse). */
  pointsParPouce(mp) {
    return Montage.doc.largeur / (mp.images[0].l / MM_PAR_POUCE);
  },

  ouvrir() {
    if (!Montage.doc) return;
    if ($('#fenetre-export').open) $('#fenetre-export').close();
    // Une petite image du montage, pour l'aperçu de la feuille
    const d = Montage.doc;
    const f = 360 / Math.max(d.largeur, d.hauteur);
    const { toile, ctx } = nouvelleToile(Math.max(1, Math.round(d.largeur * f)), Math.max(1, Math.round(d.hauteur * f)));
    ctx.setTransform(f, 0, 0, f, 0, 0);
    Rendu.dessinerMontage(ctx, d, { ecran: true, zoom: f, miniature: true });
    this._miniature = toile;
    $('#fenetre-impression').showModal();
    this.apercu();
  },

  /* Dessine une feuille (aperçu ou vraie feuille) : le papier, puis
     l'image dans chaque case. */
  _dessinerFeuille(ctx, mp, image, f, papier) {
    ctx.fillStyle = papier;
    ctx.fillRect(0, 0, mp.L * f, mp.H * f);
    mp.cases.forEach((k, i) => {
      const im = mp.images[i];
      ctx.save();
      ctx.beginPath();
      ctx.rect(k.x * f, k.y * f, k.l * f, k.h * f);
      ctx.clip();
      ctx.drawImage(image, im.x * f, im.y * f, im.l * f, im.h * f);
      ctx.restore();
    });
  },

  apercu() {
    const fenetre = $('#fenetre-impression');
    if (!fenetre.open || !this._miniature) return;
    const mp = this._miseEnPage();
    const toile = $('#i-apercu');
    const f = Math.min(240 / mp.L, 200 / mp.H);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    toile.style.width = Math.round(mp.L * f) + 'px';
    toile.style.height = Math.round(mp.H * f) + 'px';
    toile.width = Math.round(mp.L * f * dpr);
    toile.height = Math.round(mp.H * f * dpr);
    const ctx = toile.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    this._dessinerFeuille(ctx, mp, this._miniature, f * dpr, '#f3f0ea');
    // Taille et finesse de l'image imprimée
    const ppp = this.pointsParPouce(mp);
    const cm = (mm) => (mm / 10).toFixed(1).replace('.', ',').replace(',0', '');
    const im = mp.images[0];
    const k = mp.cases[0];
    const taille = mp.remplir ? `${cm(k.l)} × ${cm(k.h)} cm` : `${cm(im.l)} × ${cm(im.h)} cm`;
    let qualite;
    if (ppp >= 250) qualite = 'excellente';
    else if (ppp >= 150) qualite = 'bonne';
    else if (ppp >= 100) qualite = 'correcte (un peu douce de près)';
    else qualite = 'faible : l\'image risque d\'être floue. Choisis un papier plus petit, ou plusieurs exemplaires';
    $('#i-qualite').textContent = `${mp.papier.nom}${mp.paysage ? ' (en largeur)' : ''} · chaque image : ${taille} · qualité ${qualite}.`;
    $('#i-qualite').classList.toggle('alerte', ppp < 100);
  },

  /* La vraie feuille, en image JPG (gardée tant que rien ne change). */
  async _feuille() {
    const r = this.reglages();
    const empreinte = Montage.copie() + JSON.stringify(r);
    if (this._pret && this._pret.empreinte === empreinte) return this._pret;
    await Polices.pret;
    const doc = Montage.doc;
    const mp = this._miseEnPage();
    // Entre 150 et 300 points par pouce : assez fin, sans gaspiller la mémoire
    const ppp = limiter(this.pointsParPouce(mp), 150, 300);
    const f = ppp / MM_PAR_POUCE;   // pixels par millimètre
    const pl = Math.round(mp.L * f), ph = Math.round(mp.H * f);
    const im = mp.images[0];
    const il = Math.max(1, Math.round(im.l * f)), ih = Math.max(1, Math.round(im.h * f));
    let feuille, montage;
    try {
      montage = nouvelleToile(il, ih).toile;
      const cm = montage.getContext('2d');
      cm.setTransform(il / doc.largeur, 0, 0, ih / doc.hauteur, 0, 0);
      cm.imageSmoothingQuality = 'high';
      Rendu.dessinerMontage(cm, doc, { ecran: false });
      feuille = nouvelleToile(pl, ph).toile;
      const ctx = feuille.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      this._dessinerFeuille(ctx, mp, montage, f, '#ffffff');
      const blob = await new Promise((ok) => feuille.toBlob(ok, 'image/jpeg', 0.92));
      if (!blob || !blob.size) throw new Error('memoire');
      this._pret = { empreinte, blob, mp, pl, ph, pdf: null };
      return this._pret;
    } finally {
      if (montage) montage.width = montage.height = 0;
      if (feuille) feuille.width = feuille.height = 0;
    }
  },

  async _preparer(avecPDF) {
    if (this.enCours) return null;
    this.enCours = true;
    Patience.montrer('Préparation de la feuille…');
    await laisserAfficher();
    try {
      const p = await this._feuille();
      if (avecPDF && !p.pdf) {
        const jpeg = new Uint8Array(await p.blob.arrayBuffer());
        p.pdf = fabriquerPDF(jpeg, p.pl, p.ph, p.mp.L, p.mp.H, 'Omni-Photo — ' + (Montage.nom || 'montage'));
      }
      return p;
    } catch (e) {
      console.warn(e);
      if ($('#fenetre-impression').open) $('#fenetre-impression').close();
      Message.erreur('Ton téléphone manque de mémoire pour préparer la feuille. Ferme quelques applications, ' +
        'ou choisis un papier plus petit, puis réessaie. Ton montage est intact.');
      return null;
    } finally {
      this.enCours = false;
      Patience.cacher();
    }
  },

  /* « Imprimer… » : l'impression du téléphone, avec la feuille seule
     (styles.css cache tout le reste à l'impression). */
  async imprimer() {
    const p = await this._preparer(false);
    if (!p) return;
    if (this._url) URL.revokeObjectURL(this._url);
    this._url = URL.createObjectURL(p.blob);
    const image = $('#impression img');
    image.src = this._url;
    image.style.width = p.mp.L + 'mm';
    image.style.height = p.mp.H + 'mm';
    $('#style-impression').textContent = `@page { size: ${p.mp.L}mm ${p.mp.H}mm; margin: 0; }`;
    try { await image.decode(); } catch (e) { /* l'impression attendra l'image */ }
    $('#fenetre-impression').close();
    Message.cacher();
    // L'image reste en place après : sur Android, l'impression se prépare
    // un peu plus tard, pendant que la fenêtre d'impression est ouverte.
    window.print();
  },

  _nom() {
    return nomDeFichier('pdf');
  },

  async enregistrerPDF() {
    const p = await this._preparer(true);
    if (!p) return;
    const nom = this._nom();
    telechargerFichier(p.pdf, nom);
    $('#fenetre-impression').close();
    Message.montrer(`PDF enregistré : ${nom} (${Export._poids(p.pdf.size)}), dans « Téléchargements ». ` +
      'Ouvre-le pour l\'imprimer, ou envoie-le à un magasin photo.');
  },

  _peutPartager() {
    try {
      return !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'essai.pdf', { type: 'application/pdf' })] }));
    } catch (e) {
      return false;
    }
  },

  async partagerPDF() {
    // Comme pour l'export : si la préparation a été longue, le téléphone
    // demande de toucher une 2e fois (la feuille déjà prête est gardée).
    const p = await this._preparer(true);
    if (!p) return;
    try {
      await navigator.share({ files: [new File([p.pdf], this._nom(), { type: 'application/pdf' })], title: 'Omni-Photo' });
      $('#fenetre-impression').close();
    } catch (e) {
      if (e && e.name === 'NotAllowedError') {
        Message.montrer('Ta feuille est prête : touche encore une fois « Partager le PDF ».');
      } else if (e && e.name !== 'AbortError') {
        Message.erreur('Le partage n\'a pas marché. Utilise plutôt « Enregistrer en PDF ».');
      }
    }
  }
};
