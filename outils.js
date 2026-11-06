/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   Petits outils utilisés partout dans l'application.
   ============================================================ */
'use strict';

/* Raccourcis pour trouver un élément de la page.
   $('#toile') = le premier élément qui correspond ; $$('.bouton') = tous. */
const $ = (selecteur, racine = document) => racine.querySelector(selecteur);
const $$ = (selecteur, racine = document) => [...racine.querySelectorAll(selecteur)];

/* Garde un nombre entre un minimum et un maximum. */
function limiter(valeur, min, max) {
  return Math.min(max, Math.max(min, valeur));
}

/* Fabrique un numéro unique (pour reconnaître chaque calque, chaque image). */
let _compteurId = 0;
function nouvelId(prefixe) {
  _compteurId++;
  return prefixe + Date.now().toString(36) + '-' + _compteurId.toString(36) + Math.random().toString(36).slice(2, 6);
}

/* Attend une promesse, mais pas plus de « ms » millisecondes.
   Au-delà, on abandonne avec une erreur « delai ». */
function avecDelai(promesse, ms) {
  let minuteur;
  const delai = new Promise((_, rater) => {
    minuteur = setTimeout(() => rater(new Error('delai')), ms);
  });
  return Promise.race([promesse, delai]).finally(() => clearTimeout(minuteur));
}

/* Nom du fichier exporté, par exemple « omni-photo-2026-11-06-1015.png ».
   Sans accent ni espace : certains téléphones remplacent sinon le nom
   par « download ». */
function nomDeFichier(extension) {
  const d = new Date();
  const deux = (n) => String(n).padStart(2, '0');
  return `omni-photo-${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}-${deux(d.getHours())}${deux(d.getMinutes())}.${extension}`;
}

/* Écrit un nombre à la française : 1 080 (espace entre les milliers). */
function nombre(n) {
  return Math.round(n).toLocaleString('fr-FR');
}

/* ---------- Le petit message en bas de l'écran ----------
   Pour dire ce qui vient de se passer (« Texte ajouté », « Image
   enregistrée »…) ou expliquer calmement un souci.
   - type 'info' : disparaît tout seul après quelques secondes ;
   - type 'erreur' : reste affiché jusqu'à ce qu'on touche « D'accord ». */
const Message = {
  _minuteur: null,

  montrer(texte, type = 'info') {
    const boite = $('#message');
    $('#message-texte').textContent = texte;
    boite.dataset.type = type;
    montrerParDessus(boite);
    clearTimeout(this._minuteur);
    if (type !== 'erreur') {
      this._minuteur = setTimeout(() => this.cacher(), 5000);
    }
  },

  erreur(texte) {
    this.montrer(texte, 'erreur');
  },

  cacher() {
    clearTimeout(this._minuteur);
    cacherParDessus($('#message'));
  }
};

/* Montre un élément AU-DESSUS de tout, même d'une fenêtre ouverte
   (grâce à « popover », que Chrome connaît). Sans cela, un message
   d'erreur pourrait rester caché derrière la fenêtre d'export. */
function montrerParDessus(el) {
  el.hidden = false;
  if (typeof el.showPopover === 'function') {
    try {
      if (el.matches(':popover-open')) el.hidePopover();
      el.showPopover();
    } catch (e) { /* ancien navigateur : l'élément reste simplement visible */ }
  }
}

function cacherParDessus(el) {
  if (typeof el.hidePopover === 'function') {
    try { if (el.matches(':popover-open')) el.hidePopover(); } catch (e) { /* rien */ }
  }
  el.hidden = true;
}

/* ---------- Bouton « en deux appuis » ----------
   Pour les actions qui font perdre quelque chose (supprimer un calque,
   remplacer le montage en cours). Premier appui : le bouton change de
   texte (« Toucher encore pour supprimer »). Deuxième appui dans les
   4 secondes : l'action a lieu. Sinon, le bouton redevient normal.
   Jamais de fenêtre « Êtes-vous sûr ? » du navigateur. */
function armerBouton(bouton, texteArme, action) {
  if (!bouton.classList.contains('arme')) {
    bouton.classList.add('arme');
    bouton.dataset.texteOriginal = bouton.innerHTML;
    bouton.textContent = texteArme;
    if (bouton.hasAttribute('aria-label')) {
      bouton.dataset.ariaOriginal = bouton.getAttribute('aria-label');
      bouton.setAttribute('aria-label', texteArme);
    }
    clearTimeout(bouton._minuteurArme);
    bouton._minuteurArme = setTimeout(() => desarmerBouton(bouton), 4000);
    return;
  }
  // On remet le bouton dans son état normal AVANT l'action.
  desarmerBouton(bouton);
  action();
}

function desarmerBouton(bouton) {
  clearTimeout(bouton._minuteurArme);
  bouton.classList.remove('arme');
  if (bouton.dataset.texteOriginal) {
    bouton.innerHTML = bouton.dataset.texteOriginal;   // icône comprise
    delete bouton.dataset.texteOriginal;
  }
  if (bouton.dataset.ariaOriginal) {
    bouton.setAttribute('aria-label', bouton.dataset.ariaOriginal);
    delete bouton.dataset.ariaOriginal;
  }
}

/* ---------- Écran « Patiente… » ----------
   Un voile calme avec une phrase, pendant l'ouverture d'une grande photo
   ou la fabrication du fichier final. */
const Patience = {
  /* options.progression : montrer une barre de progression ;
     options.arreter : montrer le bouton « Arrêter » (détourage par IA). */
  montrer(texte, options = {}) {
    $('#patience-texte').textContent = texte;
    $('#patience-progression').hidden = !options.progression;
    $('#patience-arreter').hidden = !options.arreter;
    this.avancer(0);
    montrerParDessus($('#patience'));
  },
  /* fraction : de 0 à 1. */
  avancer(fraction, texte) {
    const pourcent = Math.round(limiter(fraction, 0, 1) * 100);
    $('#patience-barre').style.width = pourcent + '%';
    $('#patience-pourcent').textContent = pourcent + ' %';
    $('#patience-progression').setAttribute('aria-valuenow', String(pourcent));
    if (texte) $('#patience-texte').textContent = texte;
  },
  cacher() {
    cacherParDessus($('#patience'));
  }
};

/* Laisse le navigateur afficher la page avant un long calcul
   (sinon l'écran « Patiente… » n'apparaîtrait jamais). */
function laisserAfficher() {
  return new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 30)));
}
