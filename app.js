/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   Le chef d'orchestre : les écrans (accueil, éditeur, à propos), les
   boutons, l'ouverture des photos, l'installation et les mises à jour.
   ============================================================ */
'use strict';

/* ⚠️ Numéro de version, affiché dans « À propos ». À changer à chaque
   version publiée, EN MÊME TEMPS que CACHE en haut de sw.js. */
const VERSION = '1.3.0';


/* ---------- 1. Les écrans ---------- */

let vueActive = 'accueil';

function afficherVue(nom) {
  vueActive = nom;
  for (const v of $$('.vue')) v.hidden = v.dataset.vue !== nom;
  document.body.dataset.vue = nom;
  if (nom === 'accueil') Accueil.majListe();
  if (nom === 'apropos') APropos.maj();
  if (nom === 'verifier') Diagnostic.afficher();
  if (nom === 'editeur') {
    Editeur.redimensionner();
    Editeur.ajusterVue();
    Panneaux.majPanneau();
    Historique.majBoutons();
    Guide.peutEtreMontrer();
  } else {
    Guide.terminerSiOuvert();
  }
  const titre = $(`.vue[data-vue="${nom}"] h1`);
  if (titre && nom !== 'editeur') titre.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

/* Le bouton « retour » du téléphone ramène à l'accueil (le montage est
   sauvegardé). On note l'écran dans l'adresse (#editeur, #apropos). */
function allerVers(nom) {
  if (nom === vueActive) return;
  if (nom === 'accueil') {
    if (location.hash) history.back();
    else afficherVue('accueil');
    return;
  }
  history.pushState(null, '', '#' + nom);
  afficherVue(nom);
}

window.addEventListener('popstate', () => {
  const nom = location.hash.slice(1);
  if (nom === 'apropos' || nom === 'verifier') afficherVue(nom);
  else if (nom === 'editeur' && Montage.doc) afficherVue('editeur');
  else {
    // Retour du téléphone pendant une retouche : elle est abandonnée
    if (Editeur.outil) Editeur.outil.fermer();
    if (vueActive === 'editeur') Sauvegarde.maintenant();
    afficherVue('accueil');
  }
});


/* ---------- 2. L'accueil (voir montages.js) ---------- */

/* Une image ajoutée par-dessus (logo, autre photo). */
async function ajouterImageCalque(fichier) {
  if (!fichier || !Montage.doc) return;
  Patience.montrer('Ajout de l\'image…');
  await laisserAfficher();
  try {
    const r = await Ressources.depuisFichier(fichier, LIMITES.calque);
    Historique.action(() => Montage.ajouterImage(r.id, r.largeur, r.hauteur));
    Message.montrer('Image ajoutée. Fais-la glisser, pince pour l\'agrandir, tourne avec deux doigts.');
  } catch (e) {
    console.warn(e);
    Message.erreur(e instanceof ErreurPhoto ? e.message : MESSAGES_PHOTO.lecture);
  } finally {
    Patience.cacher();
  }
}

/* Les sélecteurs de fichiers (cachés) : galerie, appareil photo, calque. */
function choisirFichier(selecteur) {
  const champ = $(selecteur);
  champ.value = '';   // pour pouvoir choisir deux fois la même photo
  champ.click();
}


/* ---------- 3. Tous les boutons ----------
   Chaque bouton porte un « data-action » ; on trouve ici ce qu'il fait. */

const ACTIONS = {
  // Accueil (montages.js)
  'ouvrir-galerie': () => choisirFichier('#fichier-photo'),
  'ouvrir-camera': () => choisirFichier('#fichier-camera'),
  'ouvrir-toile': () => $('#fenetre-toile').showModal(),
  'importer-montage': () => choisirFichier('#fichier-montage'),
  'sauver-tout': () => Accueil.enregistrerTout(),
  'ouvrir-collage': () => choisirFichier('#fichier-collage'),
  'creer-collage': () => Collage.creer(),
  'voir-verifier': () => allerVers('verifier'),
  'verif-vitesse': () => Diagnostic.testerVitesse(),
  'ajouter-signature': () => Signature.ajouter(),
  'enregistrer-signature': () => Signature.enregistrer(Montage.calqueChoisi()),
  'lumiere-auto': () => OutilLumiere.auto(),
  'outil-correcteur': () => Retouche.ouvrir(OutilCorrecteur),
  'correcteur-comparer': () => OutilCorrecteur.basculerComparaison(),
  'correcteur-retirer': () => OutilCorrecteur.retirerDernier(),
  'correcteur-valider': () => OutilCorrecteur.valider(),
  'correcteur-source': () => OutilCorrecteur.choisirAutreSource(),
  'outil-cacher': () => Retouche.ouvrir(OutilCacher),
  'cacher-comparer': () => OutilCacher.basculerComparaison(),
  'cacher-retirer': () => OutilCacher.retirerDernier(),
  'cacher-valider': () => OutilCacher.valider(),
  'ouvrir-modeles': () => Modeles.ouvrir(),
  'modele-choisir': (b) => Modeles.choisir(b.dataset.id),
  'modele-photo': () => choisirFichier('#fichier-modele'),
  'modele-sans-photo': () => Modeles.creer(null),
  'modele-retour': () => { $('#modele-etape-photo').hidden = true; $('#liste-modeles').hidden = false; },
  'montage-ouvrir': (b) => Accueil.ouvrirMontage(b.dataset.id),
  'montage-renommer': (b) => Accueil.renommer(b.dataset.id),
  'valider-nom': () => Accueil.validerNom(),
  'montage-fichier': (b) => Accueil.enregistrerFichier(b.dataset.id),
  'montage-supprimer': (b) => armerBouton(b, 'Toucher encore', () => Accueil.supprimer(b.dataset.id)),
  'creer-toile': () => {
    const [l, h] = ($('input[name="f-format"]:checked') || { value: '1080x1080' }).value.split('x').map(Number);
    const fond = ($('input[name="f-fond"]:checked') || {}).value;
    $('#fenetre-toile').close();
    Accueil.ouvrirToile(l, h, fond);
  },
  'voir-apropos': () => allerVers('apropos'),
  'retour': () => allerVers('accueil'),
  'mettre-a-jour': (b) => MiseAJour.appliquer(b),
  'plus-tard': () => MiseAJour.repousser(),
  'installer': () => Installation.installer(),
  'fermer-message': () => Message.cacher(),
  'fermer-fenetre': (b) => b.closest('dialog').close(),

  // Éditeur : barre du haut
  'accueil': () => { if (!Retouche.verifierLibre()) return; Sauvegarde.maintenant(); allerVers('accueil'); },
  'annuler': () => {
    // Pendant une retouche, « Annuler » retire d'abord le dernier œil / point
    const outil = Editeur.outil;
    if (outil) {
      if (outil.retirerDernier()) return;
      outil.fermer();
    }
    if (!Historique.annuler()) Message.montrer('Rien à annuler.');
  },
  'retablir': () => {
    if (Editeur.outil && !Retouche.verifierLibre()) return;
    if (!Historique.retablir()) Message.montrer('Rien à rétablir.');
  },
  'ouvrir-export': () => { if (Retouche.verifierLibre()) Export.ouvrir(); },
  'enregistrer': () => Export.enregistrer(),
  'partager': () => Export.partager(),
  'ouvrir-impression': () => Impression.ouvrir(),
  'imprimer': () => Impression.imprimer(),
  'imprimer-pdf': () => Impression.enregistrerPDF(),
  'partager-pdf': () => Impression.partagerPDF(),

  // Éditeur : outils
  'onglet': (b) => Panneaux.choisirOnglet(b.dataset.onglet),
  'ajouter-forme': () => Formes.ajouter(),
  'modifier-forme': () => FenetreForme.ouvrir(Montage.selection),
  'ouvrir-effets': () => FenetreEffets.ouvrir(Montage.selection),
  'outil-recadrage': () => OutilRecadrage.ouvrir(),
  'recadrage-format': () => OutilRecadrage.choisirFormat(),
  'recadrage-tourner-gauche': () => OutilRecadrage.tourner(-1),
  'recadrage-tourner-droite': () => OutilRecadrage.tourner(+1),
  'recadrage-appliquer': () => OutilRecadrage.appliquer(),
  'outil-lumiere': () => Retouche.ouvrir(OutilLumiere),
  'lumiere-reinitialiser': () => OutilLumiere.reinitialiser(),
  'lumiere-terminer': () => OutilLumiere.fermer(),
  'outil-flou': () => Retouche.ouvrir(OutilFlou),
  'flou-lancer': () => OutilFlou.trouverSujet(),
  'flou-comparer': () => OutilFlou.basculerComparaison(),
  'flou-valider': () => OutilFlou.valider(),
  'ia-lancer': () => OutilIA.lancer(),
  'guide-suivant': () => Guide.suivant(),
  'guide-passer': () => Guide.terminer(),
  'revoir-guide': () => Guide.revoir(),
  'supprimer-ia': (b) => armerBouton(b, 'Toucher encore pour supprimer', async () => {
    await ModulesIA.supprimer();
    APropos.maj();
    Message.montrer('Fichiers de l\'intelligence artificielle supprimés. Ils seront retéléchargés au prochain détourage.');
  }),
  'ajouter-texte': () => {
    Historique.debut();   // ajout + écriture = une seule étape d'« Annuler »
    const c = Montage.ajouterTexte();
    Panneaux.ouvrirTexte(c.id);
  },
  'ajouter-image': () => choisirFichier('#fichier-calque'),
  'ouvrir-calques': () => Panneaux.ouvrirCalques(),
  'voir-tout': () => Editeur.ajusterVue(),
  'deselectionner': () => Montage.choisir(null),

  // Éditeur : calque choisi
  'modifier-texte': () => Panneaux.ouvrirTexte(Montage.selection),
  'miroir-h': () => avecChoisi((c) => Montage.modifier(c.id, { miroirH: !c.miroirH })),
  'miroir-v': () => avecChoisi((c) => Montage.modifier(c.id, { miroirV: !c.miroirV })),
  'avancer': () => avecChoisi((c) => Montage.deplacerOrdre(c.id, +1)),
  'reculer': () => avecChoisi((c) => Montage.deplacerOrdre(c.id, -1)),
  'dupliquer': () => avecChoisi((c) => { Montage.dupliquer(c.id); Message.montrer('Copie ajoutée, un peu décalée.'); }),
  'supprimer': (b) => armerBouton(b, 'Toucher encore pour supprimer', () => avecChoisi((c) => {
    Montage.supprimer(c.id);
    Message.montrer('Calque supprimé. « Annuler » le fait revenir.');
  })),
  'deverrouiller': () => avecChoisi((c) => Montage.modifier(c.id, { verrouille: false })),

  // Retouches (retouches.js)
  'outil-yeux': () => Retouche.ouvrir(OutilYeux),
  'outil-decoupe': () => Retouche.ouvrir(OutilDecoupe),
  'outil-fermer': (b) => {
    const outil = Editeur.outil;
    if (!outil) return;
    if (outil.aDuTravail()) armerBouton(b, 'Toucher encore : abandonner', () => outil.fermer());
    else outil.fermer();
  },
  'yeux-comparer': () => OutilYeux.basculerComparaison(),
  'yeux-retirer': () => OutilYeux.retirerDernier(),
  'yeux-valider': () => OutilYeux.valider(),
  'decoupe-retirer': () => OutilDecoupe.retirerDernier(),
  'decoupe-effacer': (b) => armerBouton(b, 'Toucher encore', () => OutilDecoupe.toutEffacer()),
  'decoupe-apercu': () => OutilDecoupe.voirApercu(),
  'decoupe-reprendre': () => OutilDecoupe.reprendre(),
  'decoupe-valider': () => OutilDecoupe.valider(),

  // Détourage par IA (ia.js), pinceau (retouches.js), fond (fond.js)
  'outil-ia': () => Retouche.ouvrir(OutilIA),
  'ia-comparer': () => OutilIA.basculerComparaison(),
  'ia-valider': () => OutilIA.valider(),
  'ia-pinceau': () => OutilIA.valider('pinceau'),
  'ia-fond': () => OutilIA.valider('fond'),
  'ia-arreter': () => Detourage.arreter(),
  'outil-pinceau': () => Retouche.ouvrir(OutilPinceau),
  'pinceau-fantome': () => OutilPinceau.basculerFantome(),
  'pinceau-retirer': () => OutilPinceau.retirerDernier(),
  'pinceau-valider': () => OutilPinceau.valider(),
  'ouvrir-fond': () => Fond.ouvrir(),
  'fond-photo': () => choisirFichier('#fichier-fond'),
  'fond-retirer': (b) => armerBouton(b, 'Toucher encore pour retirer le fond', () => Fond.retirer()),

  // Fenêtre « Calques »
  'choisir-calque': (b) => {
    const c = Montage.calque(b.dataset.id);
    $('#fenetre-calques').close();
    if (c && c.type === 'fond') { Fond.ouvrir(); return; }   // le fond se règle dans sa fenêtre
    if (c && c.type === 'forme' && c.forme === 'cadre') { Montage.choisir(c.id); FenetreForme.ouvrir(c.id); return; }
    Montage.choisir(b.dataset.id);
  },
  'calque-monter': (b) => Montage.deplacerOrdre(b.dataset.id, +1),
  'calque-descendre': (b) => Montage.deplacerOrdre(b.dataset.id, -1),
  'calque-visible': (b) => { const c = Montage.calque(b.dataset.id); if (c) Montage.modifier(c.id, { visible: !c.visible }); },
  'calque-verrou': (b) => {
    const c = Montage.calque(b.dataset.id);
    if (!c) return;
    Montage.modifier(c.id, { verrouille: !c.verrouille });
    if (c.verrouille && Montage.selection === c.id) Montage.choisir(null);
  }
};

/* Une modification du calque choisi = une étape d'« Annuler ». */
function avecChoisi(fn) {
  const c = Montage.calqueChoisi();
  if (c) Historique.action(() => fn(c));
}

document.addEventListener('click', (e) => {
  const bouton = e.target.closest('[data-action]');
  if (!bouton || bouton.disabled) return;
  const action = ACTIONS[bouton.dataset.action];
  if (action) action(bouton);
});

/* Raccourcis clavier (tablette avec clavier, ordinateur) :
   Ctrl+Z = annuler, Ctrl+Y ou Ctrl+Maj+Z = rétablir. */
document.addEventListener('keydown', (e) => {
  if (vueActive !== 'editeur' || !(e.ctrlKey || e.metaKey)) return;
  if (document.querySelector('dialog[open]')) return;
  const t = e.key.toLowerCase();
  if (t === 'z' && !e.shiftKey) { e.preventDefault(); ACTIONS.annuler(); }
  else if (t === 'y' || (t === 'z' && e.shiftKey)) { e.preventDefault(); ACTIONS.retablir(); }
});


/* ---------- 4. Mises à jour et installation ----------
   Quand une nouvelle version est publiée, le téléphone la télécharge
   discrètement, puis ATTEND : un bandeau sur l'accueil propose
   « Mettre à jour ». Jamais de changement par surprise. */

const MiseAJour = {
  inscription: null,
  demandee: false,
  repoussee: false,

  surveiller(inscription) {
    this.inscription = inscription;
    this.majBandeau();
    inscription.addEventListener('updatefound', () => {
      const nouveau = inscription.installing;
      if (!nouveau) return;
      nouveau.addEventListener('statechange', () => {
        if (nouveau.state === 'installed') this.majBandeau();
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') inscription.update().catch(() => {});
    });
  },

  prete() {
    return !!(this.inscription && this.inscription.waiting && navigator.serviceWorker.controller);
  },

  majBandeau() {
    $('#bandeau-mise-a-jour').hidden = !this.prete() || this.repoussee;
  },

  async appliquer(bouton) {
    if (!this.prete()) return;
    await Sauvegarde.maintenant();
    this.demandee = true;
    bouton.disabled = true;
    bouton.textContent = 'Mise à jour…';
    this.inscription.waiting.postMessage({ type: 'activer' });
  },

  repousser() {
    this.repoussee = true;
    this.majBandeau();
    Message.montrer('D\'accord. Omni-Photo te le reproposera à la prochaine ouverture.');
  }
};

const Installation = {
  _demande: null,

  initialiser() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this._demande = e;
      $('#bandeau-installer').hidden = false;
    });
    window.addEventListener('appinstalled', () => {
      this._demande = null;
      $('#bandeau-installer').hidden = true;
      Persistance.demander();
      Message.montrer('Omni-Photo est installée ✓ Tu la retrouves sur l\'écran d\'accueil du téléphone.');
    });
  },

  async installer() {
    if (!this._demande) return;
    const demande = this._demande;
    this._demande = null;
    $('#bandeau-installer').hidden = true;
    try { await demande.prompt(); } catch (e) { /* refusé : rien de grave */ }
  }
};


