/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   Le collage : 2 à 9 photos dans une grille, avec des marges, des coins
   arrondis et une couleur de fond.

   On choisit les photos, puis la disposition, le format et les réglages
   (aperçu en direct). « Créer » fabrique un nouveau montage : un fond de
   couleur (calque « fond », modifiable ensuite) et une image par case.
   Chaque image est recadrée pour remplir sa case (sans déformation),
   avec ses coins arrondis ; ensuite, c'est un calque comme les autres
   (on peut la déplacer, ajouter des textes par-dessus…).
   ============================================================ */
'use strict';

/* Une grille régulière : « colonnes » × « lignes » cases (en parts de 1). */
function grilleCases(colonnes, lignes, nombre = colonnes * lignes) {
  const cases = [];
  for (let j = 0; j < lignes; j++) {
    for (let i = 0; i < colonnes; i++) {
      if (cases.length < nombre) cases.push([i / colonnes, j / lignes, 1 / colonnes, 1 / lignes]);
    }
  }
  return cases;
}

/* Les dispositions proposées, selon le nombre de photos.
   Une case = [gauche, haut, largeur, hauteur], en parts de l'image. */
function dispositionsCollage(n) {
  const t = 1 / 3;
  switch (n) {
    case 2: return [
      { id: 'cote', nom: 'Côte à côte', cases: grilleCases(2, 1) },
      { id: 'dessus', nom: 'L\'une sur l\'autre', cases: grilleCases(1, 2) }
    ];
    case 3: return [
      { id: 'grande-gauche', nom: 'Une grande à gauche', cases: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
      { id: 'grande-haut', nom: 'Une grande en haut', cases: [[0, 0, 1, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
      { id: 'colonnes', nom: 'Trois colonnes', cases: grilleCases(3, 1) },
      { id: 'lignes', nom: 'Trois bandes', cases: grilleCases(1, 3) }
    ];
    case 4: return [
      { id: 'grille', nom: 'Grille', cases: grilleCases(2, 2) },
      { id: 'grande-gauche', nom: 'Une grande à gauche', cases: [[0, 0, 0.6, 1], [0.6, 0, 0.4, t], [0.6, t, 0.4, t], [0.6, 2 * t, 0.4, t]] },
      { id: 'grande-haut', nom: 'Une grande en haut', cases: [[0, 0, 1, 0.6], [0, 0.6, t, 0.4], [t, 0.6, t, 0.4], [2 * t, 0.6, t, 0.4]] }
    ];
    case 5: return [
      { id: 'deux-trois', nom: 'Deux et trois', cases: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, t, 0.5], [t, 0.5, t, 0.5], [2 * t, 0.5, t, 0.5]] },
      { id: 'grande-gauche', nom: 'Une grande à gauche', cases: [[0, 0, 0.5, 1], [0.5, 0, 0.25, 0.5], [0.75, 0, 0.25, 0.5], [0.5, 0.5, 0.25, 0.5], [0.75, 0.5, 0.25, 0.5]] }
    ];
    case 6: return [
      { id: 'grille-3-2', nom: 'Trois sur deux', cases: grilleCases(3, 2) },
      { id: 'grille-2-3', nom: 'Deux sur trois', cases: grilleCases(2, 3) }
    ];
    default: return [
      { id: 'grille-3-3', nom: 'Grille', cases: grilleCases(3, 3, n) },
      { id: 'grande-haut', nom: 'Une grande en haut', cases: [[0, 0, 1, 0.5], ...grilleCases(Math.ceil((n - 1) / 2), 2, n - 1).map(([x, y, l, h]) => [x, 0.5 + y / 2, l, h / 2])] }
    ];
  }
}

const FORMATS_COLLAGE = {
  carre: [2048, 2048], portrait: [1638, 2048], story: [1152, 2048], paysage: [2048, 1152]
};

const Collage = {
  _photos: [],      // les images choisies (déjà ouvertes)

  /* Les photos viennent d'être choisies (galerie, ou menu « Partager »). */
  async depuisFichiers(fichiers) {
    fichiers = [...(fichiers || [])].filter((f) => f && f.size);
    if (fichiers.length < 2) {
      if (fichiers.length === 1) Message.montrer('Pour un collage, choisis au moins 2 photos (garde le doigt appuyé sur une photo pour en choisir plusieurs).');
      return;
    }
    let trop = false;
    if (fichiers.length > 9) { fichiers = fichiers.slice(0, 9); trop = true; }
    // Moins de place par photo quand il y en a beaucoup : on les ouvre plus petites
    const maxCote = fichiers.length <= 2 ? 2048 : (fichiers.length <= 4 ? 1600 : 1200);
    Patience.montrer('Ouverture des photos…', { progression: true });
    await laisserAfficher();
    this._liberer();
    try {
      for (let i = 0; i < fichiers.length; i++) {
        Patience.avancer(i / fichiers.length, `Ouverture des photos… (${i + 1} sur ${fichiers.length})`);
        this._photos.push(await decoderImage(fichiers[i], maxCote));
      }
    } catch (e) {
      console.warn(e);
      this._liberer();
      Patience.cacher();
      Message.erreur(e instanceof ErreurPhoto ? e.message : MESSAGES_PHOTO.lecture);
      return;
    }
    Patience.cacher();
    this._remplirDispositions();
    $('#fenetre-collage').showModal();
    this.apercu();
    if (trop) Message.montrer('Un collage a 9 photos au plus : les 9 premières sont gardées.');
  },

  _liberer() {
    for (const p of this._photos) {
      if (p.image && p.image.close) p.image.close();
      else if (p.image) p.image.width = 0;
    }
    this._photos = [];
  },

  /* Les choix de disposition, chacun avec un petit dessin. */
  _remplirDispositions() {
    const zone = $('#co-dispositions');
    zone.textContent = '';
    dispositionsCollage(this._photos.length).forEach((d, i) => {
      const label = document.createElement('label');
      label.className = 'choix choix-disposition';
      const rects = d.cases.map(([x, y, l, h]) =>
        `<rect x="${x * 30 + 1}" y="${y * 30 + 1}" width="${l * 30 - 2}" height="${h * 30 - 2}" rx="1.5"/>`).join('');
      label.innerHTML = `<input type="radio" name="co-disposition" value="${d.id}"${i === 0 ? ' checked' : ''}>` +
        `<span><svg viewBox="0 0 30 30" width="44" height="44" aria-hidden="true" class="mini-disposition">${rects}</svg><small>${d.nom}</small></span>`;
      zone.append(label);
    });
  },

  _reglages() {
    const n = this._photos.length;
    const d = dispositionsCollage(n).find((x) => x.id === ($('input[name="co-disposition"]:checked') || {}).value) || dispositionsCollage(n)[0];
    const format = ($('input[name="co-format"]:checked') || {}).value || 'carre';
    return {
      cases: d.cases,
      taille: FORMATS_COLLAGE[format] || FORMATS_COLLAGE.carre,
      marge: Number($('#co-marge').value) / 100,       // part du petit côté
      arrondi: Number($('#co-arrondi').value) / 100,   // part du demi petit côté d'une case
      couleur: $('#co-couleur').value
    };
  },

  /* Les cases en pixels, pour une image de L × H. */
  _cases(r, L, H) {
    const m = r.marge * Math.min(L, H);
    return r.cases.map(([x, y, l, h]) => ({
      x: m + x * (L - m), y: m + y * (H - m),
      l: Math.max(1, l * (L - m) - m), h: Math.max(1, h * (H - m) - m)
    }));
  },

  /* Dessine une photo dans sa case : elle la remplit (en coupant ce qui
     dépasse), coins arrondis. */
  _dessinerCase(ctx, photo, k, arrondi) {
    const e = Math.max(k.l / photo.largeur, k.h / photo.hauteur);
    const l = photo.largeur * e, h = photo.hauteur * e;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(k.x, k.y, k.l, k.h, arrondi * Math.min(k.l, k.h) / 2);
    ctx.clip();
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(photo.image, k.x + (k.l - l) / 2, k.y + (k.h - h) / 2, l, h);
    ctx.restore();
  },

  /* L'aperçu dans la fenêtre. */
  apercu() {
    if (!this._photos.length) return;
    for (const el of $$('#fenetre-collage input[type="range"]')) el.parentElement.querySelector('output').textContent = el.value + ' %';
    const r = this._reglages();
    const toile = $('#co-apercu');
    const f = 260 / Math.max(r.taille[0], r.taille[1]);
    const L = Math.round(r.taille[0] * f), H = Math.round(r.taille[1] * f);
    toile.width = L;
    toile.height = H;
    const ctx = toile.getContext('2d');
    ctx.fillStyle = r.couleur;
    ctx.fillRect(0, 0, L, H);
    this._cases(r, L, H).forEach((k, i) => { if (this._photos[i]) this._dessinerCase(ctx, this._photos[i], k, r.arrondi); });
  },

  /* « Créer le collage » : un nouveau montage. */
  async creer() {
    if (!this._photos.length) return;
    const r = this._reglages();
    const [L, H] = r.taille;
    this._enCreation = true;          // fermer la fenêtre ne doit pas jeter les photos
    $('#fenetre-collage').close();
    Patience.montrer('Fabrication du collage…');
    await laisserAfficher();
    try {
      await Accueil._rangerCourant();
      Montage.nouveau(L, H);
      Montage.nom = 'Collage du ' + nomParDefaut().replace(/^Montage du /, '');
      const d = Montage.doc;
      d.calques.push({
        id: nouvelId('c'), type: 'fond', nom: 'Nouveau fond', mode: 'couleur', couleur: r.couleur, couleur2: '#a777ff', direction: 'vertical',
        x: L / 2, y: H / 2, largeur: L, hauteur: H, echelle: 1, rotation: 0, miroirH: false, miroirV: false, opacite: 1, visible: true, verrouille: true
      });
      this._cases(r, L, H).forEach((k, i) => {
        const photo = this._photos[i];
        if (!photo) return;
        const l = Math.round(k.l), h = Math.round(k.h);
        const { toile, ctx } = nouvelleToile(l, h);
        this._dessinerCase(ctx, photo, { x: 0, y: 0, l, h }, r.arrondi);
        const id = Ressources.depuisToile(toile);
        const c = Montage.ajouterImage(id, l, h, { nom: 'Photo ' + (i + 1) });
        Object.assign(c, { x: k.x + k.l / 2, y: k.y + k.h / 2, echelle: 1 });
      });
      Montage.selection = null;
      Montage.signaler();
      Historique.vider();
      Historique.nettoyer();
      Sauvegarde.programmer();
      allerVers('editeur');
      Message.montrer('Collage prêt ✓ Ajoute des textes, ou touche une photo pour la déplacer. « Fond » change la couleur du fond.');
    } catch (e) {
      console.warn(e);
      Message.erreur(MESSAGES_PHOTO.memoire);
    } finally {
      this._enCreation = false;
      this._liberer();
      Patience.cacher();
    }
  },

  /* La fenêtre est fermée sans créer : on libère la mémoire. */
  annuler() {
    if (!this._enCreation) this._liberer();
  }
};
