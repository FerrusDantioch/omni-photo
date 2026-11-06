/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   Les images du montage (« ressources »).

   Chaque photo ou image importée est ouverte UNE fois, puis rangée ici
   sous un numéro (par exemple « r…-1 »). Les calques ne contiennent que
   ce numéro : c'est léger, et c'est ce qui permet à « Annuler » de garder
   30 états du montage sans saturer la mémoire du téléphone.

   Une ressource n'est jamais modifiée : une retouche (étapes 2 et 3)
   fabriquera une NOUVELLE ressource. Ainsi, « Annuler » n'a qu'à
   remettre l'ancien numéro.

   Ce fichier s'occupe aussi d'ouvrir les photos en toute sécurité :
   format non pris en charge, photo énorme, manque de mémoire.
   ============================================================ */
'use strict';

/* Tailles maximales, en pixels (côté le plus long).
   Une photo de 4 096 pixels de côté pèse environ 64 Mo dans la mémoire
   du téléphone : c'est déjà beaucoup pour un téléphone milieu de gamme.
   Au-delà, on réduit (la qualité reste très bonne pour un écran, un
   partage ou une impression jusqu'au format A4). */
const LIMITES = {
  photo: 4096,            // la photo de départ (taille du montage)
  calque: 2048,           // une image ajoutée par-dessus
  octetsMax: 200 * 1024 * 1024,   // fichier de plus de 200 Mo : refusé
  pixelsMax: 270e6        // plus de 270 millions de pixels : refusé
};

/* Une erreur « compréhensible » : son message est écrit pour la personne,
   en français, et peut être affiché tel quel. */
class ErreurPhoto extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const MESSAGES_PHOTO = {
  vide: 'Ce fichier est vide. Choisis une autre photo.',
  format: 'Ce format d\'image n\'est pas pris en charge. Omni-Photo ouvre les photos JPG, PNG, WebP, GIF et BMP. ' +
          'Si ta photo est en HEIC, règle l\'appareil photo du téléphone sur « JPG », ou partage-la d\'abord en JPG.',
  heic: 'Cette photo est au format HEIC, que le navigateur ne sait pas ouvrir. Dans les réglages de l\'appareil photo, ' +
        'choisis le format JPG (ou « Plus compatible »), puis réessaie. Ta photo n\'a pas été modifiée.',
  lourde: 'Cette image est trop lourde pour être ouverte sur un téléphone (plus de 200 Mo). Choisis une image plus légère.',
  geante: 'Cette image est trop grande pour être ouverte sur un téléphone. Choisis une image plus petite.',
  memoire: 'Ton téléphone manque de mémoire pour ouvrir cette photo. Ferme quelques applications puis réessaie, ' +
           'ou choisis une photo plus petite. Rien n\'a été perdu.',
  lecture: 'Omni-Photo n\'a pas réussi à lire ce fichier. Il est peut-être abîmé ou encore en cours de téléchargement. ' +
           'Réessaie, ou choisis une autre photo.'
};

function erreurPhoto(code) {
  return new ErreurPhoto(code, MESSAGES_PHOTO[code]);
}

/* Le fichier ressemble-t-il à une photo HEIC/HEIF (format d'iPhone et de
   certains Android) ? On regarde le nom, le type, puis les premiers octets. */
async function estHeic(fichier) {
  if (/hei[cf]/i.test(fichier.type) || /\.hei[cf]$/i.test(fichier.name || '')) return true;
  try {
    const debut = new Uint8Array(await fichier.slice(0, 16).arrayBuffer());
    const texte = String.fromCharCode(...debut.slice(4, 12));
    return /^ftyp(heic|heix|hevc|heim|heis|mif1|msf1)/.test(texte);
  } catch (e) {
    return false;
  }
}

/* Charge le fichier dans une balise <img> pour connaître ses dimensions.
   Le navigateur tient compte du sens de la photo (portrait / paysage)
   enregistré par l'appareil photo. */
function chargerBalise(url) {
  return new Promise((reussir, rater) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => reussir(img);
    img.onerror = () => rater(new Error('format'));
    img.src = url;
  });
}

/* Fabrique une toile de dessin. Sur un téléphone à court de mémoire, le
   navigateur peut refuser : on le dit clairement. */
function nouvelleToile(largeur, hauteur) {
  const toile = document.createElement('canvas');
  toile.width = largeur;
  toile.height = hauteur;
  const ctx = toile.getContext('2d');
  if (!ctx || toile.width !== largeur || toile.height !== hauteur) throw erreurPhoto('memoire');
  return { toile, ctx };
}

/* Réduit une image en plusieurs fois (moitié par moitié) : c'est plus
   joli qu'une seule grosse réduction, qui rend l'image granuleuse. */
function reduireParEtapes(source, largeurSource, hauteurSource, largeur, hauteur) {
  let actuelle = source, l = largeurSource, h = hauteurSource;
  while (l / 2 >= largeur && h / 2 >= hauteur) {
    const nl = Math.round(l / 2), nh = Math.round(h / 2);
    const { toile, ctx } = nouvelleToile(nl, nh);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(actuelle, 0, 0, nl, nh);
    if (actuelle !== source && actuelle.width) actuelle.width = 0;   // libère la mémoire
    actuelle = toile; l = nl; h = nh;
  }
  const { toile, ctx } = nouvelleToile(largeur, hauteur);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(actuelle, 0, 0, largeur, hauteur);
  if (actuelle !== source && actuelle.width) actuelle.width = 0;
  return toile;
}

