/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   L'effet « autocollant » d'une image (surtout d'un sujet détouré) :
   - un CONTOUR de couleur tout autour de la forme ;
   - une OMBRE portée dessous.

   Comme la lumière, l'effet ne modifie pas l'image : il est rangé dans le
   calque et dessiné au moment voulu (à l'écran comme à l'export).
     calque.effet = {
       contour: { actif, couleur, epaisseur },   // épaisseur : fraction du petit côté
       ombre:   { actif, couleur, flou, distance }
     }
   ============================================================ */
'use strict';

const Effets = {
  /* Contours déjà fabriqués, rangés avec leur image (ils disparaissent
     avec elle). */
  _cache: new WeakMap(),

  actif(c) {
    return !!(c.effet && ((c.effet.contour && c.effet.contour.actif) || (c.effet.ombre && c.effet.ombre.actif)));
  },

  /* La forme de l'image, « gonflée » de « r » pixels et remplie de la
     couleur du contour. Renvoie { toile, marge }. */
  _contour(image, couleur, r, garder) {
    const cle = couleur + '|' + r.toFixed(1);
    let parImage = this._cache.get(image);
    if (parImage && parImage.has(cle)) return parImage.get(cle);
    const iw = image.width, ih = image.height;
    const marge = Math.ceil(r) + 2;
    // La silhouette : la forme de l'image, toute de la couleur choisie
    const { toile: silhouette, ctx: cs } = nouvelleToile(iw, ih);
    cs.drawImage(image, 0, 0);
    cs.globalCompositeOperation = 'source-in';
    cs.fillStyle = couleur;
    cs.fillRect(0, 0, iw, ih);
    // Posée tout autour, dans toutes les directions : elle s'épaissit
    const { toile, ctx } = nouvelleToile(iw + marge * 2, ih + marge * 2);
    const anneaux = r > 6 ? [1, 0.66, 0.33] : [1, 0.5];
    for (const k of anneaux) {
      const rr = r * k;
      const n = Math.min(48, Math.max(12, Math.ceil((2 * Math.PI * rr) / 3)));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        ctx.drawImage(silhouette, marge + rr * Math.cos(a), marge + rr * Math.sin(a));
      }
    }
    ctx.drawImage(silhouette, marge, marge);
    silhouette.width = 0;
    const resultat = { toile, marge, enReserve: garder };
    if (garder) {
      if (!parImage) { parImage = new Map(); this._cache.set(image, parImage); }
      if (parImage.size > 3) parImage.clear();
      parImage.set(cle, resultat);
    }
    return resultat;
  },

  /* Dessine l'image du calque avec son effet (la toile est déjà placée
     sur le calque : origine au centre, unités = pixels de l'image). */
  dessinerImage(ctx, c, image, filtre, ecran) {
    const e = c.effet;
    const l = c.largeur, h = c.hauteur;
    const t = ctx.getTransform();
    const echelleEcran = Math.hypot(t.a, t.b);          // pixels réels par pixel de l'image
    const petit = Math.min(l, h);
    const ombre = e.ombre && e.ombre.actif;
    const reglerOmbre = (oui) => {
      if (oui && ombre) {
        ctx.shadowColor = e.ombre.couleur + '99';        // 60 % d'opacité
        ctx.shadowBlur = e.ombre.flou * petit * echelleEcran;
        const d = e.ombre.distance * petit * echelleEcran;
        ctx.shadowOffsetX = d;
        ctx.shadowOffsetY = d;
      } else {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
      }
    };
    if (e.contour && e.contour.actif && e.contour.epaisseur > 0) {
      // L'image utilisée peut être réduite (affichage) : l'épaisseur suit
      const s = image.width / l;
      const r = Math.max(1, e.contour.epaisseur * petit * s);
      const { toile, marge } = this._contour(image, e.contour.couleur, r, ecran);
      const m = marge / s;
      reglerOmbre(true);            // l'ombre est celle de la forme avec son contour
      ctx.drawImage(toile, -l / 2 - m, -h / 2 - m, l + 2 * m, h + 2 * m);
      reglerOmbre(false);
      // Fabriqué juste pour l'export (pas gardé en réserve) : on libère la mémoire
      if (!this._cache.get(image) || ![...this._cache.get(image).values()].some((x) => x.toile === toile)) toile.width = 0;
      ctx.filter = filtre;          // la lumière ne touche que l'image, pas le contour
      ctx.drawImage(image, -l / 2, -h / 2, l, h);
      ctx.filter = 'none';
    } else {
      reglerOmbre(true);
      ctx.filter = filtre;
      ctx.drawImage(image, -l / 2, -h / 2, l, h);
      ctx.filter = 'none';
      reglerOmbre(false);
    }
  }
};


/* La fenêtre « Contour et ombre » d'une image. Tout ce qu'on y règle =
   une étape d'« Annuler ». */
const FenetreEffets = {
  _id: null,

  initialiser() {
    const f = $('#fenetre-effets');
    f.addEventListener('input', () => this.appliquer());
    f.addEventListener('change', () => this.appliquer());
    f.addEventListener('close', () => { this._id = null; Historique.fin(); });
  },

  ouvrir(id) {
    const c = Montage.calque(id);
    if (!c || c.type !== 'image') return;
    this._id = id;
    Historique.debut();
    const e = c.effet || {};
    const contour = Object.assign({ actif: true, couleur: '#ffffff', epaisseur: 0.02 }, e.contour);
    const ombre = Object.assign({ actif: !e.contour, couleur: '#000000', flou: 0.03, distance: 0.02 }, e.ombre);
    if (!c.effet) { contour.actif = true; ombre.actif = true; }
    $('#ef-contour').checked = contour.actif;
    $('#ef-contour-couleur').value = contour.couleur;
    $('#ef-contour-epaisseur').value = Math.round(contour.epaisseur * 1000) / 10;
    $('#ef-ombre').checked = ombre.actif;
    $('#ef-ombre-couleur').value = ombre.couleur;
    $('#ef-ombre-flou').value = Math.round(ombre.flou * 1000) / 10;
    $('#ef-ombre-distance').value = Math.round(ombre.distance * 1000) / 10;
    $('#ef-conseil').hidden = !!c.source;
    $('#fenetre-effets').showModal();
    this.appliquer();
  },

  appliquer() {
    const c = Montage.calque(this._id);
    if (!c) return;
    for (const el of $$('#fenetre-effets input[type="range"]')) el.parentElement.querySelector('output').textContent = el.value + ' %';
    $('#ef-zone-contour').classList.toggle('inactif', !$('#ef-contour').checked);
    $('#ef-zone-ombre').classList.toggle('inactif', !$('#ef-ombre').checked);
    const effet = {
      contour: { actif: $('#ef-contour').checked, couleur: $('#ef-contour-couleur').value, epaisseur: Number($('#ef-contour-epaisseur').value) / 100 },
      ombre: {
        actif: $('#ef-ombre').checked, couleur: $('#ef-ombre-couleur').value,
        flou: Number($('#ef-ombre-flou').value) / 100, distance: Number($('#ef-ombre-distance').value) / 100
      }
    };
    Montage.modifier(c.id, { effet: effet.contour.actif || effet.ombre.actif ? effet : undefined });
  }
};
