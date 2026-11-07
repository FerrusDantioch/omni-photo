/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   « Cacher » : rendre méconnaissable une partie de la photo avant de la
   partager (un visage, une plaque d'immatriculation, une adresse…).

   - On trace une zone : un rectangle, un ovale (pour un visage) ou
     directement au doigt.
   - Deux effets : « Pixels » (de gros carrés de couleur : le plus sûr,
     rien ne se devine) ou « Flou » (plus doux à l'œil).
   - L'effet et sa force s'appliquent à toutes les zones : on peut les
     changer après coup, l'aperçu suit.

   Comme les autres retouches : on travaille sur une copie (aperçu),
   « Retirer le dernier » enlève la dernière zone, et « Valider » range
   une NOUVELLE image : ce qui est caché est vraiment effacé de l'image
   (pas seulement recouvert). Pour un sujet détouré, la même chose est
   faite sur son image d'origine (sinon le pinceau « Restaurer » pourrait
   faire revenir ce qui était caché).
   ============================================================ */
'use strict';

const OutilCacher = {
  panneau: 'outil-cacher',
  calque: null,
  travail: null,          // la copie avec les zones cachées (l'aperçu)
  travailSource: null,    // pareil pour l'image d'origine d'un sujet détouré
  zones: [],              // [{ points: [{x,y}…] }] polygone, ou [{ points, rayon }] trait au doigt
  _cadre: null,           // le rectangle ou l'ovale en train d'être tracé { a, b } (écran)
  _trait: null,           // le trait au doigt en train d'être tracé
  _curseur: null,
  voirOriginal: false,

  commencer(c) {
    this.calque = c;
    this._liberer();
    this.zones = [];
    this._cadre = this._trait = this._curseur = null;
    this.voirOriginal = false;
  },

  effet() {
    return ($('input[name="ca-effet"]:checked') || {}).value === 'flou' ? 'flou' : 'pixels';
  },

  forme() {
    const v = ($('input[name="ca-forme"]:checked') || {}).value;
    return v === 'ovale' || v === 'doigt' ? v : 'rectangle';
  },

  force() {
    return limiter(Number($('#ca-force').value) || 5, 1, 10);
  },

  /* La taille d'un carré (pixels) ou la force du flou, en pixels de
     l'image, pour une zone. Elle dépend surtout de la ZONE : un visage
     doit être couvert par peu de carrés (environ 6 sur sa largeur à la
     force 5, 2 ou 3 à la force 10), qu'il soit petit ou grand sur la
     photo. Avec un minimum lié à la photo, pour les toutes petites zones. */
  taille(zone, l, h, effet = this.effet()) {
    const b = this._boite(zone, 0, l, h);
    const cote = b ? Math.min(b.x1 - b.x0, b.y1 - b.y0) : 0;
    const f = this.force();
    if (effet === 'flou') return Math.max(3, Math.round(Math.min(l, h) * 0.006), Math.round(cote * (0.04 + 0.025 * f)));
    return Math.max(4, Math.round(Math.min(l, h) * 0.008), Math.round(cote / Math.max(2.5, 12 - 1.2 * f)));
  },

  aDuTravail() {
    return this.zones.length > 0;
  },

  /* ---------- Tracer une zone ---------- */

  appui(p) {
    if (this.forme() === 'doigt') {
      const rayon = Math.max(1, Number($('#ca-taille').value) / Editeur.zoomCalque(this.calque));
      this._trait = { points: [Editeur.ecranVersCalque(this.calque, p.x, p.y)], rayon };
    } else {
      this._cadre = { a: p, b: p };
    }
    this._curseur = p;
    Editeur.redessiner();
    return true;
  },

  mouvement(p) {
    this._curseur = p;
    if (this._cadre) {
      this._cadre.b = p;
    } else if (this._trait) {
      const t = this._trait;
      const point = Editeur.ecranVersCalque(this.calque, p.x, p.y);
      const avant = t.points[t.points.length - 1];
      if (Math.hypot(point.x - avant.x, point.y - avant.y) >= t.rayon * 0.3) t.points.push(point);
    }
    Editeur.redessiner();
  },

  relache() {
    const cadre = this._cadre, trait = this._trait;
    this._cadre = this._trait = this._curseur = null;
    let zone = null;
    if (cadre) {
      const dx = Math.abs(cadre.b.x - cadre.a.x), dy = Math.abs(cadre.b.y - cadre.a.y);
      if (Math.hypot(dx, dy) < 14) {
        Message.montrer('Fais glisser ton doigt pour tracer la zone à cacher.');
        Editeur.redessiner();
        return;
      }
      // Une zone toute plate ne cacherait rien
      if (Math.min(dx, dy) < 8) {
        Message.montrer('Fais glisser ton doigt en diagonale, d\'un coin à l\'autre de ce que tu veux cacher.');
        Editeur.redessiner();
        return;
      }
      zone = { points: this._contour(cadre, this.forme()) };
    } else if (trait) {
      zone = trait;
    }
    if (!zone) return;
    const c = this.calque;
    const b = this._boite(zone, 0, c.largeur, c.hauteur);
    if (!b) {
      Message.montrer('Cette zone est en dehors de l\'image : trace-la sur la photo.');
      Editeur.redessiner();
      return;
    }
    this.zones.push(zone);
    this.voirOriginal = false;
    this._calculer();
  },

  /* Un 2e doigt : c'était un zoom, la zone commencée est oubliée. */
  interrompre() {
    this._cadre = this._trait = this._curseur = null;
    Editeur.redessiner();
  },

  /* Le contour d'un rectangle ou d'un ovale tracé à l'écran, en pixels
     de l'image (si l'image est tournée, la zone suit ce qu'on voit). */
  _contour(cadre, forme) {
    const { a, b } = cadre;
    const versImage = (x, y) => Editeur.ecranVersCalque(this.calque, x, y);
    if (forme === 'ovale') {
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const rx = Math.abs(b.x - a.x) / 2, ry = Math.abs(b.y - a.y) / 2;
      const points = [];
      for (let i = 0; i < 48; i++) {
        const t = (i / 48) * Math.PI * 2;
        points.push(versImage(cx + rx * Math.cos(t), cy + ry * Math.sin(t)));
      }
      return points;
    }
    return [versImage(a.x, a.y), versImage(b.x, a.y), versImage(b.x, b.y), versImage(a.x, b.y)];
  },

  /* La boîte autour d'une zone (plus une marge), dans l'image. null si
     la zone est en dehors de l'image. */
  _boite(zone, marge, L, H) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of zone.points) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const m = marge + (zone.rayon || 0);
    x0 = Math.max(0, Math.floor(x0 - m)); y0 = Math.max(0, Math.floor(y0 - m));
    x1 = Math.min(L, Math.ceil(x1 + m)); y1 = Math.min(H, Math.ceil(y1 + m));
    return x1 - x0 >= 1 && y1 - y0 >= 1 ? { x0, y0, x1, y1 } : null;
  },

  /* Dessine la zone (opaque) dans un masque dont le coin est (x0, y0).
     « elargir » : un trait en plus tout autour (pour le bord doux du flou). */
  _dessinerZone(ctx, zone, x0, y0, elargir = 0) {
    ctx.fillStyle = ctx.strokeStyle = '#000';
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath();
    zone.points.forEach((p, i) => (i ? ctx.lineTo(p.x - x0, p.y - y0) : ctx.moveTo(p.x - x0, p.y - y0)));
    if (zone.rayon) {
      const p = zone.points[0];
      if (zone.points.length === 1) ctx.arc(p.x - x0, p.y - y0, zone.rayon + elargir, 0, Math.PI * 2);
      ctx.lineWidth = (zone.rayon + elargir) * 2;
      if (zone.points.length === 1) ctx.fill(); else ctx.stroke();
    } else {
      ctx.closePath();
      ctx.fill();
      if (elargir) { ctx.lineWidth = elargir * 2; ctx.stroke(); }
    }
  },

  /* ---------- Les effets ---------- */

  /* Pixels : l'image est découpée en carrés (toujours la même grille,
     calée sur le coin de l'image) ; chaque carré touché par la zone prend
     la couleur moyenne de ses pixels. La zone « déborde » donc jusqu'au
     bord des carrés : rien ne dépasse à moitié. */
  _pixelliser(toile, zone, cote) {
    const W = toile.width, H = toile.height;
    const b = this._boite(zone, 0, W, H);
    if (!b) return;
    const x0 = Math.floor(b.x0 / cote) * cote, y0 = Math.floor(b.y0 / cote) * cote;
    const x1 = Math.min(W, Math.ceil(b.x1 / cote) * cote), y1 = Math.min(H, Math.ceil(b.y1 / cote) * cote);
    const l = x1 - x0, h = y1 - y0;
    const { toile: tm, ctx: cm } = nouvelleToile(l, h);
    this._dessinerZone(cm, zone, x0, y0);
    const masque = cm.getImageData(0, 0, l, h).data;
    tm.width = 0;
    const ctx = toile.getContext('2d', { willReadFrequently: true });
    const image = ctx.getImageData(x0, y0, l, h);
    const d = image.data;
    for (let gy = 0; gy < h; gy += cote) {
      const bh = Math.min(cote, h - gy);
      for (let gx = 0; gx < l; gx += cote) {
        const bl = Math.min(cote, l - gx);
        // Ce carré est-il vraiment touché par la zone ?
        let touche = false;
        for (let y = gy; y < gy + bh && !touche; y++) {
          for (let x = gx, i = (y * l + gx) * 4 + 3; x < gx + bl; x++, i += 4) if (masque[i] > 100) { touche = true; break; }
        }
        if (!touche) continue;
        // La moyenne (pondérée par l'opacité, pour les images détourées)
        let r = 0, v = 0, bl2 = 0, a = 0;
        for (let y = gy; y < gy + bh; y++) {
          for (let x = gx, i = (y * l + gx) * 4; x < gx + bl; x++, i += 4) {
            const o = d[i + 3];
            r += d[i] * o; v += d[i + 1] * o; bl2 += d[i + 2] * o; a += o;
          }
        }
        const n = bl * bh;
        const R = a ? Math.round(r / a) : 0, V = a ? Math.round(v / a) : 0, B = a ? Math.round(bl2 / a) : 0, A = Math.round(a / n);
        for (let y = gy; y < gy + bh; y++) {
          for (let x = gx, i = (y * l + gx) * 4; x < gx + bl; x++, i += 4) { d[i] = R; d[i + 1] = V; d[i + 2] = B; d[i + 3] = A; }
        }
      }
    }
    ctx.putImageData(image, x0, y0);
  },

  /* Flou : la région autour de la zone est réduite, floutée (3 passes de
     moyenne, bords « étirés » : pas de bord transparent au bord de la
     photo), puis agrandie ; on la pose à travers la zone, au bord adouci. */
  _flouter(toile, zone, force) {
    const W = toile.width, H = toile.height;
    const adoucir = Math.max(1, force * 0.25);
    const b = this._boite(zone, force * 2.5 + adoucir * 2, W, H);
    if (!b) return;
    const l = b.x1 - b.x0, h = b.y1 - b.y0;
    // 1. La région, réduite (un flou de quelques pixels suffit alors)
    const k = Math.max(1, Math.floor(force / 4));
    const pl = Math.max(1, Math.ceil(l / k)), ph = Math.max(1, Math.ceil(h / k));
    const { toile: petite, ctx: cp } = nouvelleToile(pl, ph);
    cp.imageSmoothingQuality = 'high';
    cp.drawImage(toile, b.x0, b.y0, l, h, 0, 0, pl, ph);
    const image = cp.getImageData(0, 0, pl, ph);
    flouBoite(image.data, pl, ph, Math.max(1, Math.round(force / k)));
    cp.putImageData(image, 0, 0);
    // 2. Agrandie à la taille de la région
    const { toile: floue, ctx: cf } = nouvelleToile(l, h);
    cf.imageSmoothingQuality = 'high';
    cf.drawImage(petite, 0, 0, pl, ph, 0, 0, l, h);
    petite.width = 0;
    // 3. Le masque : la zone, un peu élargie puis adoucie (le bord tracé
    //    reste donc entièrement caché ; le fondu se fait à l'extérieur)
    const { toile: tm, ctx: cm } = nouvelleToile(l, h);
    if ('filter' in cm) cm.filter = `blur(${adoucir}px)`;
    this._dessinerZone(cm, zone, b.x0, b.y0, adoucir * 2);
    cf.globalCompositeOperation = 'destination-in';
    cf.drawImage(tm, 0, 0);
    tm.width = 0;
    toile.getContext('2d').drawImage(floue, b.x0, b.y0);
    floue.width = 0;
  },

  /* Refait l'aperçu depuis l'image d'origine : toutes les zones, avec
     l'effet et la force choisis maintenant. */
  _calculer() {
    clearTimeout(this._minuteurCalcul);
    this._liberer();
    if (this.zones.length) {
      const c = this.calque;
      try {
        this.travail = Retouche.copier(c);
        const r = c.source && Ressources.obtenir(c.source);
        if (r) {
          const { toile, ctx } = nouvelleToile(r.largeur, r.hauteur);
          ctx.drawImage(r.image, 0, 0);
          this.travailSource = toile;
        }
        const appliquer = (toile) => {
          for (const z of this.zones) {
            const t = this.taille(z, toile.width, toile.height);
            if (this.effet() === 'flou') this._flouter(toile, z, t);
            else this._pixelliser(toile, z, t);
          }
        };
        appliquer(this.travail);
        if (this.travailSource) appliquer(this.travailSource);
      } catch (e) {
        console.warn(e);
        this._liberer();
        this.zones.pop();
        Message.erreur(MESSAGES_PHOTO.memoire);
      }
    }
    this._maj();
  },

  /* L'effet ou la force change : l'aperçu suit (un peu après, pour ne pas
     tout refaire à chaque petit mouvement du curseur). */
  reglageChange(e) {
    if (e && e.target && e.target.name === 'ca-forme') { this.majPanneau(); return; }
    if (e && e.target && e.target.id === 'ca-taille') { this.montrerReglage(); return; }
    this.majPanneau();
    if (!this.zones.length) return;
    clearTimeout(this._minuteurCalcul);
    this._minuteurCalcul = setTimeout(() => this._calculer(), e && e.type === 'input' ? 150 : 0);
  },

  _liberer() {
    if (this.travail) this.travail.width = 0;
    if (this.travailSource) this.travailSource.width = 0;
    this.travail = this.travailSource = null;
  },

  /* ---------- Retirer, comparer, valider ---------- */

  retirerDernier() {
    if (!this.zones.length) return false;
    this.zones.pop();
    this._calculer();
    return true;
  },

  basculerComparaison() {
    if (!this.zones.length) return;
    this.voirOriginal = !this.voirOriginal;
    this._maj();
  },

  valider() {
    clearTimeout(this._minuteurCalcul);
    if (!this.zones.length) { this.fermer(); return; }
    if (!this.travail) this._calculer();
    if (!this.travail) return;
    const source = this.travailSource ? Ressources.depuisToile(this.travailSource) : null;
    const toile = this.travail;
    this.travail = this.travailSource = null;
    Retouche.valider(this.calque, toile, { source });
    this.fermer();
    Message.montrer('C\'est caché ✓ Ces zones sont vraiment effacées de l\'image. « Annuler » permet de revenir en arrière.');
  },

  fermer() {
    clearTimeout(this._minuteurCalcul);
    this._liberer();
    this.zones = [];
    this._cadre = this._trait = null;
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
    const n = this.zones.length;
    const doigt = this.forme() === 'doigt';
    let etat;
    if (!n) etat = doigt ? 'Passe le doigt sur ce que tu veux cacher.' : 'Fais glisser ton doigt pour tracer la zone à cacher.';
    else etat = (n === 1 ? '1 zone cachée (aperçu).' : `${n} zones cachées (aperçu).`) + (this.voirOriginal ? ' Tu vois l\'original.' : '');
    if (n && this.effet() === 'flou' && this.force() <= 3) etat += ' Attention : un flou léger peut laisser deviner ce qui est dessous.';
    $('#ca-etat').textContent = etat;
    $('#ca-zone-taille').hidden = !doigt;
    $('[data-action="cacher-retirer"]').disabled = !n;
    $('[data-action="cacher-comparer"]').disabled = !n;
    $('[data-action="cacher-valider"]').disabled = !n;
    const b = $('[data-action="cacher-comparer"] .texte-bouton');
    if (b) b.textContent = this.voirOriginal ? 'Voir le résultat' : 'Voir l\'original';
    $('#ca-force').parentElement.querySelector('output').textContent = this.force() + ' / 10';
    $('#ca-taille').parentElement.querySelector('output').textContent = $('#ca-taille').value + ' px';
  },

  /* À l'écran : la zone en train d'être tracée, et le cercle du doigt. */
  dessiner(ctx) {
    const c = this.calque;
    if (!c) return;
    ctx.save();
    ctx.fillStyle = 'rgba(167, 119, 255, 0.3)';
    if (this._cadre) {
      const { a, b } = this._cadre;
      const chemin = () => {
        ctx.beginPath();
        if (this.forme() === 'ovale') ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
        else ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      };
      chemin();
      ctx.fill();
      traitDouble(ctx, chemin, 2);
    }
    const t = this._trait;
    if (t) {
      ctx.strokeStyle = ctx.fillStyle = 'rgba(167, 119, 255, 0.45)';
      ctx.lineCap = ctx.lineJoin = 'round';
      const z = Editeur.zoomCalque(c);
      ctx.lineWidth = t.rayon * 2 * z;
      ctx.beginPath();
      t.points.forEach((q, i) => { const e = Editeur.calqueVersEcran(c, q.x, q.y); i ? ctx.lineTo(e.x, e.y) : ctx.moveTo(e.x, e.y); });
      if (t.points.length === 1) { const e = Editeur.calqueVersEcran(c, t.points[0].x, t.points[0].y); ctx.arc(e.x, e.y, t.rayon * z, 0, Math.PI * 2); ctx.fill(); }
      else ctx.stroke();
    }
    if (this.forme() === 'doigt') {
      let centre = this._curseur;
      if (!centre && this._reglage) { const z = Editeur.toile.parentElement; centre = { x: z.clientWidth / 2, y: z.clientHeight / 2 }; }
      if (centre) traitDouble(ctx, () => { ctx.beginPath(); ctx.arc(centre.x, centre.y, Number($('#ca-taille').value), 0, Math.PI * 2); }, 2);
    }
    ctx.restore();
  },

  /* Le curseur « Taille du doigt » bouge : on montre le cercle un instant. */
  montrerReglage() {
    this._reglage = true;
    clearTimeout(this._minuteurReglage);
    this._minuteurReglage = setTimeout(() => { this._reglage = false; Editeur.redessiner(); }, 1500);
    this.majPanneau();
    Editeur.redessiner();
  }
};

