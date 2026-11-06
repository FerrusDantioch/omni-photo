/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   La sauvegarde automatique du montage en cours.

   À chaque modification (et quand on quitte l'application), le montage
   est rangé dans le téléphone lui-même, dans la petite base de données
   privée du navigateur (« IndexedDB »). Rien n'est envoyé sur internet.
   Si le téléphone ferme Omni-Photo (manque de mémoire, appareil photo
   ouvert…), on retrouve son montage avec « Reprendre mon montage ».

   ⚠️ Toutes les applications de ferrusdantioch.github.io partagent le
   même espace : la base s'appelle « omniphoto » et on ne touche à rien
   d'autre.

   Deux tiroirs :
   - « etat » : le montage (texte JSON), sous la clé « courant » ;
   - « images » : chaque image utilisée (le fichier d'origine), sous son
     numéro.
   « Annuler / Rétablir » n'est pas sauvegardé (il repart de zéro).
   ============================================================ */
'use strict';

const Base = {
  NOM: 'omniphoto',
  _ouverte: null,

  ouvrir() {
    if (!this._ouverte) {
      this._ouverte = new Promise((reussir, rater) => {
        if (!window.indexedDB) return rater(new Error('indisponible'));
        const demande = indexedDB.open(this.NOM, 1);
        demande.onupgradeneeded = () => {
          const db = demande.result;
          if (!db.objectStoreNames.contains('etat')) db.createObjectStore('etat');
          if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
        };
        demande.onsuccess = () => reussir(demande.result);
        demande.onerror = () => rater(demande.error);
        demande.onblocked = () => rater(new Error('bloquee'));
      });
      this._ouverte.catch(() => { this._ouverte = null; });
    }
    return this._ouverte;
  },

  /* Lance une opération dans un tiroir et attend qu'elle soit finie. */
  async _faire(tiroir, mode, fn) {
    const db = await this.ouvrir();
    return new Promise((reussir, rater) => {
      const tx = db.transaction(tiroir, mode);
      const magasin = tx.objectStore(tiroir);
      let resultat;
      const demande = fn(magasin);
      if (demande) demande.onsuccess = () => { resultat = demande.result; };
      tx.oncomplete = () => reussir(resultat);
      tx.onerror = () => rater(tx.error);
      tx.onabort = () => rater(tx.error || new Error('annulee'));
    });
  },

  lire(tiroir, cle) { return this._faire(tiroir, 'readonly', (m) => m.get(cle)); },
  ecrire(tiroir, cle, valeur) { return this._faire(tiroir, 'readwrite', (m) => m.put(valeur, cle)); },
  effacer(tiroir, cle) { return this._faire(tiroir, 'readwrite', (m) => m.delete(cle)); },
  cles(tiroir) { return this._faire(tiroir, 'readonly', (m) => m.getAllKeys()); },
  vider(tiroir) { return this._faire(tiroir, 'readwrite', (m) => m.clear()); }
};

const Sauvegarde = {
  _minuteur: null,
  _enCours: null,
  _rangees: new Set(),     // images déjà rangées dans la base
  _avertie: false,
  actif: true,

  /* Sauvegarde un peu plus tard (on attend la fin d'une série de
     modifications rapprochées). */
  programmer() {
    if (!this.actif) return;
    clearTimeout(this._minuteur);
    this._minuteur = setTimeout(() => this.maintenant(), 800);
  },

  /* Sauvegarde tout de suite (par exemple quand on quitte l'application). */
  async maintenant() {
    clearTimeout(this._minuteur);
    if (!this.actif || !Montage.doc) return;
    // Une seule sauvegarde à la fois
    if (this._enCours) { await this._enCours; }
    this._enCours = this._sauvegarder().finally(() => { this._enCours = null; });
    return this._enCours;
  },

  async _sauvegarder() {
    try {
      const utilisees = Montage.ressourcesUtilisees();
      // 1. Les nouvelles images
      for (const id of utilisees) {
        if (this._rangees.has(id)) continue;
        const r = Ressources.obtenir(id);
        if (!r) continue;
        if (!r.blob) r.blob = await this._versFichier(r.image);
        await Base.ecrire('images', id, { blob: r.blob, maxCote: r.maxCote });
        this._rangees.add(id);
      }
      // 2. Le montage lui-même
      await Base.ecrire('etat', 'courant', { doc: Montage.copie(), date: Date.now() });
      // 3. Les images qui ne servent plus
      for (const id of await Base.cles('images')) {
        if (!utilisees.has(id)) {
          await Base.effacer('images', id);
          this._rangees.delete(id);
        }
      }
      Persistance.demander();
    } catch (e) {
      console.warn('Sauvegarde impossible', e);
      if (!this._avertie) {
        this._avertie = true;
        const place = e && (e.name === 'QuotaExceededError' || /quota/i.test(e.message || ''));
        Message.erreur(place
          ? 'Ton téléphone manque de place : ton montage ne peut plus être sauvegardé automatiquement. Pense à l\'exporter.'
          : 'La sauvegarde automatique ne marche pas sur ce téléphone (navigation privée ?). Pense à exporter ton image.');
      }
    }
  },

  /* Transforme une image dessinée en fichier PNG (pour la ranger). */
  _versFichier(image) {
    const { toile, ctx } = nouvelleToile(image.width, image.height);
    ctx.drawImage(image, 0, 0);
    return new Promise((ok, ko) => toile.toBlob((b) => {
      toile.width = 0;
      b ? ok(b) : ko(new Error('memoire'));
    }, 'image/png'));
  },

  /* Y a-t-il un montage à reprendre ? Renvoie sa date, ou null. */
  async existe() {
    try {
      const etat = await Base.lire('etat', 'courant');
      return etat && etat.doc ? etat.date : null;
    } catch (e) {
      return null;
    }
  },

  /* Rouvre le montage sauvegardé. Renvoie le nombre d'images perdues
     (normalement 0). */
  async reprendre() {
    const etat = await Base.lire('etat', 'courant');
    if (!etat || !etat.doc) throw new Error('absent');
    const doc = JSON.parse(etat.doc);
    Ressources.vider();
    this._rangees.clear();
    let perdues = 0;
    const ids = new Set();
    for (const c of doc.calques) {
      if (c.ressource) ids.add(c.ressource);
      if (c.source) ids.add(c.source);
    }
    for (const id of ids) {
      const enregistre = await Base.lire('images', id);
      try {
        if (!enregistre) throw new Error('absente');
        await Ressources.depuisFichier(enregistre.blob, enregistre.maxCote || LIMITES.photo, id);
        this._rangees.add(id);
      } catch (e) {
        if (e instanceof ErreurPhoto && e.code === 'memoire') throw e;
        perdues++;
      }
    }
    // Les calques dont l'image a disparu sont retirés
    doc.calques = doc.calques.filter((c) => !c.ressource || Ressources.obtenir(c.ressource));
    for (const c of doc.calques) if (c.source && !Ressources.obtenir(c.source)) delete c.source;
    Montage.doc = doc;
    Montage.selection = null;
    Historique.vider();
    Montage.signaler();
    return perdues;
  },

  /* Oublie le montage sauvegardé (avant d'en commencer un nouveau). */
  async effacer() {
    clearTimeout(this._minuteur);
    if (this._enCours) await this._enCours.catch(() => {});
    this._rangees.clear();
    try {
      await Base.effacer('etat', 'courant');
      await Base.vider('images');
    } catch (e) { /* rien à effacer */ }
  }
};

/* Demande au téléphone de ne pas effacer les données d'Omni-Photo
   quand il manque de place (Chrome accepte en général sans rien
   demander à la personne). Une seule fois. */
const Persistance = {
  _demandee: false,
  demander() {
    if (this._demandee) return;
    this._demandee = true;
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (e) { /* pas grave */ }
  }
};
