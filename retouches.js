/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   Les retouches de l'image d'un calque :
   - les yeux rouges (OutilYeux) ;
   - la découpe manuelle d'une silhouette (OutilDecoupe).

   Principe commun :
   1. on choisit l'image à retoucher (le calque image choisi, sinon la
      photo de fond) ;
   2. on travaille sur une COPIE, montrée à l'écran comme aperçu
      (Rendu.remplacements) ;
   3. « Valider » range la copie comme nouvelle image (nouvelle
      ressource) : « Annuler » peut donc toujours revenir en arrière.
   Pendant la retouche : un doigt pour l'outil, deux doigts pour zoomer.
   ============================================================ */
'use strict';

const Retouche = {
  /* L'image à retoucher : le calque image choisi, sinon l'image la plus
     basse (la photo de départ). null s'il n'y a aucune image. */
  cible() {
    const c = Montage.calqueChoisi();
    if (c && c.type === 'image' && c.visible) return c;
    return Montage.doc.calques.find((x) => x.type === 'image' && x.visible) || null;   // (un « fond » n'est pas une image)
  },

  /* Une copie modifiable de l'image d'un calque. */
  copier(c) {
    const r = Ressources.obtenir(c.ressource);
    if (!r) throw erreurPhoto('lecture');
    const { toile, ctx } = nouvelleToile(r.largeur, r.hauteur);
    ctx.drawImage(r.image, 0, 0);
    return toile;
  },

  /* Ouvre un outil sur l'image du bon calque. Renvoie faux s'il n'y a
     pas d'image à retoucher. */
  ouvrir(outil, calque) {
    if (Editeur.outil) Editeur.outil.fermer(true);
    const c = calque || this.cible();
    if (!c) {
      Message.erreur('Il n\'y a aucune image à retoucher. Ouvre d\'abord une photo, ou ajoute une image.');
      return false;
    }
    Historique.fin();
    outil.commencer(c);
    Editeur.choisirOutil(outil);
    $$('.nom-cible').forEach((el) => { el.textContent = 'Image retouchée : ' + c.nom; });
    return true;
  },

  /* Range l'image retouchée et la met à la place de l'ancienne
     (une étape d'« Annuler »).
     « garderSource » : pour un détourage, on retient l'image d'origine
     (calque.source), pour que le pinceau « Restaurer » puisse la faire
     revenir. « source » : une nouvelle image d'origine (yeux rouges
     corrigés aussi sur l'origine). */
  valider(c, toile, { garderSource = false, source = null, oublierSource = false } = {}) {
    const id = Ressources.depuisToile(toile);
    Rendu.remplacements.clear();
    Rendu.fantomes.clear();
    const changements = { ressource: id };
    if (garderSource && !c.source) changements.source = c.ressource;
    if (source) changements.source = source;
    if (oublierSource) changements.source = undefined;   // le calque redevient une image simple
    Historique.action(() => Montage.modifier(c.id, changements));
  },

  /* Y a-t-il une retouche commencée et pas encore validée ? */
  enCours() {
    return !!(Editeur.outil && Editeur.outil.aDuTravail());
  },

  /* Quitter l'éditeur, exporter… : seulement sans retouche en suspens. */
  verifierLibre() {
    if (!Editeur.outil) return true;
    if (Editeur.outil.aDuTravail()) {
      Message.erreur('Une retouche est en cours : touche « Valider » pour la garder, ou « Fermer » pour l\'abandonner.');
      return false;
    }
    Editeur.outil.fermer();
    return true;
  }
};

/* Dessine un trait bien visible sur toutes les photos : sombre dessous,
   clair dessus. */
function traitDouble(ctx, chemin, largeur = 2) {
  chemin();
  ctx.strokeStyle = 'rgba(20, 17, 29, 0.75)';
  ctx.lineWidth = largeur + 2.5;
  ctx.stroke();
  chemin();
  ctx.strokeStyle = '#d6c2ff';
  ctx.lineWidth = largeur;
  ctx.stroke();
}


/* ============================================================
   YEUX ROUGES
   On touche le centre d'un œil. Dans un cercle autour du doigt, on
   cherche les pixels « rouges » (bien plus de rouge que de vert et de
   bleu), on garde la tache rouge qui touche le centre (pas la peau ni
   les lèvres autour), puis on remplace leur rouge par une teinte sombre
   naturelle. Le reflet blanc de l'œil n'est pas rouge : il reste.
   ============================================================ */

