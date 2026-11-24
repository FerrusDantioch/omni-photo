/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   « Lumière » : luminosité, contraste, saturation, chaleur des couleurs
   et filtres tout prêts (noir et blanc, sépia, vintage…).

   Ces réglages ne modifient PAS l'image : ils sont rangés dans le calque
   (calque.reglages) et appliqués au moment du dessin, à l'écran comme à
   l'export (filtres du navigateur, « ctx.filter »). On peut donc les
   changer ou les retirer à tout moment.

   calque.reglages = { lumiere, contraste, saturation, chaleur, filtre }
   (les quatre premiers de -100 à +100, 0 = sans changement).
   ============================================================ */
'use strict';

const FILTRES = {
  aucun:      { nom: 'Aucun', css: '' },
  nb:         { nom: 'Noir et blanc', css: 'grayscale(1)' },
  sepia:      { nom: 'Sépia', css: 'sepia(0.8)' },
  vintage:    { nom: 'Vintage', css: 'sepia(0.35) contrast(0.92) saturate(0.85) brightness(1.04)' },
  doux:       { nom: 'Doux', css: 'contrast(0.9) saturate(0.9) brightness(1.05)' },
  vif:        { nom: 'Vif', css: 'saturate(1.4) contrast(1.08)' },
  froid:      { nom: 'Froid', chaleur: -45, css: 'saturate(0.95)' },
  dramatique: { nom: 'Dramatique', css: 'contrast(1.35) saturate(0.85) brightness(0.95)' }
};

