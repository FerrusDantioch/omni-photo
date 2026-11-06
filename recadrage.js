/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   « Recadrer » : couper les bords de l'image, choisir un format
   (carré, portrait, story…), tourner d'un quart de tour, et redresser
   une photo penchée.

   Le recadrage change la TAILLE DU MONTAGE et décale tous les calques :
   aucune image n'est réduite ni abîmée (on peut toujours annuler).

   Pendant l'outil : un doigt sur un coin du cadre l'agrandit, un doigt
   dans le cadre le déplace ; ailleurs, un doigt déplace la vue et deux
   doigts zooment.
   ============================================================ */
'use strict';

const FORMATS_CADRE = {
  libre: null, original: 'original', carre: 1, portrait: 4 / 5, story: 9 / 16, paysage: 16 / 9, photo: 3 / 2
};

const OutilRecadrage = {
  panneau: 'outil-recadrage',
  cadre: null,          // { x, y, l, h } en pixels du montage
  _geste: null,
  ZONE_COIN: 30,        // pixels d'écran autour d'un coin

  ouvrir() {
    if (!Montage.doc) return;
    if (Editeur.outil) Editeur.outil.fermer(true);
    Historique.fin();
    Montage.choisir(null);
    this._rapportOriginal = Montage.doc.largeur / Montage.doc.hauteur;
    this.cadre = this._plein();
    $('input[name="rc-format"][value="libre"]').checked = true;
    this._noterQuartDeTour();
    Editeur.choisirOutil(this);
  },

  /* « Redresser » part du quart de tour actuel de la photo (0°, 90°…) :
     le curseur ne règle que les quelques degrés en plus. */
  _noterQuartDeTour() {
    const p = this._photo();
    this._quart = p ? Math.round(p.rotation / 90) * 90 : 0;
    $('#rc-redresser').value = p ? Math.round(normaliserAngle(p.rotation - this._quart)) : 0;
  },

  _plein() {
    return { x: 0, y: 0, l: Montage.doc.largeur, h: Montage.doc.hauteur };
  },

  /* La photo de départ (la plus basse des images), pour « Redresser ». */
  _photo() {
    return Montage.doc.calques.find((c) => c.type === 'image' && c.visible) || null;
  },

  rapport() {
    const f = FORMATS_CADRE[($('input[name="rc-format"]:checked') || {}).value];
    return f === 'original' ? this._rapportOriginal : f;
  },

  aDuTravail() {
    const p = this._plein(), c = this.cadre;
    return !!c && (Math.abs(c.x - p.x) > 0.5 || Math.abs(c.y - p.y) > 0.5 || Math.abs(c.l - p.l) > 0.5 || Math.abs(c.h - p.h) > 0.5);
  },

  /* Un format choisi : le plus grand cadre de ces proportions, au centre. */
  choisirFormat() {
    const r = this.rapport();
    const d = Montage.doc;
    if (!r) { this._maj(); return; }
    let l = d.largeur, h = l / r;
    if (h > d.hauteur) { h = d.hauteur; l = h * r; }
    this.cadre = { x: (d.largeur - l) / 2, y: (d.hauteur - h) / 2, l, h };
    this._maj();
  },

  _coinsEcran() {
    const c = this.cadre;
    return [[c.x, c.y], [c.x + c.l, c.y], [c.x + c.l, c.y + c.h], [c.x, c.y + c.h]].map(([x, y]) => Editeur.montageVersEcran(x, y));
  },

  appui(p) {
    const coins = this._coinsEcran();
    for (let i = 0; i < 4; i++) {
      if (Math.hypot(coins[i].x - p.x, coins[i].y - p.y) <= this.ZONE_COIN) {
        // On tire le coin i ; le coin opposé reste fixe
        const oppose = (i + 2) % 4;
        const c = this.cadre;
        const ancre = [[c.x, c.y], [c.x + c.l, c.y], [c.x + c.l, c.y + c.h], [c.x, c.y + c.h]][oppose];
        this._geste = { type: 'coin', ancre: { x: ancre[0], y: ancre[1] } };
        return true;
      }
    }
    const q = Editeur.ecranVersMontage(p.x, p.y), c = this.cadre;
    if (q.x > c.x && q.x < c.x + c.l && q.y > c.y && q.y < c.y + c.h) {
      this._geste = { type: 'deplacer', depart: q, x: c.x, y: c.y };
      return true;
    }
    return false;
  },

  mouvement(p) {
    const g = this._geste;
    if (!g) return;
    const d = Montage.doc;
    const q = Editeur.ecranVersMontage(p.x, p.y);
    if (g.type === 'deplacer') {
      const c = this.cadre;
      c.x = limiter(g.x + q.x - g.depart.x, 0, d.largeur - c.l);
      c.y = limiter(g.y + q.y - g.depart.y, 0, d.hauteur - c.h);
    } else {
      const a = g.ancre;
      const sx = q.x >= a.x ? 1 : -1, sy = q.y >= a.y ? 1 : -1;
      // La place disponible dans la direction du doigt
      const maxL = sx > 0 ? d.largeur - a.x : a.x, maxH = sy > 0 ? d.hauteur - a.y : a.y;
      const mini = Math.max(8, 40 / Editeur.vue.e);   // jamais plus petit que 40 pixels d'écran
      let l = limiter(Math.abs(q.x - a.x), mini, maxL), h = limiter(Math.abs(q.y - a.y), mini, maxH);
      const r = this.rapport();
      if (r) {
        if (l / h > r) l = h * r; else h = l / r;
        if (l > maxL) { l = maxL; h = l / r; }
        if (h > maxH) { h = maxH; l = h * r; }
      }
      this.cadre = { x: sx > 0 ? a.x : a.x - l, y: sy > 0 ? a.y : a.y - h, l, h };
    }
    this._maj();
  },

  relache() { this._geste = null; this._maj(); },
  interrompre() { this._geste = null; },

  /* « Appliquer » : le montage prend la taille du cadre. */
  appliquer() {
    if (!this.aDuTravail()) { this.fermer(); return; }
    const c = this.cadre;
    const l = Math.max(1, Math.round(c.l)), h = Math.max(1, Math.round(c.h));
    const dx = Math.round(c.x), dy = Math.round(c.y);
    Historique.action(() => {
      const doc = Montage.doc;
      doc.largeur = l;
      doc.hauteur = h;
      for (const k of doc.calques) {
        k.x -= dx;
        k.y -= dy;
        this._suivreImage(k, doc);
      }
      Montage.signaler();
    });
    this.fermer();
    Editeur.ajusterVue();
    Message.montrer(`Image recadrée : ${nombre(l)} × ${nombre(h)} pixels. « Annuler » permet de revenir en arrière.`);
  },

  /* Le fond et le cadre suivent toujours toute l'image. */
  _suivreImage(k, doc) {
    if (k.type === 'fond' || (k.type === 'forme' && k.forme === 'cadre')) {
      Object.assign(k, { x: doc.largeur / 2, y: doc.hauteur / 2, largeur: doc.largeur, hauteur: doc.hauteur });
    }
  },

  /* Tourner toute l'image d'un quart de tour (sens = +1 : sens des
     aiguilles d'une montre ; -1 : sens inverse). */
  tourner(sens) {
    Historique.action(() => {
      const doc = Montage.doc;
      const L = doc.largeur, H = doc.hauteur;
      doc.largeur = H;
      doc.hauteur = L;
      for (const k of doc.calques) {
        const x = k.x, y = k.y;
        if (sens > 0) { k.x = H - y; k.y = x; } else { k.x = y; k.y = L - x; }
        if (k.type !== 'fond' && !(k.type === 'forme' && k.forme === 'cadre')) k.rotation = normaliserAngle(k.rotation + 90 * sens);
        this._suivreImage(k, doc);
      }
      Montage.signaler();
    });
    this._rapportOriginal = Montage.doc.largeur / Montage.doc.hauteur;
    this.cadre = this._plein();
    this._noterQuartDeTour();
    Editeur.ajusterVue();
    this._maj();
  },

  /* « Redresser » : la photo tourne de quelques degrés, et s'agrandit
     juste assez pour ne pas laisser de coins vides. */
  redresser(angle) {
    const c = this._photo();
    if (!c) return;
    const d = Montage.doc;
    const a = (Math.abs(angle) * Math.PI) / 180;
    const cos = Math.cos(a), sin = Math.sin(a);
    // Photo couchée (quart de tour) : sa largeur est à la verticale
    const couchee = Math.abs(normaliserAngle(this._quart)) === 90;
    const pl = couchee ? c.hauteur : c.largeur, ph = couchee ? c.largeur : c.hauteur;
    const echelle = Math.max((d.largeur * cos + d.hauteur * sin) / pl, (d.largeur * sin + d.hauteur * cos) / ph);
    Historique.debut();
    Montage.modifier(c.id, { rotation: this._quart + angle, echelle, x: d.largeur / 2, y: d.hauteur / 2 });
    this._maj();
  },

  retirerDernier() {
    if (!this.aDuTravail()) return false;
    this.cadre = this._plein();
    $('input[name="rc-format"][value="libre"]').checked = true;
    this._maj();
    return true;
  },

  fermer() {
    this.cadre = null;
    this._geste = null;
    if (Editeur.outil === this) Editeur.choisirOutil(null);
  },

  _maj() {
    this.majPanneau();
    Historique.majBoutons();
    Editeur.redessiner();
  },

  majPanneau() {
    if (!this.cadre) return;
    $('#rc-etat').textContent = `Nouvelle taille : ${nombre(this.cadre.l)} × ${nombre(this.cadre.h)} pixels`;
    $('[data-action="recadrage-appliquer"]').disabled = !this.aDuTravail();
    $('#rc-zone-redresser').hidden = !this._photo();
    const v = Number($('#rc-redresser').value);
    $('#rc-redresser').parentElement.querySelector('output').textContent = (v > 0 ? '+' : '') + v + '°';
  },

  /* À l'écran : l'extérieur du cadre assombri, le cadre, une grille en
     tiers (pour placer le sujet) et les quatre coins. */
  dessiner(ctx) {
    if (!this.cadre) return;
    const d = Montage.doc;
    const coins = this._coinsEcran();
    const a = Editeur.montageVersEcran(0, 0), b = Editeur.montageVersEcran(d.largeur, d.hauteur);
    ctx.save();
    ctx.beginPath();
    ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.rect(coins[0].x, coins[0].y, coins[2].x - coins[0].x, coins[2].y - coins[0].y);
    ctx.fillStyle = 'rgba(16, 13, 24, 0.62)';
    ctx.fill('evenodd');
    const [x0, y0] = [coins[0].x, coins[0].y], lw = coins[2].x - x0, lh = coins[2].y - y0;
    ctx.strokeStyle = 'rgba(214, 194, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const k of [1, 2]) {
      ctx.moveTo(x0 + (lw * k) / 3, y0); ctx.lineTo(x0 + (lw * k) / 3, y0 + lh);
      ctx.moveTo(x0, y0 + (lh * k) / 3); ctx.lineTo(x0 + lw, y0 + (lh * k) / 3);
    }
    ctx.stroke();
    traitDouble(ctx, () => { ctx.beginPath(); ctx.rect(x0, y0, lw, lh); }, 2);
    // Les coins en « L », bien visibles pour le doigt
    const t = Math.min(26, lw / 3, lh / 3);
    ctx.lineCap = 'round';
    coins.forEach((p, i) => {
      const sx = i === 0 || i === 3 ? 1 : -1, sy = i < 2 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(p.x + sx * t, p.y);
      ctx.lineTo(p.x, p.y);
      ctx.lineTo(p.x, p.y + sy * t);
      ctx.strokeStyle = '#14111d'; ctx.lineWidth = 9; ctx.stroke();
      ctx.strokeStyle = '#a777ff'; ctx.lineWidth = 5; ctx.stroke();
    });
    ctx.restore();
  }
};