const OutilYeux = {
  panneau: 'outil-yeux',
  calque: null,
  original: null,      // la vraie image (jamais touchée)
  travail: null,       // la copie corrigée (l'aperçu)
  corrections: [],     // [{ x, y, rayon }] en pixels de l'image
  voirOriginal: false,
  dernier: null,       // dernier point touché (pour montrer la zone)

  commencer(c) {
    this.calque = c;
    this.travail = null;
    this.corrections = [];
    this.voirOriginal = false;
    this.dernier = null;
  },

  aDuTravail() {
    return this.corrections.length > 0;
  },

  /* Rayon de la zone, en pixels d'ÉCRAN (ce qu'on voit sous le doigt). */
  rayonEcran() {
    return Number($('#y-taille').value);
  },

  toucher(p) {
    const c = this.calque;
    const point = Editeur.ecranVersCalque(c, p.x, p.y);
    if (point.x < 0 || point.y < 0 || point.x > c.largeur || point.y > c.hauteur) {
      Message.montrer('Touche un œil sur la photo « ' + c.nom + ' ».');
      return;
    }
    const rayon = Math.max(2, this.rayonEcran() / Editeur.zoomCalque(c));
    try {
      if (!this.travail) this.travail = Retouche.copier(c);
    } catch (e) {
      Message.erreur(MESSAGES_PHOTO.memoire);
      return;
    }
    const nombre = corrigerYeuxRouges(this.travail.getContext('2d', { willReadFrequently: true }), point.x, point.y, rayon);
    this.dernier = { x: point.x, y: point.y, rayon };
    if (!nombre) {
      Message.montrer('Pas de rouge trouvé ici. Touche bien le centre de l\'œil, ou agrandis la zone.');
    } else {
      this.corrections.push({ x: point.x, y: point.y, rayon });
      this.voirOriginal = false;
      Message.cacher();
    }
    this._montrer();
  },

  /* Retire la dernière correction : on repart de l'original et on refait
     les autres. Renvoie vrai si quelque chose a été retiré. */
  retirerDernier() {
    if (!this.corrections.length) return false;
    this.corrections.pop();
    this.travail = this.corrections.length ? Retouche.copier(this.calque) : null;
    if (this.travail) {
      const ctx = this.travail.getContext('2d', { willReadFrequently: true });
      for (const k of this.corrections) corrigerYeuxRouges(ctx, k.x, k.y, k.rayon);
    }
    this.dernier = null;
    this._montrer();
    return true;
  },

  basculerComparaison() {
    if (!this.corrections.length) return;
    this.voirOriginal = !this.voirOriginal;
    this._montrer();
  },

  valider() {
    if (!this.corrections.length) { this.fermer(); return; }
    const n = this.corrections.length;
    // Sujet détouré : on corrige aussi son image d'origine, sinon le
    // pinceau « Restaurer » ferait revenir les yeux rouges.
    let source = null;
    if (this.calque.source && Ressources.obtenir(this.calque.source)) {
      try {
        const r = Ressources.obtenir(this.calque.source);
        const { toile, ctx } = nouvelleToile(r.largeur, r.hauteur);
        ctx.drawImage(r.image, 0, 0);
        for (const k of this.corrections) corrigerYeuxRouges(ctx, k.x, k.y, k.rayon);
        source = Ressources.depuisToile(toile);
      } catch (e) { /* pas de mémoire : l'origine garde ses yeux */ }
    }
    Retouche.valider(this.calque, this.travail, { source });
    this.travail = null;
    this.corrections = [];
    this.fermer();
    Message.montrer(n === 1 ? 'Œil corrigé ✓ « Annuler » permet de revenir en arrière.'
      : `${n} yeux corrigés ✓ « Annuler » permet de revenir en arrière.`);
  },

  fermer() {
    Rendu.remplacements.clear();
    this.travail = null;
    this.corrections = [];
    if (Editeur.outil === this) Editeur.choisirOutil(null);
  },

  _montrer() {
    Rendu.remplacements.clear();
    if (this.travail && this.corrections.length && !this.voirOriginal) {
      Rendu.remplacements.set(this.calque.ressource, this.travail);
    }
    this.majPanneau();
    Historique.majBoutons();
    Editeur.redessiner();
  },

  majPanneau() {
    const n = this.corrections.length;
    $('#y-etat').textContent = n === 0 ? 'Aucun œil corrigé pour l\'instant.'
      : (n === 1 ? '1 œil corrigé (aperçu).' : `${n} yeux corrigés (aperçu).`)
        + (this.voirOriginal ? ' Tu vois l\'original.' : '');
    $('[data-action="yeux-comparer"]').disabled = !n;
    $('[data-action="yeux-retirer"]').disabled = !n;
    $('[data-action="yeux-valider"]').disabled = !n;
    const b = $('[data-action="yeux-comparer"] .texte-bouton');
    if (b) b.textContent = this.voirOriginal ? 'Voir la correction' : 'Voir l\'original';
    const s = $('#y-taille').parentElement.querySelector('output');
    if (s) s.textContent = $('#y-taille').value + ' px';
  },

  /* À l'écran : le cercle de la zone autour du dernier toucher (ou au
     centre, pendant qu'on règle la taille), et de petits cercles sur les
     yeux déjà corrigés. */
  dessiner(ctx) {
    const c = this.calque;
    ctx.save();
    for (const k of this.corrections) {
      const p = Editeur.calqueVersEcran(c, k.x, k.y);
      traitDouble(ctx, () => { ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(6, k.rayon * Editeur.zoomCalque(c)), 0, Math.PI * 2); }, 1.5);
    }
    let centre = null;
    if (this._reglage) {
      const zone = Editeur.toile.parentElement;
      centre = { x: zone.clientWidth / 2, y: zone.clientHeight / 2 };
    } else if (this.dernier) {
      centre = Editeur.calqueVersEcran(c, this.dernier.x, this.dernier.y);
    }
    if (centre) {
      ctx.setLineDash([6, 5]);
      traitDouble(ctx, () => { ctx.beginPath(); ctx.arc(centre.x, centre.y, this.rayonEcran(), 0, Math.PI * 2); }, 2);
    }
    ctx.restore();
  },

  /* Pendant qu'on bouge le curseur de taille, la zone est montrée au
     milieu de l'écran pendant 1,5 seconde. */
  montrerReglage() {
    this._reglage = true;
    clearTimeout(this._minuteurReglage);
    this._minuteurReglage = setTimeout(() => { this._reglage = false; Editeur.redessiner(); }, 1500);
    this.majPanneau();
    Editeur.redessiner();
  }
};