const Lumiere = {
  /* Des réglages sans aucun effet ? */
  neutre(r) {
    return !r || (!r.lumiere && !r.contraste && !r.saturation && !r.chaleur && (!r.filtre || r.filtre === 'aucun'));
  },

  /* Le texte de filtre pour la toile, par exemple
     « url(#omni-chaleur-20) brightness(1.1) contrast(1) saturate(1.2) ». */
  filtre(r) {
    if (this.neutre(r)) return 'none';
    const preset = FILTRES[r.filtre] || FILTRES.aucun;
    const parties = [];
    const chaleur = limiter((r.chaleur || 0) + (preset.chaleur || 0), -100, 100);
    if (chaleur) parties.push(`url(#${this._filtreChaleur(chaleur)})`);
    if (r.lumiere) parties.push(`brightness(${(1 + r.lumiere * 0.005).toFixed(3)})`);
    if (r.contraste) parties.push(`contrast(${(1 + r.contraste * 0.006).toFixed(3)})`);
    if (r.saturation) parties.push(`saturate(${Math.max(0, 1 + r.saturation * 0.01).toFixed(3)})`);
    if (preset.css) parties.push(preset.css);
    return parties.join(' ') || 'none';
  },

  /* La « chaleur » n'existe pas parmi les filtres du navigateur : on la
     fabrique avec un petit filtre SVG (une « matrice de couleurs » qui
     renforce le rouge et baisse le bleu, ou l'inverse). Un filtre par
     cran de 5, créé à la première demande. */
  _filtreChaleur(valeur) {
    const cran = Math.round(valeur / 5) * 5;
    const id = 'omni-chaleur-' + (cran < 0 ? 'm' + -cran : cran);
    if (!document.getElementById(id)) {
      const k = Math.abs(cran) / 100;
      const [r, g, b] = cran > 0 ? [1 + 0.14 * k, 1 + 0.03 * k, 1 - 0.2 * k] : [1 - 0.16 * k, 1 + 0.02 * k, 1 + 0.18 * k];
      const ns = 'http://www.w3.org/2000/svg';
      let svg = document.getElementById('filtres-svg');
      if (!svg) {
        svg = document.createElementNS(ns, 'svg');
        svg.id = 'filtres-svg';
        svg.setAttribute('width', '0');
        svg.setAttribute('height', '0');
        svg.setAttribute('aria-hidden', 'true');
        svg.style.position = 'absolute';
        document.body.append(svg);
      }
      const filtre = document.createElementNS(ns, 'filter');
      filtre.id = id;
      filtre.setAttribute('color-interpolation-filters', 'sRGB');
      const m = document.createElementNS(ns, 'feColorMatrix');
      m.setAttribute('type', 'matrix');
      m.setAttribute('values', `${r} 0 0 0 0  0 ${g} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`);
      filtre.append(m);
      svg.append(filtre);
    }
    return id;
  },

  _cachePixels: new WeakMap(),

  _appliquerPixels(d, r) {
    const preset = FILTRES[r.filtre] || FILTRES.aucun;
    const chaleur = limiter((r.chaleur || 0) + (preset.chaleur || 0), -100, 100);
    const cran = Math.round(chaleur / 5) * 5;
    const etapes = [];
    if (cran) {
      const k = Math.abs(cran) / 100;
      const [mr, mg, mb] = cran > 0 ? [1 + 0.14 * k, 1 + 0.03 * k, 1 - 0.2 * k] : [1 - 0.16 * k, 1 + 0.02 * k, 1 + 0.18 * k];
      etapes.push({ type: 'diag', mr, mg, mb });
    }
    if (r.lumiere) etapes.push({ type: 'lumiere', v: Math.max(0, 1 + r.lumiere * 0.005) });
    if (r.contraste) etapes.push({ type: 'contraste', v: Math.max(0, 1 + r.contraste * 0.006) });
    if (r.saturation) etapes.push({ type: 'saturation', v: Math.max(0, 1 + r.saturation * 0.01) });
    if (preset.css) {
      const re = /([a-z-]+)\(([^)]+)\)/gi;
      let m;
      while ((m = re.exec(preset.css))) {
        const fn = m[1].toLowerCase(), val = parseFloat(m[2]);
        if (!Number.isFinite(val)) continue;
        if (fn === 'grayscale') etapes.push({ type: 'saturation', v: 1 - limiter(val, 0, 1) });
        else if (fn === 'sepia') etapes.push({ type: 'sepia', v: limiter(val, 0, 1) });
        else if (fn === 'contrast') etapes.push({ type: 'contraste', v: Math.max(0, val) });
        else if (fn === 'saturate') etapes.push({ type: 'saturation', v: Math.max(0, val) });
        else if (fn === 'brightness') etapes.push({ type: 'lumiere', v: Math.max(0, val) });
      }
    }
    if (!etapes.length) return;
    const clamp = (v) => (v < 0 ? 0 : (v > 255 ? 255 : v));
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      let R = d[i], G = d[i + 1], B = d[i + 2];
      for (const e of etapes) {
        if (e.type === 'diag') {
          R = clamp(R * e.mr); G = clamp(G * e.mg); B = clamp(B * e.mb);
        } else if (e.type === 'lumiere') {
          R = clamp(R * e.v); G = clamp(G * e.v); B = clamp(B * e.v);
        } else if (e.type === 'contraste') {
          R = clamp((R - 127.5) * e.v + 127.5);
          G = clamp((G - 127.5) * e.v + 127.5);
          B = clamp((B - 127.5) * e.v + 127.5);
        } else if (e.type === 'saturation') {
          const s = e.v;
          const nr = clamp((0.213 + 0.787 * s) * R + (0.715 - 0.715 * s) * G + (0.072 - 0.072 * s) * B);
          const ng = clamp((0.213 - 0.213 * s) * R + (0.715 + 0.285 * s) * G + (0.072 - 0.072 * s) * B);
          const nb = clamp((0.213 - 0.213 * s) * R + (0.715 - 0.715 * s) * G + (0.072 + 0.928 * s) * B);
          R = nr; G = ng; B = nb;
        } else if (e.type === 'sepia') {
          const t = 1 - e.v;
          const nr = clamp((0.393 + 0.607 * t) * R + (0.769 - 0.769 * t) * G + (0.189 - 0.189 * t) * B);
          const ng = clamp((0.349 - 0.349 * t) * R + (0.686 + 0.314 * t) * G + (0.168 - 0.168 * t) * B);
          const nb = clamp((0.272 - 0.272 * t) * R + (0.534 - 0.534 * t) * G + (0.131 + 0.869 * t) * B);
          R = nr; G = ng; B = nb;
        }
      }
      d[i] = Math.round(R);
      d[i + 1] = Math.round(G);
      d[i + 2] = Math.round(B);
    }
  },

  dessinerAvecFiltre(ctx, image, x, y, l, h, reglages, garder = false) {
    if (!reglages || this.neutre(reglages)) {
      ctx.drawImage(image, x, y, l, h);
      return;
    }
    const cle = this.filtre(reglages);
    if (garder) {
      const entree = this._cachePixels.get(image);
      if (entree && entree.cle === cle) {
        ctx.drawImage(entree.toile, x, y, l, h);
        return;
      }
    }
    const iw = image.width, ih = image.height;
    if (!iw || !ih) return;
    let toile = null;
    try {
      const cree = nouvelleToile(iw, ih);
      toile = cree.toile;
      const ct = cree.ctx;
      ct.drawImage(image, 0, 0);
      const img = ct.getImageData(0, 0, iw, ih);
      this._appliquerPixels(img.data, reglages);
      ct.putImageData(img, 0, 0);
      if (garder) {
        const precedent = this._cachePixels.get(image);
        if (precedent && precedent.toile) precedent.toile.width = precedent.toile.height = 0;
        this._cachePixels.set(image, { cle, toile });
        ctx.drawImage(toile, x, y, l, h);
        toile = null;
      } else {
        ctx.drawImage(toile, x, y, l, h);
      }
    } finally {
      if (toile) toile.width = toile.height = 0;
    }
  }
};


/* L'outil « Lumière » : des curseurs, sans geste sur la photo (un doigt
   déplace la vue, deux doigts zooment). Tout ce qu'on règle pendant que
   l'outil est ouvert = une seule étape d'« Annuler ». */