/* Un flou rapide : 3 passes de « moyenne glissante » (horizontale puis
   verticale), sur des couleurs pondérées par l'opacité. Au bord, on
   répète le dernier pixel (le flou ne « mange » pas le bord de la photo). */
function flouBoite(d, l, h, rayon) {
  const n = l * h;
  const px = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const a = d[i * 4 + 3] / 255;
    px[i * 4] = d[i * 4] * a; px[i * 4 + 1] = d[i * 4 + 1] * a; px[i * 4 + 2] = d[i * 4 + 2] * a; px[i * 4 + 3] = d[i * 4 + 3];
  }
  const tampon = new Float32Array(Math.max(l, h) * 4);
  const passe = (longueur, nombre, indice) => {
    const largeurBoite = rayon * 2 + 1;
    for (let ligne = 0; ligne < nombre; ligne++) {
      for (let c = 0; c < 4; c++) {
        let somme = 0;
        for (let k = -rayon; k <= rayon; k++) somme += px[indice(ligne, limiter(k, 0, longueur - 1)) * 4 + c];
        for (let k = 0; k < longueur; k++) {
          tampon[k * 4 + c] = somme / largeurBoite;
          somme += px[indice(ligne, Math.min(longueur - 1, k + rayon + 1)) * 4 + c] - px[indice(ligne, Math.max(0, k - rayon)) * 4 + c];
        }
      }
      for (let k = 0; k < longueur; k++) for (let c = 0; c < 4; c++) px[indice(ligne, k) * 4 + c] = tampon[k * 4 + c];
    }
  };
  for (let fois = 0; fois < 3; fois++) {
    passe(l, h, (y, x) => y * l + x);   // horizontale
    passe(h, l, (x, y) => y * l + x);   // verticale
  }
  for (let i = 0; i < n; i++) {
    const a = px[i * 4 + 3];
    const f = a > 0.5 ? 255 / a : 0;
    d[i * 4] = Math.round(px[i * 4] * f); d[i * 4 + 1] = Math.round(px[i * 4 + 1] * f); d[i * 4 + 2] = Math.round(px[i * 4 + 2] * f); d[i * 4 + 3] = Math.round(a);
  }
}
