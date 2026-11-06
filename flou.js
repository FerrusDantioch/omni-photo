/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   « Flou du fond » (effet portrait) : le sujet reste net, l'arrière-plan
   devient flou, comme avec un appareil photo à grande ouverture.

   Le sujet est trouvé par l'intelligence artificielle (ia.js) ; si l'image
   a déjà été détourée, on se sert directement de ce détourage.
   Pour éviter un halo autour du sujet, le fond est flouté SANS le sujet
   (ses couleurs ne « bavent » pas sur le fond), puis le sujet net est
   reposé par-dessus.
   ============================================================ */
'use strict';

const OutilFlou = {
  panneau: 'outil-flou',
  calque: null,
  base: null,       // l'image d'origine (nette)
  masque: null,     // toile : son opacité = le sujet
  apercu: null,     // l'aperçu (taille écran)
  voirOriginal: false,
  _calcul: false,

  commencer(c) {
    this.calque = c;
    this.apercu = null;
    this.masque = null;
    this.voirOriginal = false;
    const choix = $(`input[name="fl-modele"][value="${Detourage.modelePrefere()}"]`);
    if (choix) choix.checked = true;
    // Déjà détourée : l'origine est la photo, l'image actuelle donne le sujet
    if (c.source && Ressources.obtenir(c.source)) {
      this.base = Ressources.obtenir(c.source);
      this.masque = Ressources.obtenir(c.ressource).image;
      setTimeout(() => this._majApercu(), 0);
    } else {
      this.base = Ressources.obtenir(c.ressource);
    }
  },

  modele() {
    return ($('input[name="fl-modele"]:checked') || {}).value === 'personne' ? 'personne' : 'objet';
  },

  aDuTravail() {
    return !!this.apercu;
  },

  /* Force du flou, en pixels de l'image d'origine. */
  rayon(largeurImage) {
    return (Number($('#fl-force').value) / 100) * Math.max(largeurImage, 1) * 0.03 + 0.5;
  },

  async trouverSujet() {
    if (this._calcul) return;
    const modele = this.modele();
    Detourage.retenirModele(modele);
    this._calcul = true;
    this.majPanneau();
    const c = this.calque;
    const masque = await avecIA(modele, async (avancer) => {
      const m = await Detourage.masque(this.base, modele, avancer);
      avancer(1, 'Terminé');
      return m;
    });
    this._calcul = false;
    if (Editeur.outil !== this || this.calque !== c) return;
    if (!masque) { this.majPanneau(); return; }
    this.masque = masque;
    this._majApercu();
  },

  /* Fabrique l'image floutée à la taille « l × h ». */
  composer(l, h) {
    const base = this.base.image;
    const r = this.rayon(this.base.largeur) * (l / this.base.largeur);
    const { toile, ctx } = nouvelleToile(l, h);
    ctx.imageSmoothingQuality = 'high';
    // 1. La photo nette dessous (pour que les bords de l'image ne deviennent
    //    pas transparents), puis toute la photo floutée.
    ctx.drawImage(base, 0, 0, l, h);
    ctx.filter = `blur(${r}px)`;
    ctx.drawImage(base, 0, 0, l, h);
    ctx.filter = 'none';
    // 2. Le fond seul (sans le sujet), flouté : ses couleurs sont justes
    //    jusqu'au bord du sujet.
    const { toile: fond, ctx: cf } = nouvelleToile(l, h);
    cf.drawImage(base, 0, 0, l, h);
    cf.globalCompositeOperation = 'destination-out';
    cf.drawImage(this.masque, 0, 0, l, h);
    ctx.filter = `blur(${r}px)`;
    ctx.drawImage(fond, 0, 0);
    ctx.filter = 'none';
    // 3. Le sujet net par-dessus
    cf.globalCompositeOperation = 'copy';
    cf.drawImage(base, 0, 0, l, h);
    cf.globalCompositeOperation = 'destination-in';
    cf.drawImage(this.masque, 0, 0, l, h);
    ctx.drawImage(fond, 0, 0);
    fond.width = 0;
    return toile;
  },

  /* L'aperçu, à la taille de l'écran (rapide pendant qu'on règle la force). */
  _majApercu() {
    if (!this.masque || Editeur.outil !== this) return;
    const b = this.base;
    const f = Math.min(1, 1600 / Math.max(b.largeur, b.hauteur));
    try {
      if (this.apercu) this.apercu.width = 0;
      this.apercu = this.composer(Math.round(b.largeur * f), Math.round(b.hauteur * f));
    } catch (e) {
      Message.erreur(MESSAGES_PHOTO.memoire);
      return;
    }
    this._montrer();
  },

  reglerForce() {
    clearTimeout(this._minuteur);
    this._minuteur = setTimeout(() => this._majApercu(), 120);
    this.majPanneau();
  },

  basculerComparaison() {
    if (!this.apercu) return;
    this.voirOriginal = !this.voirOriginal;
    this._montrer();
  },

  _montrer() {
    Rendu.remplacements.clear();
    if (this.apercu && !this.voirOriginal) Rendu.remplacements.set(this.calque.ressource, this.apercu);
    this.majPanneau();
    Historique.majBoutons();
    Editeur.redessiner();
  },

  async valider() {
    if (!this.masque) return;
    Patience.montrer('Flou du fond en cours…');
    await laisserAfficher();
    try {
      const toile = this.composer(this.base.largeur, this.base.hauteur);
      // Le résultat est une photo entière (sans transparence) : l'image
      // d'origine d'un ancien détourage n'a plus lieu d'être.
      Retouche.valider(this.calque, toile, { oublierSource: true });
      this.fermer();
      Message.montrer('Fond flouté ✓ « Annuler » permet de revenir en arrière.');
    } catch (e) {
      console.warn(e);
      Message.erreur(MESSAGES_PHOTO.memoire);
    } finally {
      Patience.cacher();
    }
  },

  retirerDernier() {
    return false;
  },

  fermer() {
    if (Detourage._enCours) Detourage.arreter();
    if (this.apercu) this.apercu.width = 0;
    this.apercu = null;
    this.masque = null;
    this.base = null;
    Rendu.remplacements.clear();
    if (Editeur.outil === this) Editeur.choisirOutil(null);
  },

  majPanneau() {
    const pret = !!this.masque;
    $('#fl-etat').textContent = this._calcul ? 'Recherche du sujet…'
      : (pret ? (this.voirOriginal ? 'Tu vois la photo d\'origine.' : 'Aperçu : règle la force du flou, puis valide.')
        : 'Choisis le genre de sujet, puis touche « Trouver le sujet ».');
    $('#fl-choix').hidden = pret;
    $('#fl-reglage').hidden = !pret;
    $('[data-action="flou-lancer"]').disabled = this._calcul;
    for (const a of ['flou-comparer', 'flou-valider']) $(`[data-action="${a}"]`).disabled = !this.apercu;
    const s = $('#fl-force').parentElement.querySelector('output');
    if (s) s.textContent = $('#fl-force').value + ' %';
    const b = $('[data-action="flou-comparer"] .texte-bouton');
    if (b) b.textContent = this.voirOriginal ? 'Voir le flou' : 'Voir l\'original';
  }
};
