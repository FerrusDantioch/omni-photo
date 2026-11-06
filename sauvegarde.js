/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   La sauvegarde automatique des montages (« Mes montages »).

   À chaque modification (et quand on quitte l'application), le montage
   ouvert est rangé dans le téléphone lui-même, dans la petite base de
   données privée du navigateur (« IndexedDB »). Rien n'est envoyé sur
   internet. On peut garder plusieurs montages et les rouvrir depuis
   l'accueil.

   ⚠️ Toutes les applications de ferrusdantioch.github.io partagent le
   même espace : la base s'appelle « omniphoto » et on ne touche à rien
   d'autre.

   Deux tiroirs :
   - « montages » : un montage par numéro :
       { id, nom, date, doc (texte JSON), ressources: [numéros], miniature (Blob JPEG) }
   - « images » : chaque image utilisée (le fichier d'origine, ou un PNG
     pour une image retouchée), sous son numéro. Une image qu'aucun
     montage n'utilise plus est effacée.
   « Annuler / Rétablir » n'est pas sauvegardé (il repart de zéro).

   La version 1.0 n'avait qu'un montage (tiroir « etat », clé
   « courant ») : il est repris tout seul dans « Mes montages ».

   Fichier « .omniphoto » (pour passer un montage du téléphone à la
   tablette) : « OMNIPHOTO-MONTAGE-1 » + saut de ligne, puis la longueur
   (4 octets) d'un texte JSON { format, application, version, date, nom,
   doc, fichiers: [{ id, taille, type, maxCote }] }, puis les images
   collées à la suite.
   ============================================================ */
'use strict';

