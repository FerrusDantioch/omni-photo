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
const ENTETE_TOUT = 'OMNIPHOTO-TOUT-1\n';     // tous les montages (version 1.2)
const MAX_JSON_IMPORT = 16 * 1024 * 1024;
const MAX_COTE_DOC = 16384;
const TYPES_IMAGES_IMPORT = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp']);
const TYPES_CALQUES_IMPORT = new Set(['image', 'texte', 'forme', 'fond']);

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
      // (l'image de « Ma signature » n'appartient à aucun montage : on la garde)
      if (!gardees.has(rid) && !String(rid).startsWith('signature')) {
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

  /* Transforme une image dessinée en fichier WebP (ou PNG en repli) pour la ranger. */
  async _versFichier(image) {
    const { toile, ctx } = nouvelleToile(image.width, image.height);
    try {
      ctx.drawImage(image, 0, 0);
      const coder = (type, qualite) => new Promise((ok) => {
        try { toile.toBlob((b) => ok(b && b.size ? b : null), type, qualite); }
        catch (e) { ok(null); }
      });
      let blob = await coder('image/webp', 0.92);
      if (!blob || blob.type !== 'image/webp') {
        blob = await coder('image/png');
      }
      if (!blob) throw new Error('memoire');
      return blob;
    } finally {
      toile.width = toile.height = 0;
    }
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
      Montage.selection = null;
      Ressources.vider();
      Historique.vider();
      if (typeof Accueil !== 'undefined' && typeof Accueil._libererRessourcesOutils === 'function') {
        Accueil._libererRessourcesOutils();
      }
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
    const { fichiers, morceaux } = await this._imagesPourFichier(m.ressources || []);
    return this._fabriquerFichier(ENTETE_FICHIER, {
      format: 1, application: 'Omni-Photo', version: VERSION, date: new Date().toISOString(),
      nom: m.nom, doc: JSON.parse(m.doc), fichiers
    }, morceaux);
  },

  /* Version 1.2 : TOUS les montages dans un seul fichier (pour changer de
     téléphone sans rien perdre). Une image partagée n'y est mise qu'une fois. */
  async versFichierTout() {
    if (Montage.doc) await this.maintenant();
    const tous = (await Base.tout('montages')).sort((a, b) => a.date - b.date);
    if (!tous.length) throw new Error('aucun');
    const ids = new Set();
    for (const m of tous) for (const rid of m.ressources || []) ids.add(rid);
    const { fichiers, morceaux } = await this._imagesPourFichier([...ids]);
    return this._fabriquerFichier(ENTETE_TOUT, {
      format: 1, application: 'Omni-Photo', version: VERSION, date: new Date().toISOString(),
      montages: tous.map((m) => ({ nom: m.nom, date: m.date, doc: JSON.parse(m.doc) })), fichiers
    }, morceaux);
  },

  async _imagesPourFichier(ids) {
    const morceaux = [], fichiers = [];
    for (const rid of ids) {
      const im = await Base.lire('images', rid);
      if (!im || !im.blob) continue;
      fichiers.push({ id: rid, taille: im.blob.size, type: im.blob.type, maxCote: im.maxCote === Infinity ? null : im.maxCote });
      morceaux.push(im.blob);
    }
    return { fichiers, morceaux };
  },

  _fabriquerFichier(entete, description, morceaux) {
    const texte = new TextEncoder().encode(JSON.stringify(description));
    const longueur = new Uint8Array(4);
    new DataView(longueur.buffer).setUint32(0, texte.length, true);
    return new Blob([entete, longueur, texte, ...morceaux], { type: 'application/octet-stream' });
  },

  /* Lit un fichier « .omniphoto » (un montage, ou tous les montages) et
     ajoute ce qu'il contient à « Mes montages ». Renvoie la liste des
     nouveaux numéros. */
  async depuisFichier(fichier) {
    const pasBon = new Error('Ce fichier n\'est pas une sauvegarde Omni-Photo (fichier « .omniphoto »).');
    const incomplet = new Error('Ce fichier .omniphoto est incomplet (téléchargement interrompu ?).');
    if (!fichier || typeof fichier.size !== 'number' || fichier.size < 21) throw pasBon;
    const debut = new TextDecoder().decode(await fichier.slice(0, 24).arrayBuffer());
    const entete = [ENTETE_FICHIER, ENTETE_TOUT].find((e) => debut.startsWith(e));
    if (!entete || entete.length + 4 > fichier.size) throw pasBon;
    const lg = new DataView(await fichier.slice(entete.length, entete.length + 4).arrayBuffer()).getUint32(0, true);
    if (!Number.isSafeInteger(lg) || lg <= 0 || lg > MAX_JSON_IMPORT) throw pasBon;
    const debutJson = entete.length + 4;
    if (debutJson + lg > fichier.size) throw incomplet;
    let description;
    try {
      description = JSON.parse(new TextDecoder().decode(await fichier.slice(debutJson, debutJson + lg).arrayBuffer()));
    } catch (e) { throw pasBon; }
    if (!description || typeof description !== 'object') throw pasBon;
    const montages = entete === ENTETE_TOUT ? description.montages
      : description.doc && [{ nom: description.nom, doc: description.doc }];
    if (!Array.isArray(montages) || montages.length === 0 || !Array.isArray(description.fichiers)) throw pasBon;

    // 1. Validation complète des fichiers et schémas AVANT toute écriture en base
    const nouveaux = new Map();
    const imagesAPoser = [];
    let position = debutJson + lg;
    for (const f of description.fichiers) {
      if (!f || typeof f !== 'object' || typeof f.id !== 'string' || !f.id || nouveaux.has(f.id)) throw pasBon;
      if (!Number.isSafeInteger(f.taille) || f.taille <= 0 || f.taille > LIMITES.octetsMax) throw pasBon;
      if (position + f.taille > fichier.size) throw incomplet;
      let type = 'image/png';
      if (f.type != null && f.type !== '') {
        if (typeof f.type !== 'string') throw pasBon;
        const brut = f.type.toLowerCase().split(';')[0].trim();
        const norm = brut === 'image/jpg' ? 'image/jpeg' : brut;
        if (!TYPES_IMAGES_IMPORT.has(norm)) throw pasBon;
        type = norm;
      }
      const maxCote = f.maxCote == null ? Infinity
        : (Number.isFinite(f.maxCote) && f.maxCote > 0 ? Math.min(f.maxCote, LIMITES.photo) : Infinity);
      const rid = nouvelId('r');
      nouveaux.set(f.id, rid);
      imagesAPoser.push({ rid, start: position, end: position + f.taille, type, maxCote });
      position += f.taille;
    }

    const montagesAPoser = [];
    for (const m of montages) {
      if (!m || typeof m !== 'object' || !m.doc || typeof m.doc !== 'object') throw pasBon;
      if (m.nom != null && typeof m.nom !== 'string') throw pasBon;
      const doc = m.doc;
      if (!Number.isSafeInteger(doc.largeur) || !Number.isSafeInteger(doc.hauteur) ||
          doc.largeur < 1 || doc.hauteur < 1 || doc.largeur > MAX_COTE_DOC || doc.hauteur > MAX_COTE_DOC ||
          doc.largeur * doc.hauteur > LIMITES.pixelsMax) throw pasBon;
      if (!Array.isArray(doc.calques)) throw pasBon;
      for (const c of doc.calques) {
        if (!c || typeof c !== 'object' || !TYPES_CALQUES_IMPORT.has(c.type)) throw pasBon;
        if (typeof c.id !== 'string' || !c.id) c.id = nouvelId('c');
        if (c.type !== 'fond') {
          if (!Number.isFinite(c.x) || !Number.isFinite(c.y) ||
              !Number.isFinite(c.echelle) || c.echelle <= 0 ||
              !Number.isFinite(c.rotation) || !Number.isFinite(c.opacite)) throw pasBon;
        }
        if (c.type === 'image') {
          if (typeof c.ressource !== 'string' || !c.ressource ||
              !Number.isFinite(c.largeur) || c.largeur <= 0 ||
              !Number.isFinite(c.hauteur) || c.hauteur <= 0) throw pasBon;
        } else if (c.type === 'texte') {
          if (typeof c.texte !== 'string' || !Number.isFinite(c.taille) || c.taille <= 0 ||
              !c.contour || typeof c.contour !== 'object' || !c.ombre || typeof c.ombre !== 'object') throw pasBon;
        } else if (c.type === 'forme') {
          if (!Number.isFinite(c.largeur) || c.largeur <= 0 ||
              !Number.isFinite(c.hauteur) || c.hauteur <= 0 ||
              !c.remplissage || typeof c.remplissage !== 'object' || !c.trait || typeof c.trait !== 'object') throw pasBon;
        }
        // Correspondance stricte : aucun repli vers l'ancien numéro (ni clé existante)
        if (c.ressource != null) {
          if (typeof c.ressource !== 'string' || !nouveaux.has(c.ressource)) throw pasBon;
          c.ressource = nouveaux.get(c.ressource);
        }
        if (c.source != null) {
          if (typeof c.source !== 'string' || !nouveaux.has(c.source)) throw pasBon;
          c.source = nouveaux.get(c.source);
        }
      }
      montagesAPoser.push({ nom: m.nom, doc });
    }

    // 2. Écritures suivies avec annulation complète en cas d'échec
    const imagesEcrites = [];
    const montagesEcrits = [];
    try {
      for (const im of imagesAPoser) {
        const blob = fichier.slice(im.start, im.end, im.type);
        if (blob.size !== im.end - im.start) throw incomplet;
        // Copie en mémoire : le fichier choisi peut disparaître ensuite
        await Base.ecrire('images', im.rid, {
          blob: new Blob([await blob.arrayBuffer()], { type: im.type }),
          maxCote: im.maxCote
        });
        imagesEcrites.push(im.rid);
        this._rangees.add(im.rid);
      }
      for (let i = 0; i < montagesAPoser.length; i++) {
        const m = montagesAPoser[i];
        const id = nouvelId('m');
        const nom = (typeof m.nom === 'string' ? m.nom.replace(/\s+/g, ' ').trim().slice(0, 80) : '') || 'Montage importé';
        await Base.ecrire('montages', id, {
          id, nom, date: Date.now() - (montagesAPoser.length - i), doc: JSON.stringify(m.doc),
          ressources: [...idsDuDoc(m.doc)], miniature: null
        });
        montagesEcrits.push(id);
      }
      return montagesEcrits;
    } catch (e) {
      for (const id of montagesEcrits) {
        try { await Base.effacer('montages', id); } catch (_) { /* rien */ }
      }
      for (const rid of imagesEcrites) {
        this._rangees.delete(rid);
        try { await Base.effacer('images', rid); } catch (_) { /* rien */ }
      }
      throw e;
    }
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
