/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   « Ma signature » : un texte, un logo ou une forme, enregistré une
   fois, puis ajouté en un toucher sur chaque montage (comme un
   filigrane), à la même place et à la même taille (en proportion de
   l'image).

   Rangement dans le téléphone :
   - la description du calque : localStorage « omniphoto-signature » ;
   - pour un logo, son image : base « omniphoto », tiroir « images »,
     clé « signature » (le ménage des images ne la touche jamais).
   ============================================================ */
'use strict';

const Signature = {
  CLE: 'omniphoto-signature',
  CLE_IMAGE: 'signature',

  _lire() {
    try { return JSON.parse(localStorage.getItem(this.CLE) || 'null'); } catch (e) { return null; }
  },

  existe() {
    return !!this._lire();
  },

  /* Enregistre le calque « c » comme signature. */
  async enregistrer(c) {
    if (!c || c.type === 'fond') return;
    const d = Montage.doc;
    const petit = Math.min(d.largeur, d.hauteur);
    const { largeur } = Rendu.tailleCalque(c);
    const copie = JSON.parse(JSON.stringify(c));
    for (const k of ['id', 'x', 'y', 'ressource', 'source', 'verrouille']) delete copie[k];
    copie.part = (largeur * c.echelle) / petit;        // sa largeur, en part du petit côté de l'image
    copie.rx = c.x / d.largeur;                        // sa place, en part de l'image
    copie.ry = c.y / d.hauteur;
    try {
      if (c.type === 'image') {
        const r = Ressources.obtenir(c.ressource);
        if (!r) return;
        const blob = r.blob || await Sauvegarde._versFichier(r.image);
        await Base.ecrire('images', this.CLE_IMAGE, { blob, maxCote: r.maxCote });
      }
      localStorage.setItem(this.CLE, JSON.stringify(copie));
      Message.montrer('C\'est ta signature ✓ Ajoute-la sur un montage avec « Signature » (onglet « Ajouter »).');
    } catch (e) {
      console.warn(e);
      Message.erreur('La signature n\'a pas pu être enregistrée. Ton téléphone manque peut-être de place.');
    }
  },

  /* Ajoute la signature sur le montage ouvert (une étape d'« Annuler »). */
  async ajouter() {
    const modele = this._lire();
    if (!modele) {
      Message.montrer('Tu n\'as pas encore de signature. Choisis un texte, un logo ou une forme, puis touche « Enregistrer comme ma signature ».');
      return;
    }
    const d = Montage.doc;
    const c = JSON.parse(JSON.stringify(modele));
    delete c.part; delete c.rx; delete c.ry;
    c.id = nouvelId('c');
    if (c.type === 'image') {
      try {
        const enregistre = await Base.lire('images', this.CLE_IMAGE);
        if (!enregistre) throw new Error('absente');
        const r = await Ressources.depuisFichier(enregistre.blob, enregistre.maxCote || LIMITES.calque);
        Object.assign(c, { ressource: r.id, largeur: r.largeur, hauteur: r.hauteur });
      } catch (e) {
        console.warn(e);
        Message.erreur('L\'image de ta signature n\'a pas été retrouvée. Enregistre-la à nouveau.');
        return;
      }
    }
    // Même place et même taille, en proportion de cette image-ci
    const petit = Math.min(d.largeur, d.hauteur);
    c.echelle = 1;
    const { largeur } = Rendu.tailleCalque(c);
    c.echelle = Math.max(0.01, (modele.part * petit) / Math.max(1, largeur));
    c.x = limiter(modele.rx * d.largeur, 0, d.largeur);
    c.y = limiter(modele.ry * d.hauteur, 0, d.hauteur);
    c.verrouille = false;
    Historique.action(() => {
      d.calques.push(c);
      Montage.selection = c.id;
      Montage.signaler();
    });
    Message.montrer('Signature ajoutée ✓');
  }
};
