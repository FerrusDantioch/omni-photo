/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   Le montage en cours, et « Annuler / Rétablir ».

   Le montage (« doc ») est une simple description :
     {
       largeur, hauteur,        // taille de l'image finale, en pixels
       calques: [ … ]           // du plus bas (le fond) au plus haut
     }

   Chaque calque :
     id, type ('image' ou 'texte'), nom,
     x, y          : position du CENTRE, en pixels du montage
     echelle       : 1 = taille d'origine
     rotation      : en degrés
     miroirH, miroirV : retourné de gauche à droite / de haut en bas
     opacite       : de 0 (invisible) à 1 (opaque)
     visible, verrouille
   + pour une image : ressource (numéro de l'image), largeur, hauteur,
                      source (l'image d'origine, après un détourage)
   + pour un fond   : voir fond.js
   + pour un texte  : texte, police, taille, couleur, gras, alignement,
                      contour { actif, couleur, epaisseur },
                      ombre { actif, couleur, flou, distance }
   ============================================================ */
'use strict';

const Montage = {
  doc: null,
  selection: null,      // numéro du calque choisi (ou null)
  _ecouteurs: [],

  /* Commence un nouveau montage vide de la taille donnée. */
  nouveau(largeur, hauteur) {
    this.doc = { largeur, hauteur, calques: [] };
    this.selection = null;
    Historique.vider();
    this.signaler();
  },

  calque(id) {
    return this.doc ? this.doc.calques.find((c) => c.id === id) || null : null;
  },

  calqueChoisi() {
    return this.selection ? this.calque(this.selection) : null;
  },

  indexDe(id) {
    return this.doc.calques.findIndex((c) => c.id === id);
  },

  choisir(id) {
    this.selection = id && this.calque(id) ? id : null;
    this.signaler();
  },

  /* Les réglages communs à tous les calques. */
  _base(type, nom) {
    return {
      id: nouvelId('c'), type, nom,
      x: this.doc.largeur / 2, y: this.doc.hauteur / 2,
      echelle: 1, rotation: 0, miroirH: false, miroirV: false,
      opacite: 1, visible: true, verrouille: false
    };
  },

  /* Ajoute une image en calque. « remplir » : elle prend toute la place
     (la photo de départ). Sinon, elle est posée au centre, assez petite
     pour qu'on la voie entière. */
  ajouterImage(ressource, largeur, hauteur, { nom, remplir = false, verrouille = false } = {}) {
    const c = this._base('image', nom || this._nomLibre('Image'));
    c.ressource = ressource;
    c.largeur = largeur;
    c.hauteur = hauteur;
    c.verrouille = verrouille;
    if (remplir) {
      c.echelle = Math.min(this.doc.largeur / largeur, this.doc.hauteur / hauteur);
    } else {
      c.echelle = Math.min(1, (this.doc.largeur * 0.6) / largeur, (this.doc.hauteur * 0.6) / hauteur);
    }
    this.doc.calques.push(c);
    this.selection = verrouille ? null : c.id;
    this.signaler();
    return c;
  },

  /* Ajoute un texte au centre. Taille de départ : 8 % du côté le plus
     court de l'image (lisible sur toutes les photos). */
  ajouterTexte(texte) {
    const c = this._base('texte', 'Texte');
    Object.assign(c, {
      texte: texte || 'Ton texte',
      police: 'roboto-slab',
      taille: Math.max(12, Math.round(Math.min(this.doc.largeur, this.doc.hauteur) * 0.08)),
      couleur: '#ffffff',
      gras: true,
      alignement: 'centre',
      contour: { actif: false, couleur: '#1b1726', epaisseur: 0.08 },   // épaisseur en fraction de la taille
      ombre: { actif: true, couleur: '#000000', flou: 0.12, distance: 0.05 }
    });
    this.doc.calques.push(c);
    this.selection = c.id;
    this.signaler();
    return c;
  },

  /* Un nom qui n'existe pas encore : « Image 2 », « Image 3 »… */
  _nomLibre(debut) {
    const noms = new Set(this.doc.calques.map((c) => c.nom));
    if (!noms.has(debut)) return debut;
    for (let i = 2; ; i++) if (!noms.has(debut + ' ' + i)) return debut + ' ' + i;
  },

  supprimer(id) {
    const i = this.indexDe(id);
    if (i < 0) return;
    this.doc.calques.splice(i, 1);
    if (this.selection === id) this.selection = null;
    this.signaler();
  },

  dupliquer(id) {
    const c = this.calque(id);
    if (!c) return null;
    const copie = JSON.parse(JSON.stringify(c));
    copie.id = nouvelId('c');
    copie.nom = c.type === 'texte' ? c.nom : this._nomLibre(c.nom.replace(/ \d+$/, ''));
    copie.verrouille = false;
    // Un peu décalée, pour qu'on voie qu'il y en a deux
    const decalage = Math.min(this.doc.largeur, this.doc.hauteur) * 0.04;
    copie.x = limiter(c.x + decalage, 0, this.doc.largeur);
    copie.y = limiter(c.y + decalage, 0, this.doc.hauteur);
    this.doc.calques.splice(this.indexDe(id) + 1, 0, copie);
    this.selection = copie.id;
    this.signaler();
    return copie;
  },

  /* Change l'ordre : +1 = un cran vers le dessus, -1 = un cran vers le
     dessous. Renvoie faux si c'est impossible (déjà tout en haut…). */
  deplacerOrdre(id, sens) {
    const i = this.indexDe(id);
    const j = i + sens;
    if (i < 0 || j < 0 || j >= this.doc.calques.length) return false;
    const liste = this.doc.calques;
    [liste[i], liste[j]] = [liste[j], liste[i]];
    this.signaler();
    return true;
  },

  /* Modifie des réglages d'un calque, par exemple
     Montage.modifier(id, { opacite: 0.5 }). */
  modifier(id, changements) {
    const c = this.calque(id);
    if (!c) return;
    Object.assign(c, changements);
    if ('x' in changements || 'y' in changements) {
      // Le centre du calque reste dans l'image : on ne peut pas le perdre.
      c.x = limiter(c.x, 0, this.doc.largeur);
      c.y = limiter(c.y, 0, this.doc.hauteur);
    }
    if ('echelle' in changements) c.echelle = limiter(c.echelle, 0.01, 40);
    if ('rotation' in changements) c.rotation = normaliserAngle(c.rotation);
    this.signaler();
  },

  /* Tous les numéros d'images utilisés par le montage. */
  ressourcesUtilisees() {
    const ids = new Set();
    if (this.doc) {
      for (const c of this.doc.calques) {
        if (c.ressource) ids.add(c.ressource);
        if (c.source) ids.add(c.source);   // l'image d'origine d'un sujet détouré
      }
    }
    return ids;
  },

  /* Copie du montage sous forme de texte (pour Annuler et la sauvegarde). */
  copie() {
    return JSON.stringify(this.doc);
  },

  restaurer(texte) {
    this.doc = JSON.parse(texte);
    if (this.selection && !this.calque(this.selection)) this.selection = null;
    this.signaler();
  },

  /* Prévient les autres parties de l'application qu'il y a du nouveau
     (redessiner la toile, mettre à jour les panneaux, sauvegarder). */
  ecouter(fn) {
    this._ecouteurs.push(fn);
  },
  signaler() {
    for (const fn of this._ecouteurs) fn();
  }
};

/* Ramène un angle entre -180° et 180°. */
function normaliserAngle(a) {
  a = ((a % 360) + 360) % 360;
  return a > 180 ? a - 360 : a;
}


/* ============================================================
   Annuler / Rétablir

   Avant chaque modification, on garde une copie du montage (un simple
   texte, quelques kilo-octets : les images elles-mêmes ne sont pas
   recopiées, seulement leur numéro). 30 étapes au plus.

   Une modification qui dure (glisser un calque au doigt, bouger un
   curseur, écrire un texte) ne compte que pour UNE étape :
   Historique.debut() au début, Historique.fin() à la fin.
   ============================================================ */
const Historique = {
  MAX: 30,
  passe: [],      // états d'avant (le dernier = le plus récent)
  futur: [],      // états annulés, qu'on peut rétablir
  _avant: null,   // copie prise par debut(), en attente de fin()

  vider() {
    this.passe = [];
    this.futur = [];
    this._avant = null;
    this.majBoutons();
  },

  debut() {
    if (this._avant === null && Montage.doc) this._avant = Montage.copie();
  },

  fin() {
    if (this._avant === null) return;
    const maintenant = Montage.copie();
    if (maintenant !== this._avant) {
      this.passe.push(this._avant);
      if (this.passe.length > this.MAX) this.passe.shift();
      this.futur = [];
      Sauvegarde.programmer();
    }
    this._avant = null;
    this.nettoyer();
    this.majBoutons();
  },

  /* Une modification immédiate (un bouton) : une étape. */
  action(fn) {
    this.debut();
    const resultat = fn();
    this.fin();
    return resultat;
  },

  peutAnnuler() { return this.passe.length > 0; },
  peutRetablir() { return this.futur.length > 0; },

  annuler() {
    this.fin();   // termine une modification en cours, s'il y en a une
    if (!this.passe.length) return false;
    this.futur.push(Montage.copie());
    Montage.restaurer(this.passe.pop());
    this.majBoutons();
    Sauvegarde.programmer();
    return true;
  },

  retablir() {
    this.fin();
    if (!this.futur.length) return false;
    this.passe.push(Montage.copie());
    Montage.restaurer(this.futur.pop());
    this.majBoutons();
    Sauvegarde.programmer();
    return true;
  },

  /* Les images que plus aucun état (actuel, passé ou futur) n'utilise
     sont libérées de la mémoire. */
  nettoyer() {
    const ids = Montage.ressourcesUtilisees();
    const motif = /"(?:ressource|source)":"([^"]+)"/g;
    for (const etat of [...this.passe, ...this.futur, this._avant || '']) {
      for (const m of etat.matchAll(motif)) ids.add(m[1]);
    }
    Ressources.nettoyer(ids);
  },

  majBoutons() {
    const a = $('[data-action="annuler"]'), r = $('[data-action="retablir"]');
    // Pendant une retouche, « Annuler » sert aussi à retirer le dernier œil / point
    const retoucheEnCours = typeof Retouche !== 'undefined' && Retouche.enCours();
    if (a) a.disabled = !this.peutAnnuler() && !retoucheEnCours;
    if (r) r.disabled = !this.peutRetablir();
  }
};
