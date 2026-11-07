/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   Les modèles tout prêts : carte d'anniversaire, invitation, annonce,
   miniature YouTube, souvenir, citation.

   Un modèle = un format + une liste de calques décrits EN PROPORTIONS de
   l'image (rx, ry = place du centre ; rl, rh = largeur et hauteur ;
   taille des textes = part du petit côté). Il devient un montage
   ordinaire : chaque texte se modifie en le touchant, chaque forme se
   déplace…
   La « photo » d'un modèle est une zone (rectangle ou rond) : si on
   choisit une photo, elle la remplit (sans déformation) ; sinon, une
   forme claire marque l'emplacement.
   ============================================================ */
'use strict';

/* Un texte de modèle (les réglages manquants prennent une valeur simple). */
function texteModele(texte, rx, ry, o = {}) {
  return {
    type: 'texte', texte, rx, ry, taille: o.taille || 0.07, police: o.police || 'simple', couleur: o.couleur || '#ffffff',
    gras: o.gras !== false, alignement: o.alignement || 'centre', courbure: o.courbure || 0, espacement: o.espacement || 0,
    rotation: o.rotation || 0,
    contour: Object.assign({ actif: false, couleur: '#1b1726', epaisseur: 0.08 }, o.contour),
    ombre: Object.assign({ actif: false, couleur: '#000000', flou: 0.12, distance: 0.05 }, o.ombre),
    bandeau: Object.assign({ actif: false, couleur: '#1b1726', opacite: 0.85 }, o.bandeau)
  };
}

function formeModele(forme, rx, ry, rl, rh, o = {}) {
  return {
    type: 'forme', forme, rx, ry, rl, rh, rotation: o.rotation || 0,
    remplissage: { actif: o.remplir !== false, couleur: o.couleur || '#f4d35e' },
    trait: { actif: !!o.trait, couleur: o.trait || '#ffffff', epaisseur: o.epaisseur || 0.04 },
    arrondi: o.arrondi == null ? 0.25 : o.arrondi, bord: o.bord || 0.04
  };
}

const MODELES = [
  {
    id: 'anniversaire', nom: 'Anniversaire', taille: [2048, 2048],
    fond: { mode: 'degrade', couleur: '#ffd6e8', couleur2: '#c9a7ff', direction: 'rond' },
    photo: { rx: 0.5, ry: 0.47, rl: 0.5, rh: 0.5, rond: true },
    calques: [
      texteModele('Joyeux anniversaire !', 0.5, 0.13, { taille: 0.085, police: 'luckiest-guy', courbure: 30, contour: { actif: true, couleur: '#5b2a86', epaisseur: 0.09 } }),
      texteModele('Prénom', 0.5, 0.84, { taille: 0.11, police: 'satisfy', couleur: '#5b2a86', gras: false }),
      formeModele('etoile', 0.13, 0.27, 0.09, 0.09, { couleur: '#f4d35e', rotation: -12 }),
      formeModele('etoile', 0.87, 0.3, 0.07, 0.07, { couleur: '#ffffff', rotation: 15 }),
      formeModele('coeur', 0.15, 0.72, 0.08, 0.07, { couleur: '#e4572e', rotation: -10 }),
      formeModele('etoile', 0.86, 0.7, 0.1, 0.1, { couleur: '#f4d35e', rotation: 8 })
    ]
  },
  {
    id: 'invitation', nom: 'Invitation', taille: [1638, 2048],
    fond: { mode: 'couleur', couleur: '#fbf6ee' },
    photo: { rx: 0.5, ry: 0.32, rl: 0.8, rh: 0.4, arrondi: 0.12 },
    calques: [
      formeModele('cadre', 0.5, 0.5, 1, 1, { couleur: '#c9a24a', bord: 0.03, arrondi: 0 }),
      texteModele('Invitation', 0.5, 0.62, { taille: 0.12, police: 'roboto-slab', couleur: '#3d2c5a' }),
      texteModele('Samedi 12 juin, à 15 h', 0.5, 0.73, { taille: 0.055, couleur: '#5a4a6e', gras: false }),
      texteModele('Chez nous, au jardin', 0.5, 0.82, { taille: 0.07, police: 'satisfy', couleur: '#b08a32', gras: false })
    ]
  },
  {
    id: 'annonce', nom: 'Grande nouvelle', taille: [1152, 2048],
    fond: { mode: 'degrade', couleur: '#14111d', couleur2: '#3a2a6a', direction: 'vertical' },
    photo: { rx: 0.5, ry: 0.43, rl: 0.86, rh: 0.42, arrondi: 0.1 },
    calques: [
      texteModele('GRANDE\nNOUVELLE', 0.5, 0.12, { taille: 0.14, police: 'luckiest-guy', couleur: '#f4d35e', contour: { actif: true, couleur: '#14111d', epaisseur: 0.07 } }),
      texteModele('Écris ton message ici', 0.5, 0.75, { taille: 0.075, bandeau: { actif: true, couleur: '#a777ff', opacite: 0.95 } }),
      texteModele('@ton_nom', 0.5, 0.9, { taille: 0.055, couleur: '#d6c2ff', gras: false })
    ]
  },
  {
    id: 'youtube', nom: 'Miniature YouTube', taille: [1280, 720],
    fond: { mode: 'degrade', couleur: '#e4572e', couleur2: '#f4d35e', direction: 'horizontal' },
    photo: { rx: 0.73, ry: 0.5, rl: 0.5, rh: 0.92, arrondi: 0.08 },
    calques: [
      texteModele('TITRE\nACCROCHEUR', 0.27, 0.42, { taille: 0.13, police: 'luckiest-guy', alignement: 'gauche', contour: { actif: true, couleur: '#14111d', epaisseur: 0.1 } }),
      formeModele('fleche', 0.47, 0.8, 0.2, 0.12, { couleur: '#ffffff', trait: '#14111d', epaisseur: 0.08, rotation: -20 })
    ]
  },
  {
    id: 'souvenir', nom: 'Souvenir', taille: [2048, 1365],
    fond: { mode: 'couleur', couleur: '#ffffff' },
    photo: { rx: 0.5, ry: 0.44, rl: 0.92, rh: 0.76, arrondi: 0 },
    calques: [
      texteModele('Souvenir de vacances', 0.5, 0.91, { taille: 0.075, police: 'coming-soon', couleur: '#3d2c5a', gras: false })
    ]
  },
  {
    id: 'citation', nom: 'Citation', taille: [2048, 2048],
    fond: { mode: 'degrade', couleur: '#cfe3ec', couleur2: '#e9e4f2', direction: 'diagonale' },
    photo: null,
    calques: [
      texteModele('« Le bonheur est fait\nde petites choses. »', 0.5, 0.45, { taille: 0.075, police: 'roboto-slab', couleur: '#2a2440' }),
      texteModele('— Ton nom', 0.5, 0.7, { taille: 0.065, police: 'satisfy', couleur: '#5a4a6e', gras: false }),
      formeModele('rectangle', 0.5, 0.6, 0.18, 0.006, { couleur: '#a777ff', arrondi: 1 })
    ]
  }
];

