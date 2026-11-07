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
    ($(`input[name="lu-filtre"][value="${r.filtre}"]`) || $('input[name="lu-filtre"]')).checked = true;
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
