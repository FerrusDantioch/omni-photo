/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   Le dessin du montage.

   ⚠️ Ce même code dessine le montage À L'ÉCRAN et dans le FICHIER
   EXPORTÉ : ainsi, ce qu'on voit est exactement ce qu'on obtient.
   Ne jamais dessiner un calque autrement à l'export.
   ============================================================ */
'use strict';

const Rendu = {
  /* Une petite toile cachée qui sert seulement à mesurer les textes. */
  _mesureur: null,
  _cacheMesures: new Map(),

  /* Aperçus des retouches en cours : numéro d'image → image retouchée.
     Seulement à l'écran ; jamais dans le fichier exporté tant que la
     retouche n'est pas validée. */
  remplacements: new Map(),

  /* Pendant la retouche au pinceau : l'image d'origine montrée en
     transparence sous le sujet (pour voir ce qu'on peut restaurer).
     Écran seulement. */
  fantomes: new Map(),

  _ctxMesure() {
    if (!this._mesureur) this._mesureur = document.createElement('canvas').getContext('2d');
    return this._mesureur;
  },

  /* Découpe un texte en lignes et mesure la boîte qui l'entoure.
     Renvoie { largeur, hauteur, lignes, interligne, marge }. */
  mesurerTexte(c) {
    const cle = [c.texte, c.police, c.taille, c.gras, c.contour.actif && c.contour.epaisseur].join('|');
    const connu = this._cacheMesures.get(cle);
    if (connu) return connu;

    const ctx = this._ctxMesure();
    ctx.font = Polices.css(c.police, c.taille, c.gras);
    const lignes = String(c.texte).split('\n');
    const interligne = c.taille * 1.25;
    let largeurMax = 0;
    for (const l of lignes) largeurMax = Math.max(largeurMax, ctx.measureText(l).width);
    // Un peu de marge autour, pour les lettres qui dépassent (j, g, f…)
    // et pour le contour.
    const marge = c.taille * 0.2 + (c.contour.actif ? c.contour.epaisseur * c.taille : 0);
    const mesure = {
      largeur: Math.max(c.taille * 0.5, largeurMax) + marge * 2,
      hauteur: lignes.length * interligne + marge * 2,
      lignes, interligne, marge
    };
    // On ne garde que les mesures récentes
    if (this._cacheMesures.size > 200) this._cacheMesures.clear();
    this._cacheMesures.set(cle, mesure);
    return mesure;
  },

  /* À appeler quand les polices viennent d'arriver : les mesures faites
     avec la police de secours ne sont plus justes. */
  oublierMesures() {
    this._cacheMesures.clear();
  },

  /* Taille d'origine d'un calque (avant agrandissement), en pixels. */
  tailleCalque(c) {
    if (c.type === 'texte') {
      const m = this.mesurerTexte(c);
      return { largeur: m.largeur, hauteur: m.hauteur };
    }
    return { largeur: c.largeur, hauteur: c.hauteur };
  },

  /* Dessine tout le montage sur « ctx ». La toile doit déjà être réglée
     pour qu'un pixel du montage = une unité de dessin.
     options.ecran : vrai pour l'affichage (images réduites si possible),
     options.zoom  : combien de pixels d'écran pour un pixel du montage. */
  dessinerMontage(ctx, doc, options = {}) {
    for (const c of doc.calques) {
      if (!c.visible) continue;
      this.dessinerCalque(ctx, c, { ...options, doc });
    }
  },

  dessinerCalque(ctx, c, options = {}) {
    ctx.save();
    ctx.globalAlpha = limiter(c.opacite, 0, 1);
    // Le fond remplit toute l'image, sans déplacement ni rotation (fond.js)
    if (c.type === 'fond') {
      if (options.doc) dessinerFond(ctx, c, options.doc, options);
      ctx.restore();
      return;
    }
    ctx.translate(c.x, c.y);
    ctx.rotate((c.rotation * Math.PI) / 180);
    ctx.scale(c.echelle * (c.miroirH ? -1 : 1), c.echelle * (c.miroirV ? -1 : 1));

    if (c.type === 'image') {
      const largeurEcran = c.largeur * c.echelle * (options.zoom || 1);
      // Pendant une retouche, l'écran montre l'aperçu (pas encore validé)
      const apercu = options.ecran && !options.miniature && this.remplacements.get(c.ressource);
      const image = apercu || (options.ecran ? Ressources.pourEcran(c.ressource, largeurEcran) : (Ressources.obtenir(c.ressource) || {}).image);
      const fantome = options.ecran && !options.miniature && this.fantomes.get(c.ressource);
      // Lumière et filtres (lumiere.js) : appliqués au dessin, l'image ne change pas
      const filtre = c.reglages ? Lumiere.filtre(c.reglages) : 'none';
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (fantome) {
        const alpha = ctx.globalAlpha;
        ctx.globalAlpha = alpha * 0.3;
        ctx.drawImage(fantome, -c.largeur / 2, -c.hauteur / 2, c.largeur, c.hauteur);
        ctx.globalAlpha = alpha;
      }
      if (image) {
        if (Effets.actif(c)) Effets.dessinerImage(ctx, c, image, filtre, !!options.ecran);
        else {
          ctx.filter = filtre;
          ctx.drawImage(image, -c.largeur / 2, -c.hauteur / 2, c.largeur, c.hauteur);
          ctx.filter = 'none';
        }
      }
    } else if (c.type === 'texte') {
      this._dessinerTexte(ctx, c);
    } else if (c.type === 'forme') {
      Formes.dessiner(ctx, c);
    }
    ctx.restore();
  },

  _dessinerTexte(ctx, c) {
    const m = this.mesurerTexte(c);
    ctx.font = Polices.css(c.police, c.taille, c.gras);
    ctx.textBaseline = 'middle';
    let x;
    if (c.alignement === 'gauche') { ctx.textAlign = 'left'; x = -m.largeur / 2 + m.marge; }
    else if (c.alignement === 'droite') { ctx.textAlign = 'right'; x = m.largeur / 2 - m.marge; }
    else { ctx.textAlign = 'center'; x = 0; }
    const yDebut = -m.hauteur / 2 + m.marge + m.interligne / 2;

    const avecContour = c.contour.actif && c.contour.epaisseur > 0;
    // Ombre : le flou et le décalage de l'ombre ne suivent pas le zoom de
    // la toile tout seuls (ils sont comptés en pixels réels). On mesure
    // donc de combien la toile est agrandie à cet endroit.
    const t = ctx.getTransform();
    const echelleOmbre = Math.hypot(t.a, t.b);
    const reglerOmbre = (actif) => {
      if (actif && c.ombre.actif) {
        ctx.shadowColor = c.ombre.couleur + 'b3';   // ombre à 70 % d'opacité
        ctx.shadowBlur = c.ombre.flou * c.taille * echelleOmbre;
        const d = c.ombre.distance * c.taille * echelleOmbre;
        // L'ombre tombe toujours vers le bas à droite de l'écran
        ctx.shadowOffsetX = d;
        ctx.shadowOffsetY = d;
      } else {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }
    };

    m.lignes.forEach((ligne, i) => {
      const y = yDebut + i * m.interligne;
      if (avecContour) {
        // Le contour est dessiné SOUS les lettres (sinon il les mange)
        reglerOmbre(true);
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.lineWidth = c.contour.epaisseur * c.taille * 2;
        ctx.strokeStyle = c.contour.couleur;
        ctx.strokeText(ligne, x, y);
        reglerOmbre(false);
      } else {
        reglerOmbre(true);
      }
      ctx.fillStyle = c.couleur;
      ctx.fillText(ligne, x, y);
    });
  },

  /* Le damier gris qui montre les zones transparentes (à l'écran
     seulement : il n'est jamais dans le fichier exporté). */
  _motifDamier: null,
  damier(ctx) {
    if (!this._motifDamier) {
      const t = document.createElement('canvas');
      t.width = t.height = 24;
      const c = t.getContext('2d');
      c.fillStyle = '#4a4458';
      c.fillRect(0, 0, 24, 24);
      c.fillStyle = '#3a3547';
      c.fillRect(0, 0, 12, 12);
      c.fillRect(12, 12, 12, 12);
      this._motifDamier = ctx.createPattern(t, 'repeat');
    }
    return this._motifDamier;
  }
};