/* Le fonctionnement sans Internet est-il prêt ? (écran « Vérifier mon
   téléphone ») Réponses : 'pret', 'premiere-visite', 'incomplet' ou
   'impossible'. Le service worker vérifie sa réserve et répond. */
async function etatHorsLigne() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return 'impossible';
  const gardien = navigator.serviceWorker.controller;
  if (!gardien) return 'premiere-visite';
  try {
    const reponse = await avecDelai(new Promise((reussir) => {
      const canal = new MessageChannel();
      canal.port1.onmessage = (e) => reussir(e.data);
      gardien.postMessage({ type: 'verifier' }, [canal.port2]);
    }), 15000);
    return reponse && reponse.complet ? 'pret' : 'incomplet';
  } catch (e) {
    return 'incomplet';
  }
}

/* Version 1.2 : des photos partagées depuis la galerie (menu « Partager »
   d'Android → Omni-Photo). Le service worker les a rangées dans la
   réserve « omni-photo-partage » ; on les ouvre (une photo = un montage,
   plusieurs = un collage), puis on vide la réserve. */
const Partage = {
  async recevoir() {
    let fichiers = [];
    try {
      const c = await caches.open('omni-photo-partage');
      for (const req of await c.keys()) {
        const rep = await c.match(req);
        const nom = decodeURIComponent(rep.headers.get('X-Nom') || 'photo');
        fichiers.push(new File([await rep.blob()], nom, { type: rep.headers.get('Content-Type') || 'image/jpeg' }));
        await c.delete(req);
      }
    } catch (e) {
      console.warn(e);
    }
    if (!fichiers.length) {
      Message.erreur('Les photos partagées n\'ont pas pu être reçues. Ouvre-les plutôt avec « Ouvrir une photo de ma galerie ».');
      return;
    }
    if (fichiers.length === 1) Accueil.ouvrirPhoto(fichiers[0]);
    else Collage.depuisFichiers(fichiers);
  }
};