const OutilLumiere = {
  panneau: 'outil-lumiere',
  calque: null,

  commencer(c) {
    this.calque = c;
    Historique.debut();
    this._remplir();
  },

  _reglages() {
    const c = Montage.calque(this.calque.id);
    return Object.assign({ lumiere: 0, contraste: 0, saturation: 0, chaleur: 0, filtre: 'aucun' }, (c && c.reglages) || {});
  },

  _remplir() {
    const r = this._reglages();
    for (const k of ['lumiere', 'contraste', 'saturation', 'chaleur']) $('#lu-' + k).value = r[k];
    ($(`input[name="lu-filtre"][value="${CSS.escape(String(r.filtre))}"]`) || $('input[name="lu-filtre"]')).checked = true;
    this.majPanneau();
  },

  /* Un curseur ou un filtre vient de bouger : on l'applique tout de suite. */
  appliquer() {
    const c = Montage.calque(this.calque.id);
    if (!c) return;
    const r = {
      lumiere: Number($('#lu-lumiere').value), contraste: Number($('#lu-contraste').value),
      saturation: Number($('#lu-saturation').value), chaleur: Number($('#lu-chaleur').value),
      filtre: ($('input[name="lu-filtre"]:checked') || {}).value || 'aucun'
    };
    Montage.modifier(c.id, { reglages: Lumiere.neutre(r) ? undefined : r });
    this.majPanneau();
  },

  /* « Auto » : on regarde les couleurs de la photo (une petite copie) et
     on corrige ce qui en a besoin : trop sombre ou trop claire, terne,
     teinte bleutée ou trop rouge. On peut ensuite ajuster à la main. */
  auto() {
    const c = Montage.calque(this.calque.id);
    const r = c && Ressources.obtenir(c.ressource);
    if (!r) return;
    const f = Math.min(1, 200 / Math.max(r.largeur, r.hauteur));
    const l = Math.max(1, Math.round(r.largeur * f)), h = Math.max(1, Math.round(r.hauteur * f));
    const { toile, ctx } = nouvelleToile(l, h);
    ctx.drawImage(r.image, 0, 0, l, h);
    const d = ctx.getImageData(0, 0, l, h).data;
    toile.width = 0;
    const histo = new Uint32Array(256);
    let n = 0, somme = 0, sat = 0, rouge = 0, bleu = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;          // les zones transparentes ne comptent pas
      const R = d[i], G = d[i + 1], B = d[i + 2];
      const y = Math.round(0.299 * R + 0.587 * G + 0.114 * B);
      histo[y]++; n++; somme += y;
      sat += (Math.max(R, G, B) - Math.min(R, G, B)) / 255;
      rouge += R; bleu += B;
    }
    if (!n) return;
    // Le 2e et le 98e « centile » : où commencent les noirs et les blancs
    const centile = (p) => { let k = 0; for (let v = 0; v < 256; v++) { k += histo[v]; if (k >= p * n) return v / 255; } return 1; };
    const moyenne = somme / n / 255, bas = centile(0.02), haut = centile(0.98);
    const ecart = Math.max(0.05, haut - bas);
    const teinte = (bleu - rouge) / n / 255;   // > 0 : bleutée ; < 0 : rougeâtre
    const reglages = {
      lumiere: Math.round(limiter((0.5 - moyenne) * 160, -60, 60)),
      contraste: Math.round(ecart < 0.85 ? limiter((0.85 / ecart - 1) * 60, 0, 50) : 0),
      saturation: Math.round(sat / n < 0.18 ? limiter((0.18 - sat / n) * 200, 0, 35) : 0),
      chaleur: Math.round(teinte > 0.04 ? limiter(teinte * 300, 0, 40) : (teinte < -0.15 ? -limiter((-teinte - 0.15) * 150, 0, 30) : 0))
    };
    for (const [k, v] of Object.entries(reglages)) $('#lu-' + k).value = v;
    $('input[name="lu-filtre"][value="aucun"]').checked = true;
    this.appliquer();
    Message.montrer('Réglage automatique appliqué ✓ Tu peux encore l\'ajuster avec les curseurs.');
  },

  reinitialiser() {
    const c = Montage.calque(this.calque.id);
    if (c) Montage.modifier(c.id, { reglages: undefined });
    this._remplir();
  },

  aDuTravail() { return false; },   // tout est déjà appliqué : rien ne se perd en fermant
  retirerDernier() { return false; },

  fermer() {
    if (Editeur.outil === this) Editeur.choisirOutil(null);
    Historique.fin();
  },

  majPanneau() {
    for (const k of ['lumiere', 'contraste', 'saturation', 'chaleur']) {
      const el = $('#lu-' + k);
      const v = Number(el.value);
      el.parentElement.querySelector('output').textContent = (v > 0 ? '+' : '') + v;
    }
  }
};
