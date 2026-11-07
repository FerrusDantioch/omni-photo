/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   L'accueil : « Mes montages » (ouvrir, renommer, enregistrer en
   fichier, supprimer), et le début d'un nouveau montage (photo de la
   galerie, appareil photo, toile vide, fichier .omniphoto).
   ============================================================ */
'use strict';

const Accueil = {
  _urls: [],        // adresses des miniatures (libérées à chaque mise à jour)
  _renomme: null,

  /* Remplit la liste « Mes montages ». */
  async majListe() {
    // La liste s'affiche tout de suite, puis encore une fois quand le
    // montage ouvert a fini d'être sauvegardé (sa miniature est alors à jour).
    const tour = ++this._tour;
    await this._afficherListe(tour);
    if (Montage.doc) {
      await Sauvegarde.maintenant();
      await this._afficherListe(tour);
    }
  },
  _tour: 0,

  async _afficherListe(tour) {
    const liste = await Sauvegarde.liste();
    if (tour !== this._tour) return;   // une mise à jour plus récente est en route
    for (const u of this._urls) URL.revokeObjectURL(u);
    this._urls = [];
    const ul = $('#liste-montages');
    ul.textContent = '';
    $('#bloc-montages').hidden = !liste.length;
    for (const m of liste) {
      const li = document.createElement('li');
      li.className = 'carte-montage';
      const ouvrir = document.createElement('button');
      ouvrir.type = 'button';
      ouvrir.className = 'ouvrir-montage';
      ouvrir.dataset.action = 'montage-ouvrir';
      ouvrir.dataset.id = m.id;
      const vignette = document.createElement(m.miniature ? 'img' : 'span');
      vignette.className = 'vignette';
      if (m.miniature) {
        const u = URL.createObjectURL(m.miniature);
        this._urls.push(u);
        vignette.src = u;
        vignette.alt = '';
      }
      const textes = document.createElement('span');
      textes.className = 'textes-montage';
      const nom = document.createElement('strong');
      nom.textContent = m.nom;
      const date = document.createElement('small');
      date.textContent = 'Modifié le ' + new Date(m.date).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
      textes.append(nom, date);
      ouvrir.append(vignette, textes);

      const actions = document.createElement('div');
      actions.className = 'actions-calque';
      const petit = (action, icone, texte, classe = '') => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'bouton petit ' + classe;
        b.dataset.action = action;
        b.dataset.id = m.id;
        b.innerHTML = `<svg class="icone" aria-hidden="true"><use href="#i-${icone}"/></svg>`;
        b.append(document.createTextNode(texte));
        return b;
      };
      actions.append(
        petit('montage-renommer', 'texte', 'Renommer'),
        petit('montage-fichier', 'export', 'Fichier'),
        petit('montage-supprimer', 'poubelle', 'Supprimer', 'danger')
      );
      li.append(ouvrir, actions);
      ul.append(li);
    }
    const octets = await Sauvegarde.place();
    $('#place-montages').textContent = liste.length
      ? `${liste.length} montage${liste.length > 1 ? 's' : ''}, ${nombre(Math.max(1, octets / 1048576))} Mo dans le téléphone.`
      : '';
  },

  /* Avant d'ouvrir ou de commencer un autre montage : celui qui est
     ouvert est sauvegardé, puis la mémoire est libérée. */
  async _rangerCourant() {
    if (Montage.doc) await Sauvegarde.maintenant();
    Montage.doc = null;
    Montage.id = null;
    Ressources.vider();
    Historique.vider();
  },

  /* Une photo vient d'être choisie (galerie ou appareil photo). */
  async ouvrirPhoto(fichier) {
    if (!fichier) return;
    Patience.montrer('Ouverture de ta photo…');
    await laisserAfficher();
    try {
      await this._rangerCourant();
      const r = await Ressources.depuisFichier(fichier, LIMITES.photo);
      Montage.nouveau(r.largeur, r.hauteur);
      Montage.ajouterImage(r.id, r.largeur, r.hauteur, { nom: 'Photo', remplir: true, verrouille: true });
      Historique.vider();
      Historique.nettoyer();
      Sauvegarde.programmer();
      allerVers('editeur');
      if (r.reduite) {
        Message.montrer(`Ta photo est très grande (${nombre(r.origLargeur)} × ${nombre(r.origHauteur)} pixels) : elle a été ` +
          `réduite à ${nombre(r.largeur)} × ${nombre(r.hauteur)} pour rester fluide. La qualité reste très bonne.`);
      }
    } catch (e) {
      console.warn(e);
      Message.erreur(e instanceof ErreurPhoto ? e.message : MESSAGES_PHOTO.lecture);
      this.majListe();
    } finally {
      Patience.cacher();
    }
  },

  /* Une toile vide, au format choisi. */
  async ouvrirToile(largeur, hauteur, fond) {
    await this._rangerCourant();
    Montage.nouveau(largeur, hauteur);
    if (fond === 'blanc') {
      const { toile, ctx } = nouvelleToile(largeur, hauteur);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, largeur, hauteur);
      const id = Ressources.depuisToile(toile);
      Montage.ajouterImage(id, largeur, hauteur, { nom: 'Fond blanc', remplir: true, verrouille: true });
    }
    Historique.vider();
    Historique.nettoyer();
    Sauvegarde.programmer();
    allerVers('editeur');
  },

  async ouvrirMontage(id) {
    // Le montage est encore ouvert (simple retour à l'accueil) : on y
    // retourne directement, « Annuler » garde toutes ses étapes.
    if (Montage.doc && Montage.id === id) { allerVers('editeur'); return; }
    Patience.montrer('Ouverture de ton montage…');
    await laisserAfficher();
    try {
      await this._rangerCourant();
      const perdues = await Sauvegarde.ouvrir(id);
      allerVers('editeur');
      if (perdues) Message.erreur(`${perdues} image(s) de ce montage n'ont pas pu être retrouvées. Le reste est là.`);
    } catch (e) {
      console.warn(e);
      Message.erreur(e instanceof ErreurPhoto ? e.message
        : 'Omni-Photo n\'a pas réussi à rouvrir ce montage. Tu peux en ouvrir un autre, ou commencer une nouvelle photo.');
      this.majListe();
    } finally {
      Patience.cacher();
    }
  },

  /* ---------- Renommer ---------- */

  renommer(id) {
    this._renomme = id;
    const carte = $(`.ouvrir-montage[data-id="${id}"] strong`);
    $('#nom-montage').value = carte ? carte.textContent : '';
    $('#fenetre-nom').showModal();
    $('#nom-montage').select();
  },

  async validerNom() {
    const nom = $('#nom-montage').value.replace(/\s+/g, ' ').trim().slice(0, 80);
    $('#fenetre-nom').close();
    if (!nom || !this._renomme) return;
    await Sauvegarde.renommer(this._renomme, nom);
    this._renomme = null;
    this.majListe();
  },

  async supprimer(id) {
    await Sauvegarde.supprimer(id);
    this.majListe();
    Message.montrer('Montage supprimé.');
  },

  /* ---------- Fichier « .omniphoto » ---------- */

  async enregistrerFichier(id) {
    Patience.montrer('Préparation du fichier…');
    await laisserAfficher();
    try {
      const blob = await Sauvegarde.versFichier(id);
      const carte = $(`.ouvrir-montage[data-id="${id}"] strong`);
      const nom = nomDeFichierMontage(carte ? carte.textContent : 'montage');
      telechargerFichier(blob, nom);
      Message.montrer(`Fichier enregistré : ${nom}, dans « Téléchargements ». Ouvre-le sur la tablette avec « Ouvrir un fichier .omniphoto ».`);
    } catch (e) {
      console.warn(e);
      Message.erreur('Le fichier n\'a pas pu être fabriqué. Ton téléphone manque peut-être de mémoire ; réessaie.');
    } finally {
      Patience.cacher();
    }
  },

  /* Tous les montages dans un seul fichier. */
  async enregistrerTout() {
    Patience.montrer('Préparation du fichier…');
    await laisserAfficher();
    try {
      const blob = await Sauvegarde.versFichierTout();
      const d = new Date();
      const nom = `omni-photo-tous-mes-montages-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.omniphoto`;
      telechargerFichier(blob, nom);
      Message.montrer(`Sauvegarde enregistrée : ${nom}, dans « Téléchargements » (${nombre(blob.size / 1048576)} Mo). Garde-la en lieu sûr ; « Ouvrir un fichier .omniphoto » remet tous tes montages.`);
    } catch (e) {
      console.warn(e);
      Message.erreur('La sauvegarde n\'a pas pu être fabriquée. Ton téléphone manque peut-être de mémoire ; réessaie.');
    } finally {
      Patience.cacher();
    }
  },

  async importerFichier(fichier) {
    if (!fichier) return;
    Patience.montrer('Ouverture du fichier…');
    await laisserAfficher();
    try {
      const ids = await Sauvegarde.depuisFichier(fichier);
      await this.majListe();
      Message.montrer(ids.length > 1 ? `${ids.length} montages ajoutés à « Mes montages » ✓` : 'Montage ajouté à « Mes montages » ✓');
      return ids;
    } catch (e) {
      console.warn(e);
      Message.erreur(e.message && /omniphoto|Omni-Photo/i.test(e.message) ? e.message
        : 'Ce fichier n\'a pas pu être ouvert. Ce doit être un fichier « .omniphoto » fabriqué par Omni-Photo.');
    } finally {
      Patience.cacher();
    }
  }
};

/* Enregistre un fichier dans le téléphone (dossier « Téléchargements »). */
function telechargerFichier(blob, nom) {
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* « Vacances à la mer » → « omni-photo-vacances-a-la-mer.omniphoto »
   (sans accent : certains téléphones remplacent sinon le nom). */
function nomDeFichierMontage(nom) {
  const simple = String(nom).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'montage';
  return `omni-photo-${simple}.omniphoto`;
}
