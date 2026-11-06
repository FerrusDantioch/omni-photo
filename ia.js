/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   Le retrait automatique du fond, par une intelligence artificielle
   qui tourne DANS le téléphone (rien n'est envoyé sur internet).

   Deux « modèles » au choix :
   - « Tout sujet » (U²-Netp, 4,6 Mo) : personne, animal ou objet ;
   - « Personne » (MODNet, 25,9 Mo) : plus précis sur les cheveux, mais
     seulement pour les personnes.

   Les fichiers de l'IA ne sont PAS téléchargés à l'installation : ils le
   sont au premier détourage, après accord (ModulesIA, plus bas), puis
   gardés dans le téléphone. Ensuite, tout marche sans internet.

   Les étapes d'un détourage :
   1. la photo est réduite à la taille de travail du modèle (320 × 320,
      ou 512 pixels de côté pour MODNet) : rapide, même sur un téléphone
      moyen ;
   2. le « travailleur » (detourage-travail.js) trouve le sujet, puis
      recale les bords sur la photo à 1 024 pixels au plus ;
   3. ce masque est appliqué à la photo EN TAILLE RÉELLE : la photo
      elle-même n'est jamais réduite, seul le masque est agrandi.
   ============================================================ */
'use strict';

const TAILLE_GUIDE = 1024;     // taille du recalage des bords
const DELAI_MAX_IA = 240000;   // au-delà de 4 minutes, on abandonne

const MODELES_IA = {
  objet: { nom: 'Tout sujet', fichier: 'u2netp.onnx', octets: 4574861 },
  personne: { nom: 'Personne', fichier: 'modnet.onnx', octets: 25888640 }
};
// Le moteur ONNX Runtime Web, commun aux deux modèles
const MOTEUR_IA = [['ort.wasm.bundle.min.mjs', 73054], ['ort-wasm-simd-threaded.wasm', 14239897]];

class ErreurIA extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const MESSAGES_IA = {
  impossible: 'Ce navigateur ne sait pas faire tourner l\'intelligence artificielle. Mets Google Chrome à jour ' +
              'depuis le Play Store, puis réessaie. Tu peux aussi détourer à la main avec « Découper ».',
  fichiers: 'Les fichiers de l\'intelligence artificielle ne sont pas encore dans ton téléphone. Connecte-toi à ' +
            'internet (de préférence en Wi-Fi), puis réessaie : ils seront téléchargés une seule fois.',
  horsLigne: 'Tu n\'es pas connecté à internet. Le premier détourage a besoin de télécharger l\'intelligence ' +
             'artificielle, une seule fois. Connecte-toi (de préférence en Wi-Fi), puis réessaie.',
  telechargement: 'Le téléchargement de l\'intelligence artificielle s\'est interrompu. Vérifie ta connexion, ' +
                  'puis réessaie : il reprendra là où il s\'était arrêté.',
  place: 'Ton téléphone manque de place pour ranger l\'intelligence artificielle. Libère un peu d\'espace, puis réessaie.',
  memoire: 'Ton téléphone manque de mémoire pour le détourage automatique. Ferme quelques applications puis réessaie. ' +
           'Ta photo n\'a pas été modifiée.',
  delai: 'Le détourage prend trop de temps sur ce téléphone et a été arrêté. Ta photo n\'a pas été modifiée. ' +
         'Tu peux réessayer, ou détourer à la main avec « Découper ».',
  arret: 'Détourage arrêté. Ta photo n\'a pas été modifiée.',
  echec: 'Le détourage automatique n\'a pas marché. Ta photo n\'a pas été modifiée. Réessaie, ou détoure à la main ' +
         'avec « Découper ».'
};


/* ============================================================
   Les fichiers de l'IA : téléchargés à la demande, rangés dans une
   réserve à part (« omni-photo-ia-v1 ») que les mises à jour de
   l'application ne vident pas (voir sw.js).
   ============================================================ */
const ModulesIA = {
  CACHE: 'omni-photo-ia-v1',

  /* Les fichiers nécessaires à un modèle : [nom, octets]. */
  fichiers(modele) {
    const m = MODELES_IA[modele] || MODELES_IA.objet;
    return [...MOTEUR_IA, [m.fichier, m.octets]];
  },

  _url(nom) {
    return new URL('./' + nom, location.href).href;
  },

  /* Les fichiers qui manquent encore (liste vide = prêt). */
  async manquants(modele) {
    if (!('caches' in window)) return [];   // pas de réserve : on lira directement sur internet
    try {
      const c = await caches.open(this.CACHE);
      const liste = [];
      for (const [nom, octets] of this.fichiers(modele)) {
        if (!(await c.match(this._url(nom)))) liste.push([nom, octets]);
      }
      return liste;
    } catch (e) {
      return [];
    }
  },

  /* Combien de Mo sont rangés pour chaque modèle (page « À propos »). */
  async etat() {
    const resultat = {};
    for (const modele of Object.keys(MODELES_IA)) resultat[modele] = (await this.manquants(modele)).length === 0;
    return resultat;
  },

  _abandon: null,

  /* Télécharge ce qui manque, avec la barre de progression. */
  async telecharger(modele, avancer) {
    const liste = await this.manquants(modele);
    if (!liste.length) return;
    if (navigator.onLine === false) throw new ErreurIA('horsLigne', MESSAGES_IA.horsLigne);
    const total = liste.reduce((s, [, o]) => s + o, 0);
    const c = await caches.open(this.CACHE);
    let fait = 0;
    this._abandon = new AbortController();
    try {
      for (const [nom, octets] of liste) {
        let reponse;
        try {
          reponse = await fetch(this._url(nom), { cache: 'no-store', signal: this._abandon.signal });
        } catch (e) {
          throw e.name === 'AbortError' ? new ErreurIA('arret', MESSAGES_IA.arret) : new ErreurIA('telechargement', MESSAGES_IA.telechargement);
        }
        if (!reponse.ok) throw new ErreurIA('telechargement', MESSAGES_IA.telechargement);
        const lecteur = reponse.body.getReader();
        const morceaux = [];
        let recu = 0;
        for (;;) {
          let lu;
          try { lu = await lecteur.read(); } catch (e) {
            throw e.name === 'AbortError' ? new ErreurIA('arret', MESSAGES_IA.arret) : new ErreurIA('telechargement', MESSAGES_IA.telechargement);
          }
          if (lu.done) break;
          morceaux.push(lu.value);
          recu += lu.value.length;
          avancer((fait + Math.min(recu, octets)) / total,
            `Téléchargement de l'intelligence artificielle : ${nombre((fait + recu) / 1048576)} / ${nombre(total / 1048576)} Mo`);
        }
        const type = nom.endsWith('.wasm') ? 'application/wasm' : (nom.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream');
        try {
          await c.put(this._url(nom), new Response(new Blob(morceaux, { type }), { headers: { 'Content-Type': type } }));
        } catch (e) {
          throw new ErreurIA('place', MESSAGES_IA.place);
        }
        fait += octets;
      }
      Persistance.demander();
    } finally {
      this._abandon = null;
    }
  },

  arreter() {
    if (this._abandon) this._abandon.abort();
  },

  /* Libère la place (page « À propos »). */
  async supprimer() {
    try { await caches.delete(this.CACHE); } catch (e) { /* rien */ }
    Detourage._jeter();
  },

  /* Demande l'accord avant un téléchargement. Renvoie vrai si c'est prêt. */
  async assurer(modele) {
    const liste = await this.manquants(modele);
    if (!liste.length) return true;
    if (navigator.onLine === false) throw new ErreurIA('horsLigne', MESSAGES_IA.horsLigne);
    const mo = liste.reduce((s, [, o]) => s + o, 0) / 1048576;
    const accord = await new Promise((reussir) => {
      const f = $('#fenetre-ia');
      $('#ia-taille').textContent = nombre(mo) + ' Mo';
      $('#ia-modele').textContent = (MODELES_IA[modele] || MODELES_IA.objet).nom;
      const fermer = () => { f.removeEventListener('close', fermer); reussir(f.returnValue === 'oui'); };
      f.returnValue = '';
      f.addEventListener('close', fermer);
      f.showModal();
    });
    if (!accord) return false;
    Patience.montrer('Téléchargement de l\'intelligence artificielle…', { progression: true, arreter: true });
    await laisserAfficher();
    await this.telecharger(modele, (fraction, texte) => Patience.avancer(fraction, texte));
    return true;
  }
};


/* ============================================================
   Le calcul du masque (le sujet) par le travailleur.
   ============================================================ */
const Detourage = {
  _travailleur: null,
  _enCours: null,       // { reussir, rater, minuteur }

  /* Durée du dernier calcul (en millisecondes), par modèle, pour faire
     avancer la barre au bon rythme. */
  dureeEstimee(modele) {
    try { return Number(localStorage.getItem('omniphoto-duree-ia-' + modele)) || (modele === 'personne' ? 9000 : 6000); } catch (e) { return 6000; }
  },
  _noterDuree(modele, ms) {
    try { localStorage.setItem('omniphoto-duree-ia-' + modele, String(Math.round(ms))); } catch (e) { /* pas grave */ }
  },

  /* Le dernier modèle choisi (retenu d'une fois sur l'autre). */
  modelePrefere() {
    try { return localStorage.getItem('omniphoto-modele-ia') === 'personne' ? 'personne' : 'objet'; } catch (e) { return 'objet'; }
  },
  retenirModele(modele) {
    try { localStorage.setItem('omniphoto-modele-ia', modele); } catch (e) { /* pas grave */ }
  },

  possible() {
    return typeof WebAssembly === 'object' && typeof Worker === 'function';
  },

  _travail() {
    if (!this._travailleur) {
      const t = new Worker('./detourage-travail.js', { type: 'module' });
      // Le travailleur a planté (le plus souvent : plus de mémoire)
      t.onerror = (e) => { e.preventDefault(); this._echec(new ErreurIA('memoire', MESSAGES_IA.memoire)); };
      t.onmessageerror = () => this._echec(new ErreurIA('echec', MESSAGES_IA.echec));
      t.onmessage = (e) => this._recevoir(e.data);
      this._travailleur = t;
    }
    return this._travailleur;
  },

  /* On arrête le travailleur (il sera recréé la prochaine fois). */
  _jeter() {
    if (this._travailleur) this._travailleur.terminate();
    this._travailleur = null;
  },

  _echec(erreur) {
    const e = this._enCours;
    this._enCours = null;
    this._jeter();
    if (e) { clearTimeout(e.minuteur); e.rater(erreur); }
  },

  _recevoir(m) {
    const e = this._enCours;
    if (!e) return;
    if (m.type === 'progression') e.progression(m);
    else if (m.type === 'masque') { this._enCours = null; clearTimeout(e.minuteur); e.reussir(m); }
    else if (m.type === 'erreur') {
      const texte = m.message || '';
      console.warn('Détourage :', texte);   // le détail technique, pour comprendre un souci
      let code = 'echec';
      if (/memory|alloc|OOM|Aborted|RangeError/i.test(texte)) code = 'memoire';
      else if (/modele-absent|fetch|Failed to load|404|no available backend/i.test(texte)) code = 'fichiers';
      this._echec(new ErreurIA(code, MESSAGES_IA[code]));
    }
  },

  /* Bouton « Arrêter ». La demande est notée : si le calcul n'a pas encore
     commencé, il s'arrêtera avant de démarrer. Arrête aussi un
     téléchargement en cours. */
  arreter() {
    this._arretDemande = true;
    ModulesIA.arreter();
    if (this._enCours) this._echec(new ErreurIA('arret', MESSAGES_IA.arret));
  },

  _verifierArret() {
    if (this._arretDemande) throw new ErreurIA('arret', MESSAGES_IA.arret);
  },

  /* L'image d'entrée du modèle, « normalisée » comme pendant son
     apprentissage. Renvoie { entree, largeur, hauteur }. */
  _entree(r, modele) {
    let l, h;
    if (modele === 'personne') {
      // MODNet : le petit côté à 512 pixels, côtés multiples de 32
      const f = 512 / Math.min(r.largeur, r.hauteur);
      l = Math.max(32, Math.round((r.largeur * f) / 32) * 32);
      h = Math.max(32, Math.round((r.hauteur * f) / 32) * 32);
      const max = 1024;   // pas plus de 1 024 pixels de long (photo très allongée)
      if (l > max) l = max;
      if (h > max) h = max;
    } else {
      l = h = 320;        // U²-Netp : 320 × 320
    }
    const { toile, ctx } = nouvelleToile(l, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(r.image, 0, 0, l, h);
    const px = ctx.getImageData(0, 0, l, h).data;
    toile.width = 0;
    const n = l * h;
    const entree = new Float32Array(3 * n);
    if (modele === 'personne') {
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) entree[k * n + i] = (px[i * 4 + k] / 255 - 0.5) / 0.5;
    } else {
      let max = 1;
      for (let i = 0; i < px.length; i += 4) max = Math.max(max, px[i], px[i + 1], px[i + 2]);
      const MOYENNE = [0.485, 0.456, 0.406], ECART = [0.229, 0.224, 0.225];
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) entree[k * n + i] = (px[i * 4 + k] / max - MOYENNE[k]) / ECART[k];
    }
    return { entree, largeur: l, hauteur: h };
  },

  /* Trouve le sujet de l'image « r » (une ressource). Renvoie une petite
     toile (1 024 pixels au plus) dont l'opacité dit où est le sujet.
     « avancer(fraction, texte) » est appelé pour la barre de progression. */
  async masque(r, modele, avancer) {
    if (!this.possible()) throw new ErreurIA('impossible', MESSAGES_IA.impossible);
    if (this._enCours) throw new ErreurIA('echec', MESSAGES_IA.echec);
    this._arretDemande = false;

    avancer(0.02, 'Préparation de la photo…');
    const { entree, largeur: el, hauteur: eh } = this._entree(r, modele);

    // Le guide (la photo à 1 024 pixels au plus) pour recaler les bords
    const f = Math.min(1, TAILLE_GUIDE / Math.max(r.largeur, r.hauteur));
    const gl = Math.max(1, Math.round(r.largeur * f)), gh = Math.max(1, Math.round(r.hauteur * f));
    const guide = reduireParEtapes(r.image, r.largeur, r.hauteur, gl, gh);
    const pixels = guide.getContext('2d').getImageData(0, 0, gl, gh).data;
    guide.width = 0;

    await laisserAfficher();     // laisse le temps de toucher « Arrêter »
    this._verifierArret();
    const estimee = this.dureeEstimee(modele);
    let animation = null;
    const resultat = await new Promise((reussir, rater) => {
      const minuteur = setTimeout(() => this._echec(new ErreurIA('delai', MESSAGES_IA.delai)), DELAI_MAX_IA);
      this._enCours = {
        reussir, rater, minuteur,
        progression: (m) => {
          if (m.etape === 'modele') avancer(0.05 + 0.25 * m.fraction, 'Chargement de l\'intelligence artificielle…');
          else if (m.etape === 'moteur') avancer(0.32, 'Démarrage de l\'intelligence artificielle…');
          else if (m.etape === 'analyse') {
            // Pendant le calcul, la barre avance doucement selon la durée
            // de la dernière fois (sans jamais atteindre la fin trop tôt).
            const t0 = performance.now();
            clearInterval(animation);
            animation = setInterval(() => {
              const k = 1 - Math.exp(-(performance.now() - t0) / estimee * 1.6);
              avancer(0.35 + 0.5 * k, 'Recherche du sujet…');
            }, 150);
          } else if (m.etape === 'bords') {
            clearInterval(animation);
            if (m.duree) this._noterDuree(modele, m.duree);
            avancer(0.87, 'Finition des bords…');
          }
        }
      };
      try {
        this._travail().postMessage({ type: 'detourer', modele, entree, largeurEntree: el, hauteurEntree: eh, guide: { largeur: gl, hauteur: gh, pixels } },
          [entree.buffer, pixels.buffer]);
      } catch (e) {
        this._echec(new ErreurIA('memoire', MESSAGES_IA.memoire));
      }
    }).finally(() => clearInterval(animation));

    avancer(0.95, 'Finition des bords…');
    await laisserAfficher();
    this._verifierArret();
    const { toile: masque, ctx: cm } = nouvelleToile(resultat.largeur, resultat.hauteur);
    const im = cm.createImageData(resultat.largeur, resultat.hauteur);
    for (let i = 0; i < resultat.masque.length; i++) im.data[i * 4 + 3] = resultat.masque[i];
    cm.putImageData(im, 0, 0);
    return masque;
  },

  /* Trouve le sujet de l'image du calque « c » et renvoie une toile de la
     même taille, où le fond est devenu transparent. */
  async calculer(c, modele, avancer) {
    const r = Ressources.obtenir(c.ressource);
    if (!r) throw new ErreurIA('echec', MESSAGES_IA.echec);
    const masque = await this.masque(r, modele, avancer);
    const { toile, ctx } = nouvelleToile(r.largeur, r.hauteur);
    ctx.drawImage(r.image, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(masque, 0, 0, r.largeur, r.hauteur);
    ctx.globalCompositeOperation = 'source-over';
    masque.width = 0;
    avancer(1, 'Terminé');
    return toile;
  }
};

/* Lance un calcul d'IA avec la barre de progression et les messages
   d'erreur. « travail(avancer) » fait le calcul. Renvoie son résultat,
   ou null en cas d'arrêt ou d'erreur (le message est déjà affiché). */
async function avecIA(modele, travail) {
  try {
    if (!(await ModulesIA.assurer(modele))) return null;
    Patience.montrer('Préparation de la photo…', { progression: true, arreter: true });
    await laisserAfficher();
    return await travail((fraction, texte) => Patience.avancer(fraction, texte));
  } catch (e) {
    console.warn(e);
    const message = (e instanceof ErreurIA || e instanceof ErreurPhoto) ? e.message : MESSAGES_IA.echec;
    if (e && e.code === 'arret') Message.montrer(message); else Message.erreur(message);
    return null;
  } finally {
    Patience.cacher();
  }
}


/* ============================================================
   L'outil « Détourer » : on choisit le modèle, on lance, on regarde
   l'aperçu, puis « Valider » (ou retoucher au pinceau, ou poser un
   nouveau fond).
   ============================================================ */
const OutilIA = {
  panneau: 'outil-ia',
  calque: null,
  apercu: null,
  voirOriginal: false,
  _calcul: false,

  commencer(c) {
    this.calque = c;
    this.apercu = null;
    this.voirOriginal = false;
    const choix = $(`input[name="ia-modele"][value="${Detourage.modelePrefere()}"]`);
    if (choix) choix.checked = true;
  },

  modele() {
    return ($('input[name="ia-modele"]:checked') || {}).value === 'personne' ? 'personne' : 'objet';
  },

  aDuTravail() {
    return !!this.apercu;
  },

  async lancer() {
    if (this._calcul) return;
    const c = this.calque;
    const modele = this.modele();
    Detourage.retenirModele(modele);
    this._calcul = true;
    this.majPanneau();
    const toile = await avecIA(modele, (avancer) => Detourage.calculer(c, modele, avancer));
    this._calcul = false;
    if (Editeur.outil !== this || this.calque !== c) return;
    if (!toile) { this.majPanneau(); return; }
    if (this.apercu) this.apercu.width = 0;
    this.apercu = toile;
    this.voirOriginal = false;
    this._montrer();
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

  /* « Valider », puis éventuellement ouvrir un autre outil. */
  valider(ensuite) {
    if (!this.apercu) return;
    const c = this.calque;
    Retouche.valider(c, this.apercu, { garderSource: true });
    this.apercu = null;
    this.fermer();
    if (ensuite === 'pinceau') Retouche.ouvrir(OutilPinceau, Montage.calque(c.id));
    else if (ensuite === 'fond') Fond.ouvrir();
    else Message.montrer('Fond retiré ✓ Le damier montre les zones transparentes. « Pinceau » corrige les bords, « Fond » pose un nouvel arrière-plan.');
  },

  retirerDernier() {
    return false;
  },

  fermer() {
    if (Detourage._enCours) Detourage.arreter();
    this.apercu = null;
    Rendu.remplacements.clear();
    if (Editeur.outil === this) Editeur.choisirOutil(null);
  },

  majPanneau() {
    const pret = !!this.apercu;
    $('#ia-etat').textContent = this._calcul ? 'Détourage en cours…'
      : (pret ? (this.voirOriginal ? 'Tu vois la photo d\'origine.' : 'Aperçu : le damier montre le fond retiré.')
        : 'Choisis le genre de sujet, puis touche « Détourer ».');
    for (const a of ['ia-comparer', 'ia-valider', 'ia-pinceau', 'ia-fond']) $(`[data-action="${a}"]`).disabled = !pret;
    $('[data-action="ia-lancer"]').disabled = this._calcul;
    const t = $('[data-action="ia-lancer"] .texte-bouton');
    if (t) t.textContent = pret ? 'Recommencer' : 'Détourer';
    const b = $('[data-action="ia-comparer"] .texte-bouton');
    if (b) b.textContent = this.voirOriginal ? 'Voir le détourage' : 'Voir l\'original';
  }
};