/* La page « À propos » : les fichiers de l'IA déjà dans le téléphone. */
const APropos = {
  async maj() {
    const etat = await ModulesIA.etat();
    const lignes = [];
    for (const [modele, pret] of Object.entries(etat)) {
      const m = MODELES_IA[modele];
      lignes.push(`${m.nom} : ${pret ? 'dans le téléphone ✓' : 'pas encore téléchargé'}`);
    }
    $('#ia-etat-fichiers').textContent = lignes.join(' · ');
    $('[data-action="supprimer-ia"]').hidden = !Object.values(etat).some(Boolean);
  }
};


/* ---------- 5. Démarrage ---------- */

async function demarrer() {
  $('#numero-version').textContent = 'Version ' + VERSION;
  Editeur.initialiser();
  Panneaux.initialiser();
  Export.initialiser();
  Impression.initialiser();
  FenetreEffets.initialiser();
  FenetreForme.initialiser();
  Installation.initialiser();

  // Les sélecteurs de fichiers
  $('#fichier-photo').addEventListener('change', (e) => Accueil.ouvrirPhoto(e.target.files[0]));
  $('#fichier-camera').addEventListener('change', (e) => Accueil.ouvrirPhoto(e.target.files[0]));
  $('#fichier-calque').addEventListener('change', (e) => ajouterImageCalque(e.target.files[0]));
  $('#fichier-montage').addEventListener('change', (e) => Accueil.importerFichier(e.target.files[0]));
  $('#fichier-collage').addEventListener('change', (e) => Collage.depuisFichiers(e.target.files));
  $('#fenetre-collage').addEventListener('input', () => Collage.apercu());
  $('#fenetre-collage').addEventListener('change', () => Collage.apercu());
  $('#fenetre-collage').addEventListener('close', () => Collage.annuler());
  $('#fichier-modele').addEventListener('change', (e) => { if (e.target.files[0]) Modeles.creer(e.target.files[0]); });
  $('#cr-taille').addEventListener('input', () => OutilCorrecteur.montrerReglage());
  $('#outil-correcteur').addEventListener('change', () => { if (Editeur.outil === OutilCorrecteur) OutilCorrecteur._maj(); });
  $('#outil-cacher').addEventListener('input', (e) => { if (Editeur.outil === OutilCacher) OutilCacher.reglageChange(e); });
  $('#outil-cacher').addEventListener('change', (e) => { if (Editeur.outil === OutilCacher) OutilCacher.reglageChange(e); });
  $('#fenetre-nom').addEventListener('submit', (e) => { e.preventDefault(); Accueil.validerNom(); });

  // Nouveaux outils de la version 1.1
  $('#outil-recadrage').addEventListener('change', (e) => { if (e.target.name === 'rc-format') OutilRecadrage.choisirFormat(); });
  $('#rc-redresser').addEventListener('input', (e) => OutilRecadrage.redresser(Number(e.target.value)));
  $('#rc-redresser').addEventListener('change', () => Historique.fin());
  $('#outil-lumiere').addEventListener('input', () => { if (Editeur.outil === OutilLumiere) OutilLumiere.appliquer(); });
  $('#outil-lumiere').addEventListener('change', () => { if (Editeur.outil === OutilLumiere) OutilLumiere.appliquer(); });
  $('#fl-force').addEventListener('input', () => OutilFlou.reglerForce());
  $('#fenetre-ia').addEventListener('click', (e) => {
    const b = e.target.closest('[data-reponse]');
    if (b) $('#fenetre-ia').close(b.dataset.reponse);
  });

  // Réglages des outils de retouche
  $('#y-taille').addEventListener('input', () => OutilYeux.montrerReglage());
  $('#outil-decoupe').addEventListener('change', () => { if (Editeur.outil === OutilDecoupe) OutilDecoupe._maj(); });
  $('#d-adoucir').addEventListener('input', () => OutilDecoupe.majPanneau());
  $('#p-taille').addEventListener('input', () => OutilPinceau.montrerReglage());
  $('#p-douceur').addEventListener('input', () => OutilPinceau.majPanneau());
  $('#outil-pinceau').addEventListener('change', () => { if (Editeur.outil === OutilPinceau) OutilPinceau.majPanneau(); });
  $('#fichier-fond').addEventListener('change', (e) => Fond.choisirPhoto(e.target.files[0]));
  $('#fenetre-fond').addEventListener('input', () => Fond.appliquer());
  $('#fenetre-fond').addEventListener('change', () => Fond.appliquer());
  $('#fenetre-fond').addEventListener('close', () => Fond.fermer());

  // On sauvegarde quand l'application passe en arrière-plan
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && Montage.doc) Sauvegarde.maintenant();
  });

  // Les polices arrivent : les textes sont remesurés et redessinés
  Polices.charger().then(() => { Rendu.oublierMesures(); Editeur.redessiner(); Panneaux.majPanneau(); });

  // Mode hors ligne : le service worker (fichier sw.js)
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (MiseAJour.demandee) location.reload();
    });
    navigator.serviceWorker.register('./sw.js').then((i) => MiseAJour.surveiller(i)).catch(() => {
      /* Pas de mode hors ligne : l'application marche quand même tant qu'elle est ouverte. */
    });
  }

  $('#chargement').hidden = true;
  $('#application').hidden = false;

  Panneaux.majOnglets();

  // L'écran demandé par l'adresse (l'éditeur, lui, demande un montage)
  const demande = location.hash.slice(1);
  const ecranDirect = demande === 'apropos' || demande === 'verifier';
  if (!ecranDirect) history.replaceState(null, '', location.pathname + location.search);
  afficherVue(ecranDirect ? demande : 'accueil');
  document.body.dataset.pret = 'oui';

  // Des photos arrivent du menu « Partager » d'Android (voir sw.js)
  if (demande === 'partage') Partage.recevoir();
}

demarrer().catch((erreur) => {
  console.error(erreur);
  const p = $('#chargement');
  p.hidden = false;
  p.textContent = 'Omni-Photo n\'a pas réussi à démarrer. Ferme-la et rouvre-la ; si le souci revient, ' +
    'mets Google Chrome à jour depuis le Play Store.';
});
