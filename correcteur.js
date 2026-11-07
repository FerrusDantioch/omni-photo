/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   Le correcteur : faire disparaître un petit défaut (bouton, poussière,
   fil électrique, petite tache…). Deux façons :

   - « Effacer un défaut » : on passe le doigt sur le défaut ; quand on
     lève le doigt, la zone est remplie à partir de ce qui l'entoure. On
     part du bord et on avance vers le centre (« épluchage »), chaque
     pixel prenant la moyenne de ses voisins déjà connus, puis on lisse et
     on ajoute un léger grain pour que ça ne fasse pas « plastique ».
     Idéal pour les petits défauts sur un fond assez uni (peau, ciel, mur).

   - « Copier une zone » (tampon) : un premier toucher choisit l'endroit
     à recopier, puis on peint sur le défaut : c'est la zone choisie qui
     apparaît. Pour les fonds plus compliqués (herbe, sable…).

   Comme les autres retouches : on travaille sur une copie (aperçu),
   « Retirer le dernier » refait tout sauf le dernier trait, et « Valider »
   range une nouvelle image (une étape d'« Annuler »). Pour un sujet
   détouré, la même correction est faite sur son image d'origine.
   ============================================================ */
'use strict';

const OutilCorrecteur = {
  panneau: 'outil-correcteur',
  calque: null,
  travail: null,          // la copie corrigée de l'image
  travailSource: null,    // la copie corrigée de l'image d'origine (sujet détouré)
  operations: [],         // [{ mode, rayon, points, dx, dy }]
  _trait: null,
  _instantane: null,      // l'image au début d'un trait « copier »
  _instantaneSource: null,
  pointSource: null,      // l'endroit à recopier (mode « copier »)
  voirOriginal: false,
  _curseur: null,

  commencer(c) {
    this.calque = c;
    this.travail = null;
    this.travailSource = null;
    this.operations = [];
    this._trait = null;
    this.pointSource = null;
    this.voirOriginal = false;
    this._curseur = null;
  },

  mode() {
    return ($('input[name="cr-mode"]:checked') || {}).value === 'copier' ? 'copier' : 'effacer';
  },

  aDuTravail() {
    return this.operations.length > 0;
  },

  /* Les copies de travail (au premier coup de pinceau seulement). */
  _preparer() {
    if (this.travail) return;
    this.travail = Retouche.copier(this.calque);
    const c = this.calque;
    if (c.source && Ressources.obtenir(c.source)) {
      const r = Ressources.obtenir(c.source);
      const { toile, ctx } = nouvelleToile(r.largeur, r.hauteur);
      ctx.drawImage(r.image, 0, 0);
      this.travailSource = toile;
    }
  },

  _copie(toile) {
    const { toile: t, ctx } = nouvelleToile(toile.width, toile.height);
    ctx.drawImage(toile, 0, 0);
    return t;
  },

  appui(p) {
    const c = this.calque;
    const point = Editeur.ecranVersCalque(c, p.x, p.y);
    const rayon = Math.max(1, Number($('#cr-taille').value) / Editeur.zoomCalque(c));
    if (this.mode() === 'copier') {
      // Premier toucher : on choisit l'endroit à recopier
      if (!this.pointSource) {
        this.pointSource = point;
        Message.montrer('Endroit à recopier choisi ✓ Maintenant, peins sur le défaut.');
        this._maj();
        this._trait = null;
        return true;
      }
      try { this._preparer(); } catch (e) { Message.erreur(MESSAGES_PHOTO.memoire); return false; }
      // L'image au début du trait : on recopie toujours depuis elle (sinon
      // le trait recopierait ce qu'il vient lui-même de peindre)
      this._instantane = this._copie(this.travail);
      this._instantaneSource = this.travailSource ? this._copie(this.travailSource) : null;
      this._trait = { mode: 'copier', rayon, points: [point], dx: this.pointSource.x - point.x, dy: this.pointSource.y - point.y };
      this._tamponCopie(this._trait, point);
    } else {
      try { this._preparer(); } catch (e) { Message.erreur(MESSAGES_PHOTO.memoire); return false; }
      this._trait = { mode: 'effacer', rayon, points: [point] };
    }
    this._curseur = p;
    this._maj();
    return true;
  },

  mouvement(p) {
    const t = this._trait;
    if (!t) return;
    const point = Editeur.ecranVersCalque(this.calque, p.x, p.y);
    const avant = t.points[t.points.length - 1];
    const d = Math.hypot(point.x - avant.x, point.y - avant.y);
    if (d < t.rayon * 0.2) return;
    t.points.push(point);
    if (t.mode === 'copier') {
      const n = Math.max(1, Math.ceil(d / Math.max(0.5, t.rayon * 0.25)));
      for (let k = 1; k <= n; k++) this._tamponCopie(t, { x: avant.x + ((point.x - avant.x) * k) / n, y: avant.y + ((point.y - avant.y) * k) / n });
    }
    this._curseur = p;
    this._maj();
  },

  relache() {
    const t = this._trait;
    this._trait = null;
    this._curseur = null;
    if (t) {
      if (t.mode === 'effacer') {
        try {
          this._appliquerEffacer(this.travail, t);
          if (this.travailSource) this._appliquerEffacer(this.travailSource, t);
        } catch (e) {
          console.warn(e);
          Message.erreur(MESSAGES_PHOTO.memoire);
        }
      }
      this.operations.push(t);
    }
    this._liberInstantanes();
    this.voirOriginal = false;
    this._maj();
  },

  /* Un 2e doigt : c'était un zoom. Le bout de trait est oublié. */
  interrompre() {
    const t = this._trait;
    this._trait = null;
    if (t && t.mode === 'copier' && this._instantane) {
      // On remet l'image comme au début du trait (« copy » : remplace tout,
      // transparence comprise)
      const remettre = (toile, modele) => {
        const ctx = toile.getContext('2d');
        ctx.globalCompositeOperation = 'copy';
        ctx.drawImage(modele, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
      };
      remettre(this.travail, this._instantane);
      if (this.travailSource && this._instantaneSource) remettre(this.travailSource, this._instantaneSource);
    }
    this._liberInstantanes();
    this._maj();
  },

  _liberInstantanes() {
    if (this._instantane) this._instantane.width = 0;
    if (this._instantaneSource) this._instantaneSource.width = 0;
    this._instantane = this._instantaneSource = null;
  },

  /* ---------- Copier une zone ---------- */

  /* Une touche du tampon : la zone d'origine, décalée, posée sous le doigt
     avec un bord doux. */
  _tamponCopie(t, point) {
    this._tamponSur(this.travail, this._instantane, t, point);
    if (this.travailSource && this._instantaneSource) this._tamponSur(this.travailSource, this._instantaneSource, t, point);
  },

  _tamponSur(cible, modele, t, point) {
    const r = Math.ceil(t.rayon), cote = r * 2;
    if (cote < 1) return;
    const { toile: morceau, ctx: m } = nouvelleToile(cote, cote);
    m.drawImage(modele, point.x + t.dx - r, point.y + t.dy - r, cote, cote, 0, 0, cote, cote);
    m.globalCompositeOperation = 'destination-in';
    const degrade = m.createRadialGradient(r, r, r * 0.45, r, r, r);
    degrade.addColorStop(0, 'rgba(0,0,0,1)');
    degrade.addColorStop(1, 'rgba(0,0,0,0)');
    m.fillStyle = degrade;
    m.fillRect(0, 0, cote, cote);
    const ctx = cible.getContext('2d');
    ctx.drawImage(morceau, point.x - r, point.y - r);
    morceau.width = 0;
  },

  /* ---------- Effacer un défaut ---------- */

  _appliquerEffacer(toile, t) {
    const W = toile.width, H = toile.height;
    // La boîte autour du trait (plus une marge : les pixels connus du bord)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of t.points) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const marge = t.rayon + 4;
    x0 = Math.max(0, Math.floor(x0 - marge)); y0 = Math.max(0, Math.floor(y0 - marge));
    x1 = Math.min(W, Math.ceil(x1 + marge)); y1 = Math.min(H, Math.ceil(y1 + marge));
    const l = x1 - x0, h = y1 - y0;
    if (l <= 2 || h <= 2) return;
    // Le masque : les pixels à remplir (le trait, épaissi au rayon du pinceau)
    const { toile: tm, ctx: cm } = nouvelleToile(l, h);
    cm.strokeStyle = '#000';
    cm.fillStyle = '#000';
    cm.lineCap = 'round';
    cm.lineJoin = 'round';
    cm.lineWidth = t.rayon * 2;
    cm.beginPath();
    t.points.forEach((p, i) => (i ? cm.lineTo(p.x - x0, p.y - y0) : cm.moveTo(p.x - x0, p.y - y0)));
    if (t.points.length === 1) { cm.arc(t.points[0].x - x0, t.points[0].y - y0, t.rayon, 0, Math.PI * 2); cm.fill(); } else cm.stroke();
    const dm = cm.getImageData(0, 0, l, h).data;
    tm.width = 0;
    const inconnu = new Uint8Array(l * h);
    let nInconnus = 0;
    for (let i = 0; i < l * h; i++) if (dm[i * 4 + 3] > 40) { inconnu[i] = 1; nInconnus++; }
    if (!nInconnus || nInconnus === l * h) return;

    const ctx = toile.getContext('2d', { willReadFrequently: true });
    const image = ctx.getImageData(x0, y0, l, h);
    const d = image.data;
    const px = new Float32Array(l * h * 4);
    for (let i = 0; i < d.length; i++) px[i] = d[i];

    // Le « grain » des pixels connus juste autour (pour ne pas faire lisse)
    let n = 0, s = 0, s2 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) {
      const k = y * l + x;
      if (inconnu[k]) continue;
      const voisin = (x > 0 && inconnu[k - 1]) || (x < l - 1 && inconnu[k + 1]) || (y > 0 && inconnu[k - l]) || (y < h - 1 && inconnu[k + l]);
      if (!voisin) continue;
      const v = (px[k * 4] + px[k * 4 + 1] + px[k * 4 + 2]) / 3;
      s += v; s2 += v * v; n++;
    }
    const grain = n ? Math.min(14, Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)) * 0.5) : 0;

    // 1. « Épluchage » : du bord vers le centre
    const connu = new Uint8Array(l * h);
    for (let i = 0; i < l * h; i++) connu[i] = inconnu[i] ? 0 : 1;
    let restants = nInconnus;
    const voisins = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (let tour = 0; restants > 0 && tour < l + h; tour++) {
      const nouveaux = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) {
        const k = y * l + x;
        if (connu[k]) continue;
        let somme = [0, 0, 0, 0], poids = 0;
        for (const [vx, vy] of voisins) {
          const xx = x + vx, yy = y + vy;
          if (xx < 0 || yy < 0 || xx >= l || yy >= h) continue;
          const kk = yy * l + xx;
          if (!connu[kk]) continue;
          const w = vx && vy ? 0.7 : 1;
          for (let c = 0; c < 4; c++) somme[c] += px[kk * 4 + c] * w;
          poids += w;
        }
        if (poids) nouveaux.push([k, somme.map((v) => v / poids)]);
      }
      if (!nouveaux.length) break;
      for (const [k, v] of nouveaux) { for (let c = 0; c < 4; c++) px[k * 4 + c] = v[c]; connu[k] = 1; restants--; }
    }

    // 2. Lissage (on moyenne avec les 4 voisins, seulement dans la zone)
    const iterations = Math.min(60, 10 + Math.round(t.rayon));
    for (let it = 0; it < iterations; it++) {
      for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) {
        const k = y * l + x;
        if (!inconnu[k]) continue;
        for (let c = 0; c < 4; c++) {
          let somme = 0, nb = 0;
          if (x > 0) { somme += px[(k - 1) * 4 + c]; nb++; }
          if (x < l - 1) { somme += px[(k + 1) * 4 + c]; nb++; }
          if (y > 0) { somme += px[(k - l) * 4 + c]; nb++; }
          if (y < h - 1) { somme += px[(k + l) * 4 + c]; nb++; }
          px[k * 4 + c] = somme / nb;
        }
      }
    }

    // 3. Un léger grain, puis on remet les pixels dans l'image
    for (let k = 0; k < l * h; k++) {
      if (!inconnu[k]) continue;
      const bruit = grain ? (Math.random() - 0.5) * 2 * grain : 0;
      for (let c = 0; c < 3; c++) d[k * 4 + c] = Math.round(limiter(px[k * 4 + c] + bruit, 0, 255));
      d[k * 4 + 3] = Math.round(limiter(px[k * 4 + 3], 0, 255));
    }
    ctx.putImageData(image, x0, y0);
  },

  /* ---------- Retirer, comparer, valider ---------- */

  retirerDernier() {
    if (!this.operations.length) return false;
    this.operations.pop();
    // On repart de l'image d'origine et on refait les autres traits
    const ops = this.operations;
    if (this.travail) this.travail.width = 0;
    if (this.travailSource) this.travailSource.width = 0;
    this.travail = this.travailSource = null;
    if (ops.length) {
      this._preparer();
      for (const t of ops) {
        if (t.mode === 'effacer') {
          this._appliquerEffacer(this.travail, t);
          if (this.travailSource) this._appliquerEffacer(this.travailSource, t);
        } else {
          this._instantane = this._copie(this.travail);
          this._instantaneSource = this.travailSource ? this._copie(this.travailSource) : null;
          this._tamponCopie(t, t.points[0]);
          for (let i = 1; i < t.points.length; i++) {
            const a = t.points[i - 1], b = t.points[i];
            const d = Math.hypot(b.x - a.x, b.y - a.y);
            const n = Math.max(1, Math.ceil(d / Math.max(0.5, t.rayon * 0.25)));
            for (let k = 1; k <= n; k++) this._tamponCopie(t, { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
          }
          this._liberInstantanes();
        }
      }
    }
    this._maj();
    return true;
  },

  basculerComparaison() {
    if (!this.operations.length) return;
    this.voirOriginal = !this.voirOriginal;
    this._maj();
  },

  choisirAutreSource() {
    this.pointSource = null;
    $('input[name="cr-mode"][value="copier"]').checked = true;
    Message.montrer('Touche l\'endroit à recopier.');
    this._maj();
  },

  valider() {
    if (!this.operations.length) { this.fermer(); return; }
    let source = null;
    if (this.travailSource) source = Ressources.depuisToile(this.travailSource);
    const toile = this.travail;
    this.travail = this.travailSource = null;
    Retouche.valider(this.calque, toile, { source });
    this.fermer();
    Message.montrer('Correction gardée ✓ « Annuler » permet de revenir en arrière.');
  },

  fermer() {
    if (this.travail) this.travail.width = 0;
    if (this.travailSource) this.travailSource.width = 0;
    this._liberInstantanes();
    this.travail = this.travailSource = null;
    this.operations = [];
    this.pointSource = null;
    Rendu.remplacements.clear();
    if (Editeur.outil === this) Editeur.choisirOutil(null);
  },

  _maj() {
    Rendu.remplacements.clear();
    if (this.travail && !this.voirOriginal) Rendu.remplacements.set(this.calque.ressource, this.travail);
    this.majPanneau();
    Historique.majBoutons();
    Editeur.redessiner();
  },

  majPanneau() {
    const n = this.operations.length;
    const copier = this.mode() === 'copier';
    $('#cr-etat').textContent = copier && !this.pointSource
      ? 'Touche d\'abord l\'endroit à recopier (une zone propre, qui ressemble au fond).'
      : (n === 0 ? (copier ? 'Peins sur le défaut : la zone choisie le recouvre.' : 'Passe le doigt sur le défaut, puis lève le doigt.')
        : (n === 1 ? '1 correction (aperçu).' : `${n} corrections (aperçu).`) + (this.voirOriginal ? ' Tu vois l\'original.' : ''));
    $('[data-action="correcteur-source"]').hidden = !copier || !this.pointSource;
    $('[data-action="correcteur-retirer"]').disabled = !n;
    $('[data-action="correcteur-comparer"]').disabled = !n;
    $('[data-action="correcteur-valider"]').disabled = !n;
    const b = $('[data-action="correcteur-comparer"] .texte-bouton');
    if (b) b.textContent = this.voirOriginal ? 'Voir la correction' : 'Voir l\'original';
    const s = $('#cr-taille').parentElement.querySelector('output');
    if (s) s.textContent = $('#cr-taille').value + ' px';
  },

  /* À l'écran : le pinceau, la zone peinte (mode « effacer ») et
     l'endroit recopié (mode « copier »). */
  dessiner(ctx) {
    const c = this.calque;
    if (!c) return;
    ctx.save();
    const t = this._trait;
    if (t && t.mode === 'effacer') {
      ctx.strokeStyle = 'rgba(167, 119, 255, 0.45)';
      ctx.fillStyle = 'rgba(167, 119, 255, 0.45)';
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.lineWidth = t.rayon * 2 * Editeur.zoomCalque(c);
      ctx.beginPath();
      t.points.forEach((q, i) => { const e = Editeur.calqueVersEcran(c, q.x, q.y); i ? ctx.lineTo(e.x, e.y) : ctx.moveTo(e.x, e.y); });
      if (t.points.length === 1) { const e = Editeur.calqueVersEcran(c, t.points[0].x, t.points[0].y); ctx.arc(e.x, e.y, t.rayon * Editeur.zoomCalque(c), 0, Math.PI * 2); ctx.fill(); }
      else ctx.stroke();
    }
    if (this.mode() === 'copier' && this.pointSource) {
      // La source suit le pinceau pendant le trait
      let s = this.pointSource;
      if (t && t.mode === 'copier') { const q = t.points[t.points.length - 1]; s = { x: q.x + t.dx, y: q.y + t.dy }; }
      const e = Editeur.calqueVersEcran(c, s.x, s.y);
      const r = Number($('#cr-taille').value);
      traitDouble(ctx, () => { ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.moveTo(e.x - 8, e.y); ctx.lineTo(e.x + 8, e.y); ctx.moveTo(e.x, e.y - 8); ctx.lineTo(e.x, e.y + 8); }, 2);
    }
    let centre = this._curseur;
    if (!centre && this._reglage) { const z = Editeur.toile.parentElement; centre = { x: z.clientWidth / 2, y: z.clientHeight / 2 }; }
    if (centre) traitDouble(ctx, () => { ctx.beginPath(); ctx.arc(centre.x, centre.y, Number($('#cr-taille').value), 0, Math.PI * 2); }, 2);
    ctx.restore();
  },

  montrerReglage() {
    this._reglage = true;
    clearTimeout(this._minuteurReglage);
    this._minuteurReglage = setTimeout(() => { this._reglage = false; Editeur.redessiner(); }, 1500);
    this._maj();
  }
};