const Modeles = {
  _choisi: null,

  /* Les calques d'un modèle, en pixels, pour une image L × H.
     « photoId » : la photo déjà préparée (ou null : un emplacement). */
  calques(modele, L, H, photo) {
    const petit = Math.min(L, H);
    const base = { echelle: 1, miroirH: false, miroirV: false, opacite: 1, visible: true, verrouille: false };
    const liste = [];
    const f = modele.fond;
    liste.push(Object.assign({}, base, {
      id: nouvelId('c'), type: 'fond', nom: 'Nouveau fond', mode: f.mode, couleur: f.couleur, couleur2: f.couleur2 || '#a777ff',
      direction: f.direction || 'vertical', x: L / 2, y: H / 2, largeur: L, hauteur: H, rotation: 0, verrouille: true
    }));
    if (modele.photo) {
      const z = modele.photo;
      const l = Math.round(z.rl * (z.rond ? petit : L)), h = Math.round(z.rh * (z.rond ? petit : H));
      if (photo) {
        liste.push(Object.assign({}, base, { id: nouvelId('c'), type: 'image', nom: 'Photo', ressource: photo, largeur: l, hauteur: h, x: z.rx * L, y: z.ry * H, rotation: 0 }));
      } else {
        // Sans photo : une forme claire marque l'emplacement
        liste.push(Object.assign({}, base, {
          id: nouvelId('c'), type: 'forme', nom: 'Emplacement photo', forme: z.rond ? 'rond' : 'rectangle',
          x: z.rx * L, y: z.ry * H, largeur: l, hauteur: h, rotation: 0,
          remplissage: { actif: true, couleur: '#d9d4e6' }, trait: { actif: false, couleur: '#ffffff', epaisseur: 0.04 },
          arrondi: z.arrondi || 0, bord: 0.04
        }));
      }
    }
    for (const m of modele.calques) {
      const c = Object.assign({}, base, JSON.parse(JSON.stringify(m)), { id: nouvelId('c'), x: m.rx * L, y: m.ry * H });
      delete c.rx; delete c.ry;
      if (c.type === 'texte') {
        c.nom = 'Texte';
        c.taille = Math.max(8, Math.round(m.taille * petit));
        // Un texte trop large pour l'image (police plus large que prévu…)
        // est réduit, puis gardé dans l'image avec une petite marge.
        const largeur = Rendu.mesurerTexte(c).largeur;
        if (largeur > L * 0.94) c.taille = Math.max(8, Math.floor(c.taille * (L * 0.94) / largeur));
        const demi = Rendu.mesurerTexte(c).largeur / 2;
        c.x = limiter(c.x, Math.min(L / 2, demi + L * 0.03), Math.max(L / 2, L - demi - L * 0.03));
      } else if (c.type === 'forme') {
        c.nom = 'Forme';
        if (c.forme === 'cadre') { c.largeur = L; c.hauteur = H; c.x = L / 2; c.y = H / 2; }
        else { c.largeur = Math.max(4, m.rl * L); c.hauteur = Math.max(2, m.rh * (m.forme === 'etoile' || m.forme === 'coeur' ? L : H)); }
        delete c.rl; delete c.rh;
      }
      liste.push(c);
    }
    return liste;
  },

  /* La photo choisie, recadrée pour remplir la zone (coins ronds, ou en rond). */
  _preparerPhoto(modele, image, largeurImage, hauteurImage) {
    const [L, H] = modele.taille;
    const z = modele.photo;
    const petit = Math.min(L, H);
    const l = Math.round(z.rl * (z.rond ? petit : L)), h = Math.round(z.rh * (z.rond ? petit : H));
    const { toile, ctx } = nouvelleToile(l, h);
    ctx.beginPath();
    if (z.rond) ctx.ellipse(l / 2, h / 2, l / 2, h / 2, 0, 0, Math.PI * 2);
    else ctx.roundRect(0, 0, l, h, (z.arrondi || 0) * Math.min(l, h) / 2);
    ctx.clip();
    const e = Math.max(l / largeurImage, h / hauteurImage);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, (l - largeurImage * e) / 2, (h - hauteurImage * e) / 2, largeurImage * e, hauteurImage * e);
    return Ressources.depuisToile(toile);
  },

  /* La fenêtre des modèles, avec un petit aperçu de chacun. */
  ouvrir() {
    const zone = $('#liste-modeles');
    if (!zone.children.length) {
      for (const m of MODELES) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'carte-modele';
        b.dataset.action = 'modele-choisir';
        b.dataset.id = m.id;
        const toile = document.createElement('canvas');
        toile.className = 'apercu-modele';
        const f = 150 / Math.max(m.taille[0], m.taille[1]);
        toile.width = Math.round(m.taille[0] * f);
        toile.height = Math.round(m.taille[1] * f);
        const nom = document.createElement('span');
        nom.textContent = m.nom;
        b.append(toile, nom);
        zone.append(b);
      }
    }
    $('#modele-etape-photo').hidden = true;
    $('#liste-modeles').hidden = false;
    $('#fenetre-modeles').showModal();
    // Les aperçus sont dessinés une fois les polices prêtes
    Polices.pret.then(() => {
      for (const toile of $$('#liste-modeles canvas')) {
        const m = MODELES.find((x) => x.id === toile.parentElement.dataset.id);
        const ctx = toile.getContext('2d');
        const f = toile.width / m.taille[0];
        ctx.setTransform(f, 0, 0, f, 0, 0);
        Rendu.dessinerMontage(ctx, { largeur: m.taille[0], hauteur: m.taille[1], calques: this.calques(m, m.taille[0], m.taille[1], null) }, { ecran: false });
      }
    });
  },

  /* Un modèle est choisi : avec une zone photo, on propose d'en ajouter une. */
  choisir(id) {
    this._choisi = MODELES.find((m) => m.id === id) || null;
    if (!this._choisi) return;
    if (!this._choisi.photo) { $('#fenetre-modeles').close(); this.creer(null); return; }
    $('#modele-nom').textContent = this._choisi.nom;
    $('#liste-modeles').hidden = true;
    $('#modele-etape-photo').hidden = false;
  },

  /* Crée le montage (avec la photo « fichier », ou sans photo). */
  async creer(fichier) {
    const m = this._choisi;
    if (!m) return;
    if ($('#fenetre-modeles').open) $('#fenetre-modeles').close();
    Patience.montrer('Préparation du modèle…');
    await laisserAfficher();
    let photo = null;
    try {
      await Accueil._rangerCourant();
      if (fichier) {
        const r = await decoderImage(fichier, 2048);
        photo = this._preparerPhoto(m, r.image, r.largeur, r.hauteur);
        if (r.image.close) r.image.close(); else r.image.width = 0;
      }
      const [L, H] = m.taille;
      Montage.nouveau(L, H);
      Montage.nom = m.nom + ' — ' + nomParDefaut().replace(/^Montage du /, '');
      Montage.doc.calques.push(...this.calques(m, L, H, photo));
      Montage.selection = null;
      Montage.signaler();
      Historique.vider();
      Historique.nettoyer();
      Sauvegarde.programmer();
      allerVers('editeur');
      Message.montrer(photo || !m.photo
        ? 'Modèle prêt ✓ Touche un texte pour le choisir, puis « Modifier le texte ».'
        : 'Modèle prêt ✓ La zone claire marque la place de la photo : ajoute-la avec « Image ». Touche un texte pour le modifier.');
    } catch (e) {
      console.warn(e);
      Message.erreur(e instanceof ErreurPhoto ? e.message : MESSAGES_PHOTO.memoire);
    } finally {
      Patience.cacher();
    }
  }
};