/* Ouvre une image (fichier ou Blob) et la réduit si elle dépasse
   « maxCote » pixels. Renvoie { image, largeur, hauteur, origLargeur,
   origHauteur, reduite }. En cas de souci : une ErreurPhoto. */
async function decoderImage(fichier, maxCote) {
  if (!fichier || fichier.size === 0) throw erreurPhoto('vide');
  if (fichier.size > LIMITES.octetsMax) throw erreurPhoto('lourde');

  const url = URL.createObjectURL(fichier);
  let img;
  try {
    try {
      img = await avecDelai(chargerBalise(url), 60000);
    } catch (e) {
      throw erreurPhoto((await estHeic(fichier)) ? 'heic' : (e.message === 'delai' ? 'lecture' : 'format'));
    }
    const ol = img.naturalWidth, oh = img.naturalHeight;
    if (!ol || !oh) throw erreurPhoto('format');
    if (ol * oh > LIMITES.pixelsMax) throw erreurPhoto('geante');

    // Taille de travail : on garde les proportions
    const facteur = Math.min(1, maxCote / Math.max(ol, oh));
    const largeur = Math.max(1, Math.round(ol * facteur));
    const hauteur = Math.max(1, Math.round(oh * facteur));

    let image = null;

    // 1er essai : « createImageBitmap », la méthode la plus économe du navigateur
    if (typeof createImageBitmap === 'function') {
      try {
        const options = facteur < 1
          ? { resizeWidth: largeur, resizeHeight: hauteur, resizeQuality: 'high' }
          : {};
        const bitmap = await createImageBitmap(fichier, options);
        // Sécurité : si le sens de la photo n'a pas été respecté (image
        // couchée), on jette ce résultat et on passe au 2e essai.
        if (bitmap.width === largeur && bitmap.height === hauteur) image = bitmap;
        else bitmap.close();
      } catch (e) { /* on passe au 2e essai */ }
    }

    // 2e essai : dessiner la balise <img> dans une toile
    if (!image) {
      try {
        if (img.decode) await img.decode();
        image = facteur < 1
          ? reduireParEtapes(img, ol, oh, largeur, hauteur)
          : reduireParEtapes(img, ol, oh, ol, oh);
      } catch (e) {
        throw (e instanceof ErreurPhoto) ? e : erreurPhoto('memoire');
      }
    }
    return { image, largeur, hauteur, origLargeur: ol, origHauteur: oh, reduite: facteur < 1 };
  } finally {
    URL.revokeObjectURL(url);
    if (img) img.src = '';
  }
}

const Ressources = {
  /* numéro → { image, largeur, hauteur, blob, maxCote, apercu } */
  _table: new Map(),

  obtenir(id) {
    return this._table.get(id) || null;
  },

  /* Ouvre un fichier image et le range. Le fichier d'origine est gardé
     (« blob ») pour la sauvegarde automatique : il suffira de le rouvrir
     de la même façon. « id » permet de redonner un numéro connu (reprise
     d'un montage sauvegardé). */
  async depuisFichier(fichier, maxCote, id) {
    const resultat = await decoderImage(fichier, maxCote);
    id = id || nouvelId('r');
    this._table.set(id, {
      image: resultat.image,
      largeur: resultat.largeur,
      hauteur: resultat.hauteur,
      blob: fichier,
      maxCote,
      apercu: null
    });
    return { id, ...resultat };
  },

  /* Range une image déjà dessinée sur une toile (retouches des étapes
     2 et 3). Pas de fichier d'origine : la sauvegarde en fabriquera un. */
  depuisToile(toile) {
    const id = nouvelId('r');
    this._table.set(id, { image: toile, largeur: toile.width, hauteur: toile.height, blob: null, maxCote: Infinity, apercu: null });
    return id;
  },

  /* Une version réduite de l'image (1 600 pixels au plus), pour
     l'affichage à l'écran : dessiner 60 fois par seconde une photo de
     4 000 pixels ralentirait un téléphone. Fabriquée une seule fois, à
     la première demande. Renvoie l'image complète tant qu'elle n'est
     pas prête. */
  pourEcran(id, largeurAffichee) {
    const r = this._table.get(id);
    if (!r) return null;
    const COTE_APERCU = 1600;
    if (Math.max(r.largeur, r.hauteur) <= COTE_APERCU) return r.image;
    if (largeurAffichee > r.largeur * (COTE_APERCU / Math.max(r.largeur, r.hauteur))) return r.image;
    if (r.apercu) return r.apercu;
    if (!r._apercuEnCours) {
      r._apercuEnCours = true;
      const f = COTE_APERCU / Math.max(r.largeur, r.hauteur);
      try {
        r.apercu = reduireParEtapes(r.image, r.largeur, r.hauteur, Math.round(r.largeur * f), Math.round(r.hauteur * f));
      } catch (e) { /* pas de mémoire pour l'aperçu : on garde l'image complète */ }
    }
    return r.apercu || r.image;
  },

  /* Oublie les images que plus rien n'utilise (ni le montage, ni
     « Annuler / Rétablir »). « utilises » : ensemble des numéros à garder. */
  nettoyer(utilises) {
    for (const [id, r] of this._table) {
      if (utilises.has(id)) continue;
      if (r.image && r.image.close) r.image.close();
      else if (r.image) r.image.width = 0;
      if (r.apercu) r.apercu.width = 0;
      this._table.delete(id);
    }
  },

  vider() {
    this.nettoyer(new Set());
  }
};