/* La correction elle-même, sur la toile « ctx », dans un cercle de centre
   (cx, cy) et de rayon « rayon » (en pixels de l'image).
   Renvoie le nombre de pixels corrigés (0 = pas de rouge trouvé). */
function corrigerYeuxRouges(ctx, cx, cy, rayon) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const x0 = Math.max(0, Math.floor(cx - rayon)), y0 = Math.max(0, Math.floor(cy - rayon));
  const x1 = Math.min(W, Math.ceil(cx + rayon)), y1 = Math.min(H, Math.ceil(cy + rayon));
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return 0;
  const image = ctx.getImageData(x0, y0, w, h);
  const d = image.data;

  // 1. À quel point chaque pixel est-il « rouge d'œil » ? (de 0 à 1)
  //    Rouge nettement plus fort que la moyenne du vert et du bleu, et
  //    assez lumineux. La peau (rouge à peine plus fort) n'est pas comptée.
  const rouge = new Float32Array(w * h);
  const r2 = rayon * rayon;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x0 + x + 0.5 - cx, dy = y0 + y + 0.5 - cy;
      if (dx * dx + dy * dy > r2) continue;
      const i = (y * w + x) * 4;
      const R = d[i], moyenne = (d[i + 1] + d[i + 2]) / 2;
      const rapport = R / (moyenne + 8);
      rouge[y * w + x] = limiter((rapport - 1.45) / 0.65, 0, 1) * limiter((R - 45) / 45, 0, 1);
    }
  }

  // 2. On garde seulement la tache rouge qui touche le centre du cercle
  //    (les pixels « bien rouges » près du centre, puis tout ce qui est
  //    un peu rouge et relié à eux).
  const garde = new Uint8Array(w * h);
  const file = [];
  const rCentre2 = (rayon * 0.55) ** 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x0 + x + 0.5 - cx, dy = y0 + y + 0.5 - cy;
      const k = y * w + x;
      if (dx * dx + dy * dy <= rCentre2 && rouge[k] > 0.25) { garde[k] = 1; file.push(k); }
    }
  }
  if (!file.length) return 0;
  while (file.length) {
    const k = file.pop();
    const x = k % w, y = (k - x) / w;
    for (const [vx, vy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (vx < 0 || vy < 0 || vx >= w || vy >= h) continue;
      const v = vy * w + vx;
      if (!garde[v] && rouge[v] > 0.06) { garde[v] = 1; file.push(v); }
    }
  }

  // 3. Un bord doux (petit flou du masque), pour une retouche invisible
  const poids = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let somme = 0, n = 0;
      for (let vy = Math.max(0, y - 1); vy <= Math.min(h - 1, y + 1); vy++) {
        for (let vx = Math.max(0, x - 1); vx <= Math.min(w - 1, x + 1); vx++) {
          const v = vy * w + vx;
          somme += garde[v] ? Math.max(rouge[v], 0.5) : 0;
          n++;
        }
      }
      poids[y * w + x] = Math.min(1, somme / n);
    }
  }

  // 4. Le rouge est ramené au niveau du vert et du bleu : une pupille
  //    sombre et naturelle, un peu assombrie.
  let corriges = 0;
  for (let k = 0; k < w * h; k++) {
    const p = poids[k];
    if (p <= 0) continue;
    const i = k * 4;
    const R = d[i], G = d[i + 1], B = d[i + 2];
    const sombre = Math.min(R, (G + B) / 2) * 0.85;
    d[i] = Math.round(R + (sombre - R) * p);
    d[i + 1] = Math.round(G * (1 - 0.12 * p));
    d[i + 2] = Math.round(B * (1 - 0.12 * p));
    if (garde[k]) corriges++;
  }
  ctx.putImageData(image, x0, y0);
  return corriges;
}


