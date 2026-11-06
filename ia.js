/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   Le retrait automatique du fond, par une intelligence artificielle
   qui tourne DANS le téléphone (rien n'est envoyé sur internet).

   Les étapes :
   1. la photo est réduite à 320 × 320 pixels : c'est la taille de
      travail du modèle U²-Netp (rapide, même sur un téléphone moyen) ;
   2. le « travailleur » (detourage-travail.js) trouve le sujet, puis
      recale les bords sur la photo à 1 024 pixels au plus ;
   3. ce masque est appliqué à la photo EN TAILLE RÉELLE : la photo
      elle-même n'est jamais réduite, seul le masque est agrandi.
   ============================================================ */
'use strict';

const TAILLE_IA = 320;         // taille d'entrée du modèle
const TAILLE_GUIDE = 1024;     // taille du recalage des bords
const DELAI_MAX_IA = 180000;   // au-delà de 3 minutes, on abandonne

class ErreurIA extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const MESSAGES_IA = {
  impossible: 'Ce navigateur ne sait pas faire tourner l\'intelligence artificielle. Mets Google Chrome à jour ' +
              'depuis le Play Store, puis réessaie. Tu peux aussi détourer à la main avec « Découper ».',
  fichiers: 'Les fichiers de l\'intelligence artificielle ne sont pas encore dans ton téléphone. Connecte-toi une fois ' +
            'à internet, rouvre Omni-Photo et patiente une minute, puis réessaie.',
  memoire: 'Ton téléphone manque de mémoire pour le détourage automatique. Ferme quelques applications puis réessaie. ' +
           'Ta photo n\'a pas été modifiée.',
  delai: 'Le détourage prend trop de temps sur ce téléphone et a été arrêté. Ta photo n\'a pas été modifiée. ' +
         'Tu peux réessayer, ou détourer à la main avec « Découper ».',
  arret: 'Détourage arrêté. Ta photo n\'a pas été modifiée.',
  echec: 'Le détourage automatique n\'a pas marché. Ta photo n\'a pas été modifiée. Réessaie, ou détoure à la main ' +
         'avec « Découper ».'
};

const Detourage = {
  _travailleur: null,
  _enCours: null,       // { reussir, rater, minuteur }

  /* Combien de temps a pris le calcul la dernière fois (en millisecondes),
     pour faire avancer la barre au bon rythme. */
  dureeEstimee() {
    try { return Number(localStorage.getItem('omniphoto-duree-ia')) || 6000; } catch (e) { return 6000; }
  },
  _noterDuree(ms) {
    try { localStorage.setItem('omniphoto-duree-ia', String(Math.round(ms))); } catch (e) { /* pas grave */ }
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

  /* Bouton « Arrêter » pendant le calcul. La demande est notée : si le
     calcul n'a pas encore commencé (préparation de la photo), il
     s'arrêtera avant de démarrer. */
  arreter() {
    this._arretDemande = true;
    if (this._enCours) this._echec(new ErreurIA('arret', MESSAGES_IA.arret));
  },

  _verifierArret() {
    if (this._arretDemande) throw new ErreurIA('arret', MESSAGES_IA.arret);
  },

  /* Trouve le sujet de l'image du calque « c » et renvoie une toile de la
     même taille, où le fond est devenu transparent.
     « avancer(fraction, texte) » est appelé pour la barre de progression. */
  async calculer(c, avancer) {
    if (!this.possible()) throw new ErreurIA('impossible', MESSAGES_IA.impossible);
    if (this._enCours) throw new ErreurIA('echec', MESSAGES_IA.echec);
    this._arretDemande = false;
    const r = Ressources.obtenir(c.ressource);
    if (!r) throw new ErreurIA('echec', MESSAGES_IA.echec);

    // 1. L'image d'entrée du modèle : 320 × 320, couleurs « normalisées »
    //    (comme pendant l'apprentissage du modèle).
    avancer(0.02, 'Préparation de la photo…');
    const { toile: petite, ctx: cp } = nouvelleToile(TAILLE_IA, TAILLE_IA);
    cp.imageSmoothingQuality = 'high';
    cp.drawImage(r.image, 0, 0, TAILLE_IA, TAILLE_IA);
    const px = cp.getImageData(0, 0, TAILLE_IA, TAILLE_IA).data;
    petite.width = 0;
    let max = 1;
    for (let i = 0; i < px.length; i += 4) max = Math.max(max, px[i], px[i + 1], px[i + 2]);
    const MOYENNE = [0.485, 0.456, 0.406], ECART = [0.229, 0.224, 0.225];
    const n = TAILLE_IA * TAILLE_IA;
    const entree = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) entree[k * n + i] = (px[i * 4 + k] / max - MOYENNE[k]) / ECART[k];
    }

    // 2. Le guide (la photo à 1 024 pixels au plus) pour recaler les bords
    const f = Math.min(1, TAILLE_GUIDE / Math.max(r.largeur, r.hauteur));
    const gl = Math.max(1, Math.round(r.largeur * f)), gh = Math.max(1, Math.round(r.hauteur * f));
    const guide = reduireParEtapes(r.image, r.largeur, r.hauteur, gl, gh);
    const pixels = guide.getContext('2d').getImageData(0, 0, gl, gh).data;
    guide.width = 0;

    // 3. Le calcul, dans le travailleur
    await laisserAfficher();     // laisse le temps de toucher « Arrêter »
    this._verifierArret();
    const estimee = this.dureeEstimee();
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
            if (m.duree) this._noterDuree(m.duree);
            avancer(0.87, 'Finition des bords…');
          }
        }
      };
      try {
        this._travail().postMessage({ type: 'detourer', entree, guide: { largeur: gl, hauteur: gh, pixels } }, [entree.buffer, pixels.buffer]);
      } catch (e) {
        this._echec(new ErreurIA('memoire', MESSAGES_IA.memoire));
      }
    }).finally(() => clearInterval(animation));

    // 4. Le masque est appliqué à la photo en taille réelle
    avancer(0.95, 'Finition des bords…');
    await laisserAfficher();
    this._verifierArret();
    const { toile: masque, ctx: cm } = nouvelleToile(resultat.largeur, resultat.hauteur);
    const im = cm.createImageData(resultat.largeur, resultat.hauteur);
    for (let i = 0; i < resultat.masque.length; i++) im.data[i * 4 + 3] = resultat.masque[i];
    cm.putImageData(im, 0, 0);
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


