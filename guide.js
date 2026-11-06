/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   Le guide de la première fois : quatre petites bulles qui montrent
   l'essentiel, la première fois qu'on ouvre l'éditeur. Pas de voile sur
   l'écran, on peut les passer d'un toucher. « Revoir le guide » (À
   propos) le remontre.
   ============================================================ */
'use strict';

const ETAPES_GUIDE = [
  { cible: '.onglets', texte: 'Les outils sont rangés en trois onglets : « Ajouter » (texte, image, forme), « Retoucher » (recadrer, lumière, yeux rouges, découpe) et « Détourage » (retirer le fond, pinceau, nouveau fond, flou du fond).' },
  { cible: '.zone-toile', texte: 'Touche un texte ou une image pour le choisir. Un doigt le déplace, deux doigts l\'agrandissent et le tournent. Sans rien choisir, deux doigts zooment dans la photo.' },
  { cible: '[data-action="annuler"]', texte: 'Une erreur ? « Annuler » revient en arrière, jusqu\'à 30 fois. Ton montage est sauvegardé tout seul dans le téléphone.' },
  { cible: '[data-action="ouvrir-export"]', texte: 'Quand c\'est prêt, « Exporter » enregistre ton image en PNG ou en JPG, ou la partage.' }
];

const Guide = {
  CLE: 'omniphoto-guide-vu',
  _etape: -1,

  dejaVu() {
    try { return localStorage.getItem(this.CLE) === 'oui'; } catch (e) { return true; }
  },

  /* À l'ouverture de l'éditeur : la première fois seulement. */
  peutEtreMontrer() {
    if (!this.dejaVu() && this._etape < 0) setTimeout(() => this.montrer(0), 400);
  },

  montrer(i) {
    this._effacerCible();
    if (i >= ETAPES_GUIDE.length || vueActive !== 'editeur') { this.terminer(); return; }
    this._etape = i;
    const etape = ETAPES_GUIDE[i];
    const cible = $(etape.cible);
    const bulle = $('#guide');
    $('#guide-texte').textContent = etape.texte;
    $('#guide-numero').textContent = `${i + 1} / ${ETAPES_GUIDE.length}`;
    $('[data-action="guide-suivant"]').lastChild.textContent = i === ETAPES_GUIDE.length - 1 ? 'C\'est parti' : 'Suivant';
    montrerParDessus(bulle);
    if (cible) {
      cible.classList.add('guide-cible');
      // La bulle se place sous la cible, ou au-dessus s'il n'y a pas la place
      const r = cible.getBoundingClientRect();
      const hb = bulle.offsetHeight;
      let haut = r.bottom + 10;
      if (haut + hb > innerHeight - 8) haut = Math.max(8, r.top - hb - 10);
      if (etape.cible === '.zone-toile') haut = r.top + 16;
      bulle.style.top = haut + 'px';
    }
  },

  terminerSiOuvert() {
    if (this._etape >= 0) { this._effacerCible(); this._etape = -1; cacherParDessus($('#guide')); }
  },

  suivant() {
    this.montrer(this._etape + 1);
  },

  terminer() {
    this._effacerCible();
    this._etape = -1;
    cacherParDessus($('#guide'));
    try { localStorage.setItem(this.CLE, 'oui'); } catch (e) { /* pas grave */ }
  },

  /* « Revoir le guide » : il sera remontré à la prochaine ouverture de l'éditeur. */
  revoir() {
    try { localStorage.removeItem(this.CLE); } catch (e) { /* pas grave */ }
    Message.montrer('D\'accord : le guide s\'affichera à la prochaine ouverture d\'un montage.');
  },

  _effacerCible() {
    for (const el of $$('.guide-cible')) el.classList.remove('guide-cible');
  }
};