const Base = {
  NOM: 'omniphoto',
  _ouverte: null,

  ouvrir() {
    if (!this._ouverte) {
      this._ouverte = new Promise((reussir, rater) => {
        if (!window.indexedDB) return rater(new Error('indisponible'));
        const demande = indexedDB.open(this.NOM, 2);
        demande.onupgradeneeded = (e) => {
          const db = demande.result;
          const tx = demande.transaction;
          if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
          if (!db.objectStoreNames.contains('montages')) db.createObjectStore('montages');
          // Ancienne version : le montage unique devient le premier de la liste
          if (e.oldVersion >= 1 && db.objectStoreNames.contains('etat')) {
            const lecture = tx.objectStore('etat').get('courant');
            lecture.onsuccess = () => {
              const ancien = lecture.result;
              if (ancien && ancien.doc) {
                const doc = JSON.parse(ancien.doc);
                const id = nouvelId('m');
                tx.objectStore('montages').put({
                  id, nom: 'Mon montage', date: ancien.date || Date.now(), doc: ancien.doc,
                  ressources: [...idsDuDoc(doc)], miniature: null
                }, id);
              }
              db.deleteObjectStore('etat');
            };
          }
        };
        demande.onsuccess = () => {
          const db = demande.result;
          // Une autre page d'Omni-Photo veut changer de version : on lui laisse la place
          db.onversionchange = () => { db.close(); this._ouverte = null; };
          reussir(db);
        };
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
  tout(tiroir) { return this._faire(tiroir, 'readonly', (m) => m.getAll()); }
};

/* Les numéros d'images utilisés par un montage (images et origines). */
function idsDuDoc(doc) {
  const ids = new Set();
  for (const c of (doc && doc.calques) || []) {
    if (c.ressource) ids.add(c.ressource);
    if (c.source) ids.add(c.source);
  }
  return ids;
}

/* Un nom par défaut : « Montage du 6 novembre, 12 h 05 ». */
function nomParDefaut() {
  const d = new Date();
  const jour = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  return `Montage du ${jour}, ${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
}

const ENTETE_FICHIER = 'OMNIPHOTO-MONTAGE-1\n';

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
    if (!this.actif || !Montage.doc || !Montage.id) return;
    // Une seule sauvegarde à la fois
    while (this._enCours) await this._enCours;
    this._enCours = this._sauvegarder().finally(() => { this._enCours = null; });
    return this._enCours;
  },

  async _sauvegarder() {
    try {
      const doc = Montage.copie();
      const id = Montage.id, nom = Montage.nom;
      const utilisees = Montage.ressourcesUtilisees();
      // 1. Les nouvelles images
      for (const rid of utilisees) {
        if (this._rangees.has(rid)) continue;
        const r = Ressources.obtenir(rid);
        if (!r) continue;
        if (!r.blob) r.blob = await this._versFichier(r.image);
        await Base.ecrire('images', rid, { blob: r.blob, maxCote: r.maxCote });
        this._rangees.add(rid);
      }
      // 2. Le montage, avec sa miniature
      let miniature = null;
      try { miniature = await this._miniature(); } catch (e) { /* pas de miniature : pas grave */ }
      await Base.ecrire('montages', id, { id, nom, date: Date.now(), doc, ressources: [...utilisees], miniature });
      // 3. Les images que plus aucun montage n'utilise
      await this._menage();
      Persistance.demander();
    } catch (e) {
      console.warn('Sauvegarde impossible', e);
      if (!this._avertie) {
        this._avertie = true;
        const place = e && (e.name === 'QuotaExceededError' || /quota/i.test(e.message || ''));
        Message.erreur(place
          ? 'Ton téléphone manque de place : ton montage ne peut plus être sauvegardé automatiquement. Pense à l\'exporter, ou supprime d\'anciens montages.'
          : 'La sauvegarde automatique ne marche pas sur ce téléphone (navigation privée ?). Pense à exporter ton image.');
      }
    }
  },

  async _menage() {
    const gardees = new Set();
    for (const m of await Base.tout('montages')) for (const rid of m.ressources || []) gardees.add(rid);
    for (const rid of await Base.cles('images')) {
      if (!gardees.has(rid)) {
        await Base.effacer('images', rid);
        this._rangees.delete(rid);
      }
    }
  },

  /* Une petite image du montage (320 pixels au plus), pour la liste. */
  _miniature() {
    const d = Montage.doc;
    const f = Math.min(1, 320 / Math.max(d.largeur, d.hauteur));
    const { toile, ctx } = nouvelleToile(Math.max(1, Math.round(d.largeur * f)), Math.max(1, Math.round(d.hauteur * f)));
    ctx.fillStyle = '#4a4458';                 // les zones transparentes en gris
    ctx.fillRect(0, 0, toile.width, toile.height);
    ctx.setTransform(f, 0, 0, f, 0, 0);
    Rendu.dessinerMontage(ctx, d, { ecran: true, zoom: f, miniature: true });
    return new Promise((ok) => toile.toBlob((b) => { toile.width = 0; ok(b); }, 'image/jpeg', 0.75));
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

  /* Tous les montages, du plus récent au plus ancien :
     [{ id, nom, date, miniature, nbImages }]. */
  async liste() {
    try {
      const tous = await Base.tout('montages');
      return tous.map((m) => ({ id: m.id, nom: m.nom, date: m.date, miniature: m.miniature, nbImages: (m.ressources || []).length }))
        .sort((a, b) => b.date - a.date);
    } catch (e) {
      return [];
    }
  },

  /* La place prise par les montages (en octets). */
  async place() {
    try {
      let total = 0;
      for (const im of await Base.tout('images')) total += (im.blob && im.blob.size) || 0;
      return total;
    } catch (e) {
      return 0;
    }
  },

  /* Rouvre un montage. Renvoie le nombre d'images perdues (normalement 0). */
  async ouvrir(id) {
    const m = await Base.lire('montages', id);
    if (!m || !m.doc) throw new Error('absent');
    const doc = JSON.parse(m.doc);
    Ressources.vider();
    let perdues = 0;
    for (const rid of idsDuDoc(doc)) {
      const enregistre = await Base.lire('images', rid);
      try {
        if (!enregistre) throw new Error('absente');
        await Ressources.depuisFichier(enregistre.blob, enregistre.maxCote || LIMITES.photo, rid);
        this._rangees.add(rid);
      } catch (e) {
        if (e instanceof ErreurPhoto && e.code === 'memoire') throw e;
        perdues++;
      }
    }
    // Les calques dont l'image a disparu sont retirés
    doc.calques = doc.calques.filter((c) => !c.ressource || Ressources.obtenir(c.ressource));
    for (const c of doc.calques) if (c.source && !Ressources.obtenir(c.source)) delete c.source;
    Montage.charger(m.id, m.nom, doc);
    return perdues;
  },

  async renommer(id, nom) {
    const m = await Base.lire('montages', id);
    if (!m) return;
    m.nom = nom;
    await Base.ecrire('montages', id, m);
    if (Montage.id === id) Montage.nom = nom;
  },

  async supprimer(id) {
    clearTimeout(this._minuteur);
    while (this._enCours) await this._enCours.catch(() => {});
    if (Montage.id === id) {
      Montage.doc = null;
      Montage.id = null;
      Ressources.vider();
      Historique.vider();
    }
    await Base.effacer('montages', id);
    await this._menage();
  },

  /* ---------- Le fichier « .omniphoto » ---------- */

  /* Fabrique le fichier d'un montage (pour l'enregistrer ou le partager). */
  async versFichier(id) {
    if (Montage.id === id) await this.maintenant();
    const m = await Base.lire('montages', id);
    if (!m) throw new Error('absent');
    const morceaux = [], fichiers = [];
    for (const rid of m.ressources || []) {
      const im = await Base.lire('images', rid);
      if (!im || !im.blob) continue;
      fichiers.push({ id: rid, taille: im.blob.size, type: im.blob.type, maxCote: im.maxCote === Infinity ? null : im.maxCote });
      morceaux.push(im.blob);
    }
    const description = JSON.stringify({
      format: 1, application: 'Omni-Photo', version: VERSION, date: new Date().toISOString(),
      nom: m.nom, doc: JSON.parse(m.doc), fichiers
    });
    const texte = new TextEncoder().encode(description);
    const longueur = new Uint8Array(4);
    new DataView(longueur.buffer).setUint32(0, texte.length, true);
    return new Blob([ENTETE_FICHIER, longueur, texte, ...morceaux], { type: 'application/octet-stream' });
  },

  /* Lit un fichier « .omniphoto » et en fait un nouveau montage.
     Renvoie son numéro. */
  async depuisFichier(fichier) {
    const pasBon = new Error('Ce fichier n\'est pas une sauvegarde Omni-Photo (fichier « .omniphoto »).');
    const debut = new TextDecoder().decode(await fichier.slice(0, ENTETE_FICHIER.length).arrayBuffer());
    if (debut !== ENTETE_FICHIER) throw pasBon;
    const lg = new DataView(await fichier.slice(ENTETE_FICHIER.length, ENTETE_FICHIER.length + 4).arrayBuffer()).getUint32(0, true);
    let description;
    try {
      const debutJson = ENTETE_FICHIER.length + 4;
      description = JSON.parse(new TextDecoder().decode(await fichier.slice(debutJson, debutJson + lg).arrayBuffer()));
    } catch (e) { throw pasBon; }
    if (!description || !description.doc || !Array.isArray(description.fichiers)) throw pasBon;
    // De NOUVEAUX numéros pour chaque image : importer deux fois le même
    // fichier ne mélange jamais deux montages.
    const nouveaux = new Map();
    let position = ENTETE_FICHIER.length + 4 + lg;
    for (const f of description.fichiers) {
      const blob = fichier.slice(position, position + f.taille, f.type || 'image/png');
      position += f.taille;
      if (blob.size !== f.taille) throw new Error('Ce fichier .omniphoto est incomplet (téléchargement interrompu ?).');
      const rid = nouvelId('r');
      nouveaux.set(f.id, rid);
      // Copie en mémoire : le fichier choisi peut disparaître ensuite
      await Base.ecrire('images', rid, { blob: new Blob([await blob.arrayBuffer()], { type: blob.type }), maxCote: f.maxCote || Infinity });
      this._rangees.add(rid);
    }
    const doc = description.doc;
    for (const c of doc.calques || []) {
      if (c.ressource) c.ressource = nouveaux.get(c.ressource) || c.ressource;
      if (c.source) c.source = nouveaux.get(c.source) || c.source;
    }
    const id = nouvelId('m');
    await Base.ecrire('montages', id, {
      id, nom: description.nom || 'Montage importé', date: Date.now(), doc: JSON.stringify(doc),
      ressources: [...idsDuDoc(doc)], miniature: null
    });
    return id;
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