/* ============================================================
   L'outil « Détourer » : lance l'IA, montre le résultat en aperçu,
   puis « Valider » (ou retoucher au pinceau, ou poser un nouveau fond).
   ============================================================ */
const OutilIA = {
  panneau: 'outil-ia',
  calque: null,
  apercu: null,
  voirOriginal: false,

  commencer(c) {
    this.calque = c;
    this.apercu = null;
    this.voirOriginal = false;
    // Le calcul démarre dès que le panneau est affiché
    setTimeout(() => this.lancer(), 0);
  },

  aDuTravail() {
    return !!this.apercu;
  },

  async lancer() {
    const c = this.calque;
    Patience.montrer('Préparation de la photo…', { progression: true, arreter: true });
    await laisserAfficher();
    try {
      this.apercu = await Detourage.calculer(c, (fraction, texte) => Patience.avancer(fraction, texte));
      if (Editeur.outil !== this || this.calque !== c) { this.apercu = null; return; }
      this.voirOriginal = false;
      this._montrer();
    } catch (e) {
      console.warn(e);
      this.fermer();
      const message = (e instanceof ErreurIA || e instanceof ErreurPhoto) ? e.message : MESSAGES_IA.echec;
      if (e && e.code === 'arret') Message.montrer(message); else Message.erreur(message);
    } finally {
      Patience.cacher();
    }
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
    $('#ia-etat').textContent = pret
      ? (this.voirOriginal ? 'Tu vois la photo d\'origine.' : 'Aperçu : le damier montre le fond retiré.')
      : 'Détourage en cours…';
    for (const a of ['ia-comparer', 'ia-valider', 'ia-pinceau', 'ia-fond']) $(`[data-action="${a}"]`).disabled = !pret;
    const b = $('[data-action="ia-comparer"] .texte-bouton');
    if (b) b.textContent = this.voirOriginal ? 'Voir le détourage' : 'Voir l\'original';
  }
};
