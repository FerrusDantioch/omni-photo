/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   Les panneaux de réglage de l'éditeur :
   - le panneau du calque choisi (taille, rotation, opacité, ordre…) ;
   - la fenêtre « Calques » (la liste de tous les calques) ;
   - la fenêtre « Texte » (écrire, police, couleur, contour, ombre…).
   ============================================================ */
'use strict';

/* Couleurs proposées d'un seul toucher (en plus du choix libre). */
const NUANCIER = ['#ffffff', '#1b1726', '#f4d35e', '#f28f3b', '#e4572e', '#f7a1c4', '#a777ff', '#4ea8de', '#76c893', '#8d6e63'];

const Panneaux = {
  _texteOuvert: null,     // numéro du calque texte en cours de modification

  initialiser() {
    Montage.ecouter(() => this.majPanneau());

    // --- Curseurs du calque choisi ---
    // « input » : pendant qu'on bouge le curseur ; « change » : quand on le lâche.
    // Tout le mouvement du curseur = une seule étape d'« Annuler ».
    const curseur = (id, appliquer) => {
      const el = $(id);
      el.addEventListener('input', () => {
        const c = Montage.calqueChoisi();
        if (!c) return;
        Historique.debut();
        appliquer(c, Number(el.value));
        this._majSortie(el);
      });
      el.addEventListener('change', () => Historique.fin());
    };
    curseur('#r-taille', (c, v) => {
      const { largeur } = Rendu.tailleCalque(c);
      Montage.modifier(c.id, { echelle: (v / 100) * Montage.doc.largeur / largeur });
    });
    curseur('#r-rotation', (c, v) => Montage.modifier(c.id, { rotation: v }));
    curseur('#r-opacite', (c, v) => Montage.modifier(c.id, { opacite: v / 100 }));

    this._preparerFenetreTexte();
    $('#fenetre-calques').addEventListener('close', () => Historique.fin());
  },

  /* Affiche le panneau qui convient : outils généraux, ou réglages du
     calque choisi. Appelé après chaque changement du montage. */
  majPanneau() {
    if (!Montage.doc) return;
    const c = Montage.calqueChoisi();
    $('#outils-generaux').hidden = !!c;
    $('#outils-calque').hidden = !c;
    if (c) {
      $('#nom-calque').textContent = this.nomAffiche(c);
      $('#calque-verrouille').hidden = !c.verrouille;
      $('#reglages-calque').hidden = c.verrouille;
      $('#btn-modifier-texte').hidden = c.type !== 'texte';
      const { largeur } = Rendu.tailleCalque(c);
      this._valeur('#r-taille', Math.round((largeur * c.echelle * 100) / Montage.doc.largeur));
      this._valeur('#r-rotation', Math.round(c.rotation));
      this._valeur('#r-opacite', Math.round(c.opacite * 100));
      const i = Montage.indexDe(c.id), n = Montage.doc.calques.length;
      $('[data-action="avancer"]').disabled = i >= n - 1;
      $('[data-action="reculer"]').disabled = i <= 0;
    }
    if ($('#fenetre-calques').open) this.remplirListeCalques();
  },

  _valeur(id, v) {
    const el = $(id);
    if (document.activeElement !== el || Number(el.value) !== v) el.value = v;
    this._majSortie(el);
  },

  /* Le petit nombre affiché à côté d'un curseur (« 45 % », « 90° »). */
  _majSortie(el) {
    const sortie = el.parentElement.querySelector('output');
    if (sortie) sortie.textContent = el.value + (el.dataset.unite || '');
  },

  /* Le nom d'un calque tel qu'on le montre : pour un texte, ses premiers mots. */
  nomAffiche(c) {
    if (c.type === 'texte') {
      const debut = String(c.texte).replace(/\s+/g, ' ').trim();
      return '« ' + (debut.length > 22 ? debut.slice(0, 21) + '…' : debut || 'Texte') + ' »';
    }
    return c.nom;
  },

  /* ---------- La fenêtre « Calques » ---------- */

  ouvrirCalques() {
    Historique.debut();   // tout ce qu'on y change = une étape d'« Annuler »
    this.remplirListeCalques();
    $('#fenetre-calques').showModal();
  },

  remplirListeCalques() {
    const liste = $('#liste-calques');
    liste.textContent = '';
    const calques = Montage.doc.calques;
    if (!calques.length) {
      const vide = document.createElement('li');
      vide.className = 'aide';
      vide.textContent = 'Aucun calque pour l\'instant. Ajoute un texte ou une image.';
      liste.append(vide);
      return;
    }
    // Du plus haut (au-dessus de tout) au plus bas (le fond)
    for (let i = calques.length - 1; i >= 0; i--) {
      const c = calques[i];
      const li = document.createElement('li');
      li.className = 'ligne-calque' + (c.id === Montage.selection ? ' choisi' : '') + (c.visible ? '' : ' masque');

      const nom = document.createElement('button');
      nom.type = 'button';
      nom.className = 'bouton nom-calque';
      nom.dataset.action = 'choisir-calque';
      nom.dataset.id = c.id;
      nom.innerHTML = `<svg class="icone" aria-hidden="true"><use href="#i-${c.type === 'texte' ? 'texte' : 'image'}"/></svg>`;
      nom.append(document.createTextNode(this.nomAffiche(c) + (c.verrouille ? ' (verrouillé)' : '')));

      const actions = document.createElement('div');
      actions.className = 'actions-calque';
      const petit = (action, icone, texte, desactive) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'bouton petit';
        b.dataset.action = action;
        b.dataset.id = c.id;
        b.disabled = !!desactive;
        b.innerHTML = `<svg class="icone" aria-hidden="true"><use href="#i-${icone}"/></svg>`;
        b.append(document.createTextNode(texte));
        return b;
      };
      actions.append(
        petit('calque-monter', 'haut', 'Monter', i === calques.length - 1),
        petit('calque-descendre', 'bas', 'Descendre', i === 0),
        petit('calque-visible', c.visible ? 'oeil' : 'oeil-ferme', c.visible ? 'Masquer' : 'Afficher'),
        petit('calque-verrou', c.verrouille ? 'cadenas-ouvert' : 'cadenas', c.verrouille ? 'Déverrouiller' : 'Verrouiller')
      );
      li.append(nom, actions);
      liste.append(li);
    }
  },

  /* ---------- La fenêtre « Texte » ---------- */

  _preparerFenetreTexte() {
    // Les polices, chacune écrite dans son propre style
    const zonePolices = $('#t-polices');
    for (const p of POLICES) {
      const label = document.createElement('label');
      label.className = 'choix-police';
      label.innerHTML = `<input type="radio" name="t-police" value="${p.id}"><span style='font-family:${p.famille}'>${p.nom}</span>`;
      zonePolices.append(label);
    }
    // Les nuanciers (couleurs d'un toucher)
    for (const zone of $$('.nuancier')) {
      for (const couleur of NUANCIER) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pastille';
        b.style.background = couleur;
        b.dataset.couleur = couleur;
        b.setAttribute('aria-label', 'Couleur ' + couleur);
        b.addEventListener('click', () => {
          const champ = $('#' + zone.dataset.cible);
          champ.value = couleur;
          champ.dispatchEvent(new Event('input', { bubbles: true }));
        });
        zone.append(b);
      }
    }

    const fenetre = $('#fenetre-texte');
    // Chaque changement est visible tout de suite sur la photo
    fenetre.addEventListener('input', () => this._appliquerTexte());
    fenetre.addEventListener('change', () => this._appliquerTexte());
    fenetre.addEventListener('close', () => this._fermerTexte());
  },

  /* Ouvre la fenêtre pour le calque texte « id ». */
  ouvrirTexte(id) {
    const c = Montage.calque(id);
    if (!c || c.type !== 'texte') return;
    this._texteOuvert = id;
    Historique.debut();

    $('#t-texte').value = c.texte;
    const radio = $(`input[name="t-police"][value="${c.police}"]`) || $('input[name="t-police"]');
    radio.checked = true;
    const cote = Math.min(Montage.doc.largeur, Montage.doc.hauteur);
    this._valeur('#t-taille', Math.round((c.taille * c.echelle * 1000) / cote) / 10);
    $('#t-couleur').value = c.couleur;
    $('#t-gras').checked = c.gras;
    ($(`input[name="t-align"][value="${c.alignement}"]`) || {}).checked = true;
    $('#t-contour').checked = c.contour.actif;
    $('#t-contour-couleur').value = c.contour.couleur;
    this._valeur('#t-contour-epaisseur', Math.round(c.contour.epaisseur * 100));
    $('#t-ombre').checked = c.ombre.actif;
    $('#t-ombre-couleur').value = c.ombre.couleur;
    this._valeur('#t-ombre-flou', Math.round(c.ombre.flou * 100));
    this._valeur('#t-ombre-distance', Math.round(c.ombre.distance * 100));
    this._majZonesTexte();

    const fenetre = $('#fenetre-texte');
    if (!fenetre.open) fenetre.showModal();
    // Nouveau texte : le clavier s'ouvre, et « Ton texte » est tout
    // sélectionné pour être remplacé directement. Pour un texte existant,
    // pas de clavier d'office : on veut peut-être seulement changer la couleur.
    const zone = $('#t-texte');
    if (c.texte === 'Ton texte') { zone.focus(); zone.select(); }
    else $('#titre-texte').focus();
  },

  /* Grise les réglages du contour et de l'ombre quand ils sont désactivés. */
  _majZonesTexte() {
    $('#zone-contour').classList.toggle('inactif', !$('#t-contour').checked);
    $('#zone-ombre').classList.toggle('inactif', !$('#t-ombre').checked);
  },

  _appliquerTexte() {
    const c = Montage.calque(this._texteOuvert);
    if (!c) return;
    for (const el of $$('#fenetre-texte input[type="range"]')) this._majSortie(el);
    this._majZonesTexte();
    const police = ($('input[name="t-police"]:checked') || {}).value || 'simple';
    const cote = Math.min(Montage.doc.largeur, Montage.doc.hauteur);
    const tailleVoulue = (Number($('#t-taille').value) / 100) * cote;
    Montage.modifier(c.id, {
      texte: $('#t-texte').value,
      police,
      couleur: $('#t-couleur').value,
      gras: $('#t-gras').checked,
      alignement: ($('input[name="t-align"]:checked') || {}).value || 'centre',
      echelle: tailleVoulue / c.taille,
      contour: { actif: $('#t-contour').checked, couleur: $('#t-contour-couleur').value, epaisseur: Number($('#t-contour-epaisseur').value) / 100 },
      ombre: {
        actif: $('#t-ombre').checked, couleur: $('#t-ombre-couleur').value,
        flou: Number($('#t-ombre-flou').value) / 100, distance: Number($('#t-ombre-distance').value) / 100
      }
    });
  },

  _fermerTexte() {
    const c = Montage.calque(this._texteOuvert);
    this._texteOuvert = null;
    // Un texte laissé vide disparaît
    if (c && !String(c.texte).trim()) {
      Montage.supprimer(c.id);
      Message.montrer('Le texte vide a été retiré.');
    }
    Historique.fin();
  }
};
