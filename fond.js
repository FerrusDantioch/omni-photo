/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   Le nouvel arrière-plan : une couleur unie, un dégradé ou une photo
   de la galerie, posé SOUS tous les autres calques (sous le sujet
   détouré).

   C'est un calque spécial, de type « fond » :
     mode : 'couleur' | 'degrade' | 'photo'
     couleur, couleur2, direction ('vertical' | 'horizontal' |
     'diagonale' | 'rond'), et pour une photo : ressource, largeur, hauteur.
   Il remplit toujours toute l'image (la photo est agrandie pour couvrir
   sans se déformer). On ne le déplace pas au doigt : c'est le sujet,
   au-dessus, qu'on déplace et qu'on agrandit.
   ============================================================ */
'use strict';

const Fond = {
  /* Le calque de fond, s'il y en a un. */
  calque() {
    return Montage.doc ? Montage.doc.calques.find((c) => c.type === 'fond') || null : null;
  },

  /* Ouvre la fenêtre « Nouveau fond » (crée le fond s'il n'existe pas). */
  ouvrir() {
    if (!Montage.doc) return;
    if (!Retouche.verifierLibre()) return;
    Historique.debut();   // tout ce qu'on règle dans la fenêtre = une étape d'« Annuler »
    let c = this.calque();
    if (!c) {
      c = {
        id: nouvelId('c'), type: 'fond', nom: 'Nouveau fond',
        mode: 'couleur', couleur: '#cfe3ec', couleur2: '#a777ff', direction: 'vertical',
        x: Montage.doc.largeur / 2, y: Montage.doc.hauteur / 2, largeur: Montage.doc.largeur, hauteur: Montage.doc.hauteur,
        echelle: 1, rotation: 0, miroirH: false, miroirV: false, opacite: 1, visible: true, verrouille: true
      };
      Montage.doc.calques.unshift(c);   // tout en bas
    }
    this._remplir(c);
    // Aucun sujet détouré : le nouveau fond serait caché derrière la photo
    const detoure = Montage.doc.calques.some((x) => x.type === 'image' && x.source);
    $('#b-conseil').hidden = detoure;
    Montage.choisir(null);
    $('#fenetre-fond').showModal();
    this._libererSujet();
  },

  _remplir(c) {
    ($(`input[name="b-mode"][value="${c.mode}"]`) || {}).checked = true;
    $('#b-couleur').value = c.couleur;
    $('#b-couleur2').value = c.couleur2;
    ($(`input[name="b-direction"][value="${c.direction}"]`) || {}).checked = true;
    this._majZones();
  },

  _majZones() {
    const mode = ($('input[name="b-mode"]:checked') || {}).value;
    $('#b-zone-couleur2').hidden = mode !== 'degrade';
    $('#b-zone-direction').hidden = mode !== 'degrade';
    $('#b-zone-couleur').hidden = mode === 'photo';
    $('#b-zone-photo').hidden = mode !== 'photo';
    const c = this.calque();
    $('#b-photo-etat').textContent = c && c.ressource ? 'Photo choisie ✓ Tu peux en choisir une autre.' : 'Aucune photo choisie pour l\'instant.';
  },

  /* Chaque réglage de la fenêtre est visible tout de suite. */
  appliquer() {
    const c = this.calque();
    if (!c) return;
    let mode = ($('input[name="b-mode"]:checked') || {}).value || 'couleur';
    // « Photo » sans photo choisie : on garde la couleur en attendant
    Montage.modifier(c.id, {
      mode,
      couleur: $('#b-couleur').value,
      couleur2: $('#b-couleur2').value,
      direction: ($('input[name="b-direction"]:checked') || {}).value || 'vertical'
    });
    this._majZones();
  },

  /* Une photo de la galerie comme fond. */
  async choisirPhoto(fichier) {
    const c = this.calque();
    if (!fichier || !c) return;
    Patience.montrer('Ouverture de la photo…');
    await laisserAfficher();
    try {
      const r = await Ressources.depuisFichier(fichier, LIMITES.photo);
      Montage.modifier(c.id, { mode: 'photo', ressource: r.id, largeurPhoto: r.largeur, hauteurPhoto: r.hauteur });
      ($('input[name="b-mode"][value="photo"]') || {}).checked = true;
      this._majZones();
    } catch (e) {
      console.warn(e);
      $('#fenetre-fond').close();
      Message.erreur(e instanceof ErreurPhoto ? e.message : MESSAGES_PHOTO.lecture);
    } finally {
      Patience.cacher();
    }
  },

  /* « Retirer le fond » : le calque de fond disparaît. */
  retirer() {
    const c = this.calque();
    if (c) Montage.supprimer(c.id);
    $('#fenetre-fond').close();
  },

  /* À la fermeture : une seule étape d'« Annuler ». Le sujet détouré
     est choisi, pour qu'on puisse le placer sur son nouveau fond. */
  fermer() {
    const c = this.calque();
    if (c && c.mode === 'photo' && !c.ressource) Montage.modifier(c.id, { mode: 'couleur' });
    Historique.fin();
    const sujet = [...Montage.doc.calques].reverse().find((x) => x.type === 'image' && x.source && x.visible);
    if (c && sujet) {
      Montage.choisir(sujet.id);
      Message.montrer('Fais glisser le sujet pour le placer, pince pour l\'agrandir ou le réduire.');
    }
  },

  /* Le sujet détouré (souvent la photo de départ, verrouillée) devient
     déplaçable. */
  _libererSujet() {
    for (const x of Montage.doc.calques) {
      if (x.type === 'image' && x.source && x.verrouille) x.verrouille = false;
    }
    Montage.signaler();
  }
};

/* Le dessin d'un calque de fond (appelé par Rendu.dessinerCalque). */
function dessinerFond(ctx, c, doc, options) {
  const L = doc.largeur, H = doc.hauteur;
  if (c.mode === 'photo' && c.ressource) {
    const r = Ressources.obtenir(c.ressource);
    if (r) {
      // « Couvrir » : la photo remplit tout, sans se déformer (les bords
      // qui dépassent sont coupés), centrée.
      const e = Math.max(L / r.largeur, H / r.hauteur);
      const l = r.largeur * e, h = r.hauteur * e;
      const image = options.ecran ? Ressources.pourEcran(c.ressource, l * (options.zoom || 1)) : r.image;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, (L - l) / 2, (H - h) / 2, l, h);
      return;
    }
  }
  if (c.mode === 'degrade') {
    let g;
    if (c.direction === 'horizontal') g = ctx.createLinearGradient(0, 0, L, 0);
    else if (c.direction === 'diagonale') g = ctx.createLinearGradient(0, 0, L, H);
    else if (c.direction === 'rond') g = ctx.createRadialGradient(L / 2, H / 2, 0, L / 2, H / 2, Math.hypot(L, H) / 2);
    else g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, c.couleur);
    g.addColorStop(1, c.couleur2);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = c.couleur;
  }
  ctx.fillRect(0, 0, L, H);
}
