/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   Les polices proposées pour les textes.
   Les fichiers .woff2 sont rangés DANS l'application (à côté de ce
   fichier) : ils marchent donc hors ligne. Toutes sont sous licence
   Apache 2.0 (voir LICENCES-TIERS.md). Elles sont déclarées dans
   styles.css (« @font-face »).
   La police « Simple » est celle du téléphone lui-même (Roboto sur
   Android) : rien à inclure.
   ============================================================ */
'use strict';

const POLICES = [
  { id: 'simple',           nom: 'Simple',           famille: 'system-ui, "Roboto", "Segoe UI", sans-serif' },
  { id: 'roboto-slab',      nom: 'Roboto Slab',      famille: '"Roboto Slab", serif' },
  { id: 'special-elite',    nom: 'Machine à écrire', famille: '"Special Elite", serif' },
  { id: 'permanent-marker', nom: 'Feutre',           famille: '"Permanent Marker", cursive' },
  { id: 'luckiest-guy',     nom: 'Affiche',          famille: '"Luckiest Guy", sans-serif' },
  { id: 'coming-soon',      nom: 'Écriture',         famille: '"Coming Soon", cursive' },
  { id: 'satisfy',          nom: 'Élégante',         famille: '"Satisfy", cursive' }
];

const Polices = {
  /* Donne la police demandée (ou « Simple » si le nom est inconnu). */
  trouver(id) {
    return POLICES.find((p) => p.id === id) || POLICES[0];
  },

  /* Le texte de réglage de la police pour la toile, par exemple
     « 700 80px "Roboto Slab", serif ». */
  css(id, taille, gras) {
    return `${gras ? 700 : 400} ${taille}px ${this.trouver(id).famille}`;
  },

  /* Charge toutes les polices dès le démarrage. La toile de dessin
     n'attend pas les polices toute seule : sans cela, le premier texte
     s'afficherait dans une police de secours. Renvoie une promesse. */
  charger() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const demandes = [];
    for (const p of POLICES) {
      if (p.id === 'simple') continue;
      demandes.push(document.fonts.load(this.css(p.id, 40, false), 'Aé'));
      demandes.push(document.fonts.load(this.css(p.id, 40, true), 'Aé'));
    }
    // Une police qui ne se charge pas n'empêche pas le reste de marcher
    this.pret = Promise.allSettled(demandes);
    return this.pret;
  },

  pret: Promise.resolve()
};