/* ============================================================
   DÉCOUPE DE SILHOUETTE
   On dessine le contour au doigt :
   - « Tracé libre » : on suit le bord du doigt. On peut lever le doigt,
     zoomer à deux doigts, puis continuer : le trait reprend où il
     s'était arrêté ;
   - « Points » : chaque toucher pose un point, reliés dans l'ordre. Un
     point déjà posé se déplace en le faisant glisser.
   Le contour est toujours refermé (le dernier point rejoint le premier).
   Puis « Aperçu » montre le résultat, et « Valider » le garde.
   ============================================================ */

const OutilDecoupe = {
  panneau: 'outil-decoupe',
  calque: null,
  points: [],          // [{ x, y }] en pixels de l'image du calque
  traits: [],          // début de chaque trait (pour « Retirer le dernier »)
  apercu: null,        // la toile découpée, si on regarde l'aperçu
  _traitDebut: -1,
  _pointDeplace: -1,

  ZONE_POINT: 26,      // distance (écran) pour attraper un point

  commencer(c) {
    this.calque = c;
    this.points = [];
    this.traits = [];
    this.apercu = null;
  },

  mode() {
    return ($('input[name="d-mode"]:checked') || {}).value === 'points' ? 'points' : 'libre';
  },

  garder() {
    return ($('input[name="d-garder"]:checked') || {}).value === 'exterieur' ? 'exterieur' : 'interieur';
  },

  aDuTravail() {
    return this.points.length > 0;
  },

  /* Le point de l'image sous le doigt, gardé dans les bords de l'image. */
  _point(p) {
    const c = this.calque;
    const q = Editeur.ecranVersCalque(c, p.x, p.y);
    return { x: limiter(q.x, 0, c.largeur), y: limiter(q.y, 0, c.hauteur) };
  },

  _pointProche(p) {
    let meilleur = -1, distance = this.ZONE_POINT;
    this.points.forEach((q, i) => {
      const e = Editeur.calqueVersEcran(this.calque, q.x, q.y);
      const dd = Math.hypot(e.x - p.x, e.y - p.y);
      if (dd <= distance) { distance = dd; meilleur = i; }
    });
    return meilleur;
  },

  /* Un doigt se pose. Renvoie vrai si l'outil prend ce doigt (sinon il
     sert à déplacer la vue). */
  appui(p) {
    if (this.apercu) return false;
    if (this.mode() === 'libre') {
      this._traitDebut = this.points.length;
      this.traits.push(this.points.length);
      this.points.push(this._point(p));
      this._dernierEcran = p;
      this._maj();
      return true;
    }
    // Mode « points » : glisser un point existant pour le corriger
    const i = this._pointProche(p);
    if (i >= 0) { this._pointDeplace = i; return true; }
    return false;
  },

  mouvement(p) {
    if (this._pointDeplace >= 0) {
      this.points[this._pointDeplace] = this._point(p);
      this._maj();
      return;
    }
    // Tracé libre : un point tous les 3 pixels d'écran (assez précis, pas trop lourd)
    if (this._dernierEcran && Math.hypot(p.x - this._dernierEcran.x, p.y - this._dernierEcran.y) < 3) return;
    if (this.points.length >= 20000) return;
    this.points.push(this._point(p));
    this._dernierEcran = p;
    this._maj();
  },

  relache() {
    this._pointDeplace = -1;
    this._dernierEcran = null;
    // Un trait d'un seul point (simple toucher) est gardé : il sert d'appui
    this._maj();
  },

  /* Un 2e doigt est arrivé : ce trait était en fait le début d'un zoom. */
  interrompre() {
    if (this._pointDeplace >= 0) { this._pointDeplace = -1; return; }
    if (this._traitDebut >= 0) {
      this.points.length = this._traitDebut;
      this.traits.pop();
      this._traitDebut = -1;
    }
    this._dernierEcran = null;
    this._maj();
  },

  /* Mode « points » : un toucher pose un nouveau point. */
  toucher(p) {
    if (this.apercu || this.mode() !== 'points') return;
    this.traits.push(this.points.length);
    this.points.push(this._point(p));
    this._maj();
  },

  retirerDernier() {
    if (this.apercu) { this.reprendre(); return true; }
    if (!this.points.length) return false;
    if (this.mode() === 'libre' && this.traits.length) {
      this.points.length = this.traits.pop();
    } else {
      this.points.pop();
      while (this.traits.length && this.traits[this.traits.length - 1] >= this.points.length) this.traits.pop();
    }
    this._maj();
    return true;
  },

  toutEffacer() {
    this.points = [];
    this.traits = [];
    this.reprendre();
  },

  /* Fabrique l'image découpée (même taille que l'image d'origine). */
  fabriquer() {
    const c = this.calque;
    const r = Ressources.obtenir(c.ressource);
    const { toile, ctx } = nouvelleToile(r.largeur, r.hauteur);
    ctx.drawImage(r.image, 0, 0);
    // Le masque : la forme du contour, en noir, au bord adouci si demandé
    const { toile: masque, ctx: m } = nouvelleToile(r.largeur, r.hauteur);
    const adoucir = Number($('#d-adoucir').value);
    if (adoucir > 0) m.filter = `blur(${adoucir}px)`;
    m.fillStyle = '#000';
    m.beginPath();
    this.points.forEach((q, i) => (i ? m.lineTo(q.x, q.y) : m.moveTo(q.x, q.y)));
    m.closePath();
    m.fill();
    // « destination-in » garde ce qui est SOUS le masque (l'intérieur),
    // « destination-out » garde ce qui est en dehors (l'extérieur).
    ctx.globalCompositeOperation = this.garder() === 'interieur' ? 'destination-in' : 'destination-out';
    ctx.drawImage(masque, 0, 0);
    masque.width = 0;
    return toile;
  },

  voirApercu() {
    if (this.points.length < 3) {
      Message.montrer('Le contour doit avoir au moins 3 points. Continue à tracer autour du sujet.');
      return;
    }
    try {
      this.apercu = this.fabriquer();
    } catch (e) {
      Message.erreur(MESSAGES_PHOTO.memoire);
      return;
    }
    Rendu.remplacements.set(this.calque.ressource, this.apercu);
    this._maj();
  },

  /* Retour au tracé (on quitte l'aperçu sans rien perdre). */
  reprendre() {
    if (this.apercu) this.apercu.width = 0;
    this.apercu = null;
    Rendu.remplacements.clear();
    this._maj();
  },

  valider() {
    if (!this.apercu) { this.voirApercu(); if (!this.apercu) return; }
    Retouche.valider(this.calque, this.apercu, { garderSource: true });
    const exterieur = this.garder() === 'exterieur';
    this.apercu = null;
    this.points = [];
    this.traits = [];
    this.fermer();
    Message.montrer((exterieur ? 'Découpe faite : l\'intérieur du contour est retiré. ' : 'Découpe faite : seul l\'intérieur du contour est gardé. ') +
      'Le damier montre les zones transparentes ; exporte en PNG pour les garder.');
  },

  fermer() {
    if (this.apercu) this.apercu.width = 0;
    this.apercu = null;
    this.points = [];
    this.traits = [];
    Rendu.remplacements.clear();
    if (Editeur.outil === this) Editeur.choisirOutil(null);
  },

  _maj() {
    this.majPanneau();
    Historique.majBoutons();
    Editeur.redessiner();
  },

  majPanneau() {
    const n = this.points.length;
    const enApercu = !!this.apercu;
    $('#d-trace').hidden = enApercu;
    $('#d-resultat').hidden = !enApercu;
    $('[data-action="decoupe-retirer"]').disabled = !n;
    $('[data-action="decoupe-effacer"]').disabled = !n;
    $('[data-action="decoupe-apercu"]').disabled = n < 3;
    $('#d-etat').textContent = enApercu
      ? 'Aperçu : le damier montre ce qui sera retiré (transparent).'
      : (n === 0 ? (this.mode() === 'libre' ? 'Trace le contour du sujet avec un doigt.' : 'Touche la photo pour poser les points du contour.')
        : (n < 3 ? 'Continue le contour…' : `Contour de ${n} points. Touche « Aperçu » quand il fait le tour.`));
    const s = $('#d-adoucir').parentElement.querySelector('output');
    if (s) s.textContent = $('#d-adoucir').value + ' px';
  },

  /* À l'écran : le contour, l'intérieur légèrement teinté, et les points. */
  dessiner(ctx) {
    if (this.apercu || !this.points.length) return;
    const c = this.calque;
    const ecran = this.points.map((q) => Editeur.calqueVersEcran(c, q.x, q.y));
    const chemin = (fermer) => () => {
      ctx.beginPath();
      ecran.forEach((e, i) => (i ? ctx.lineTo(e.x, e.y) : ctx.moveTo(e.x, e.y)));
      if (fermer) ctx.closePath();
    };
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (ecran.length >= 3) {
      chemin(true)();
      ctx.fillStyle = this.garder() === 'interieur' ? 'rgba(167, 119, 255, 0.22)' : 'rgba(20, 17, 29, 0.45)';
      ctx.fill();
      // La ligne de fermeture (du dernier point au premier), en pointillés
      ctx.setLineDash([5, 6]);
      traitDouble(ctx, () => { ctx.beginPath(); ctx.moveTo(ecran[ecran.length - 1].x, ecran[ecran.length - 1].y); ctx.lineTo(ecran[0].x, ecran[0].y); }, 1.5);
      ctx.setLineDash([]);
    }
    traitDouble(ctx, chemin(false), 2);
    if (this.mode() === 'points' || ecran.length < 400) {
      ecran.forEach((e, i) => {
        if (this.mode() !== 'points' && i !== 0) return;
        ctx.beginPath();
        ctx.arc(e.x, e.y, i === 0 ? 9 : 7, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? '#a777ff' : '#d6c2ff';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#14111d';
        ctx.stroke();
      });
    }
    ctx.restore();
  }
};


/* ============================================================
   PINCEAU « RESTAURER » ET GOMME
   Pour corriger un détourage (IA ou découpe) : la gomme rend
   transparent, le pinceau « Restaurer » fait revenir la photo
   d'origine (cheveux coupés, bord oublié…).

   Comment ça marche : on garde la photo d'origine (calque.source) et un
   « masque » qui dit, pour chaque pixel, à quel point il est gardé. Le
   pinceau ajoute du masque, la gomme en retire. L'image affichée =
   l'origine, là où le masque le permet.
   ============================================================ */

const OutilPinceau = {
  panneau: 'outil-pinceau',
  calque: null,
  source: null,        // l'image d'origine (avant détourage)
  masque: null,        // toile : son opacité = ce qui est gardé
  rendu: null,         // toile : l'aperçu (origine + masque)
  traits: [],          // [{ mode, rayon, douceur, points: [{x, y}] }]
  _trait: null,
  _curseur: null,      // dernier endroit du doigt (pour montrer le pinceau)

  commencer(c) {
    this.calque = c;
    this.traits = [];
    this._trait = null;
    this._curseur = null;
    this.masque = null;
    this.rendu = null;
    const origine = Ressources.obtenir(c.source || c.ressource);
    this.source = origine ? origine.image : null;
    // Le fond retiré est montré en transparence, pour savoir où restaurer
    if (c.source && origine) Rendu.fantomes.set(c.ressource, this.source);
    if (!c.source) {
      Message.montrer('Cette image n\'a pas encore été détourée : seule la gomme a un effet. Utilise d\'abord « Détourer » ou « Découper ».');
    }
  },

  aDuTravail() {
    return this.traits.length > 0;
  },

  mode() {
    return ($('input[name="p-mode"]:checked') || {}).value === 'gommer' ? 'gommer' : 'restaurer';
  },

  /* Prépare les deux toiles de travail (au premier coup de pinceau
     seulement : elles prennent de la mémoire). */
  _preparer() {
    if (this.masque) return;
    const c = this.calque;
    const actuelle = Ressources.obtenir(c.ressource);
    const { toile: masque, ctx: m } = nouvelleToile(actuelle.largeur, actuelle.hauteur);
    if (c.source) m.drawImage(actuelle.image, 0, 0);          // le masque = ce qui est gardé aujourd'hui
    else { m.fillStyle = '#000'; m.fillRect(0, 0, masque.width, masque.height); }
    const { toile: rendu } = nouvelleToile(actuelle.largeur, actuelle.hauteur);
    this.masque = masque;
    this.rendu = rendu;
    this._recomposer(0, 0, masque.width, masque.height);
    Rendu.remplacements.set(c.ressource, this.rendu);
  },

  /* Refait l'aperçu dans un rectangle : l'origine, gardée selon le masque. */
  _recomposer(x, y, l, h) {
    x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y));
    l = Math.min(this.rendu.width - x, Math.ceil(l) + 1); h = Math.min(this.rendu.height - y, Math.ceil(h) + 1);
    if (l <= 0 || h <= 0) return;
    const ctx = this.rendu.getContext('2d');
    ctx.clearRect(x, y, l, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.source, x, y, l, h, x, y, l, h);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(this.masque, x, y, l, h, x, y, l, h);
    ctx.globalCompositeOperation = 'source-over';
  },

  /* Une « touche » ronde du pinceau sur le masque. */
  _tamponner(trait, x, y) {
    const m = this.masque.getContext('2d');
    const r = trait.rayon;
    const degrade = m.createRadialGradient(x, y, r * (1 - trait.douceur), x, y, r);
    degrade.addColorStop(0, 'rgba(0,0,0,1)');
    degrade.addColorStop(1, 'rgba(0,0,0,0)');
    m.globalCompositeOperation = trait.mode === 'gommer' ? 'destination-out' : 'source-over';
    m.fillStyle = degrade;
    m.beginPath();
    m.arc(x, y, r, 0, Math.PI * 2);
    m.fill();
    m.globalCompositeOperation = 'source-over';
  },

  /* Peint d'un point à l'autre (des touches rapprochées, pour un trait continu). */
  _segment(trait, a, b) {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const pas = Math.max(0.5, trait.rayon * 0.25);
    const n = Math.max(1, Math.ceil(d / pas));
    for (let i = 1; i <= n; i++) this._tamponner(trait, a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n);
    const r = trait.rayon + 2;
    this._recomposer(Math.min(a.x, b.x) - r, Math.min(a.y, b.y) - r, Math.abs(b.x - a.x) + r * 2, Math.abs(b.y - a.y) + r * 2);
  },

  appui(p) {
    try { this._preparer(); } catch (e) { Message.erreur(MESSAGES_PHOTO.memoire); return false; }
    const c = this.calque;
    const point = Editeur.ecranVersCalque(c, p.x, p.y);
    this._trait = {
      mode: this.mode(),
      rayon: Math.max(0.5, Number($('#p-taille').value) / Editeur.zoomCalque(c)),
      douceur: Number($('#p-douceur').value) / 100,
      points: [point]
    };
    this.traits.push(this._trait);
    this._tamponner(this._trait, point.x, point.y);
    const r = this._trait.rayon + 2;
    this._recomposer(point.x - r, point.y - r, r * 2, r * 2);
    this._curseur = p;
    this._maj();
    return true;
  },

  mouvement(p) {
    const t = this._trait;
    if (!t) return;
    const point = Editeur.ecranVersCalque(this.calque, p.x, p.y);
    const avant = t.points[t.points.length - 1];
    if (Math.hypot(point.x - avant.x, point.y - avant.y) < t.rayon * 0.15) return;
    t.points.push(point);
    this._segment(t, avant, point);
    this._curseur = p;
    Editeur.redessiner();
  },

  relache() {
    this._trait = null;
    this._curseur = null;
    this._maj();
  },

  /* Un 2e doigt : c'était un zoom, pas un coup de pinceau. */
  interrompre() {
    if (this._trait) {
      this.traits.pop();
      this._trait = null;
      this._rejouer();
    }
  },

  /* Refait tout le masque depuis le début, sans le dernier trait. */
  _rejouer() {
    if (!this.masque) return;
    const c = this.calque;
    const m = this.masque.getContext('2d');
    m.clearRect(0, 0, this.masque.width, this.masque.height);
    if (c.source) m.drawImage(Ressources.obtenir(c.ressource).image, 0, 0);
    else { m.fillStyle = '#000'; m.fillRect(0, 0, this.masque.width, this.masque.height); }
    for (const t of this.traits) {
      this._tamponnerSansRendu(t);
    }
    this._recomposer(0, 0, this.masque.width, this.masque.height);
    this._maj();
  },

  _tamponnerSansRendu(t) {
    this._tamponner(t, t.points[0].x, t.points[0].y);
    for (let i = 1; i < t.points.length; i++) {
      const a = t.points[i - 1], b = t.points[i];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(1, Math.ceil(d / Math.max(0.5, t.rayon * 0.25)));
      for (let k = 1; k <= n; k++) this._tamponner(t, a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n);
    }
  },

  retirerDernier() {
    if (!this.traits.length) return false;
    this.traits.pop();
    this._rejouer();
    return true;
  },

  basculerFantome() {
    const c = this.calque;
    if (!c.source) return;
    if (Rendu.fantomes.has(c.ressource)) Rendu.fantomes.delete(c.ressource);
    else Rendu.fantomes.set(c.ressource, this.source);
    this._maj();
  },

  valider() {
    if (!this.traits.length) { this.fermer(); return; }
    const toile = this.rendu;
    this.rendu = null;
    Retouche.valider(this.calque, toile, { garderSource: true });
    this.fermer();
    Message.montrer('Retouche gardée ✓ « Annuler » permet de revenir en arrière.');
  },

  fermer() {
    if (this.masque) this.masque.width = 0;
    if (this.rendu) this.rendu.width = 0;
    this.masque = null;
    this.rendu = null;
    this.traits = [];
    this._trait = null;
    Rendu.remplacements.clear();
    Rendu.fantomes.clear();
    if (Editeur.outil === this) Editeur.choisirOutil(null);
  },

  _maj() {
    this.majPanneau();
    Historique.majBoutons();
    Editeur.redessiner();
  },

  majPanneau() {
    const n = this.traits.length;
    $('#p-etat').textContent = n === 0 ? 'Passe le doigt sur les zones à corriger.' : (n === 1 ? '1 trait (aperçu).' : `${n} traits (aperçu).`);
    $('[data-action="pinceau-retirer"]').disabled = !n;
    $('[data-action="pinceau-valider"]').disabled = !n;
    const f = $('[data-action="pinceau-fantome"]');
    f.disabled = !this.calque || !this.calque.source;
    const t = f.querySelector('.texte-bouton');
    if (t) t.textContent = this.calque && Rendu.fantomes.has(this.calque.ressource) ? 'Cacher le fond retiré' : 'Voir le fond retiré';
    for (const id of ['#p-taille', '#p-douceur']) {
      const s = $(id).parentElement.querySelector('output');
      if (s) s.textContent = $(id).value + (id === '#p-taille' ? ' px' : ' %');
    }
  },

  /* Le rond du pinceau sous le doigt (ou au centre pendant le réglage). */
  dessiner(ctx) {
    let centre = this._curseur;
    if (!centre && this._reglage) {
      const zone = Editeur.toile.parentElement;
      centre = { x: zone.clientWidth / 2, y: zone.clientHeight / 2 };
    }
    if (!centre) return;
    ctx.save();
    traitDouble(ctx, () => { ctx.beginPath(); ctx.arc(centre.x, centre.y, Number($('#p-taille').value), 0, Math.PI * 2); }, 2);
    ctx.restore();
  },

  montrerReglage() {
    this._reglage = true;
    clearTimeout(this._minuteurReglage);
    this._minuteurReglage = setTimeout(() => { this._reglage = false; Editeur.redessiner(); }, 1500);
    this._maj();
  }
};
