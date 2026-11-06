/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   Les formes : rectangle, rond, flèche, bulle de bande dessinée,
   étoile, cœur, et cadre autour de toute l'image.

   Un calque de type « forme » :
     forme : 'rectangle' | 'rond' | 'fleche' | 'bulle' | 'etoile' | 'coeur' | 'cadre'
     largeur, hauteur : la boîte de la forme (en pixels du montage)
     remplissage : { actif, couleur }
     trait       : { actif, couleur, epaisseur }   // fraction du petit côté
     arrondi     : 0 à 1 (rectangle, bulle, cadre)
     bord        : épaisseur du cadre (fraction du petit côté de l'image)
   Elle se déplace, s'agrandit et tourne comme les autres calques.
   ============================================================ */
'use strict';

const FORMES = [
  { id: 'fleche', nom: 'Flèche' },
  { id: 'rectangle', nom: 'Rectangle' },
  { id: 'rond', nom: 'Rond' },
  { id: 'bulle', nom: 'Bulle' },
  { id: 'etoile', nom: 'Étoile' },
  { id: 'coeur', nom: 'Cœur' },
  { id: 'cadre', nom: 'Cadre' }
];

const Formes = {
  nom(c) {
    return (FORMES.find((f) => f.id === c.forme) || FORMES[0]).nom;
  },

  /* Ajoute une forme au centre et ouvre sa fenêtre de réglages
     (ajout + réglages = une étape d'« Annuler »). */
  ajouter() {
    if (!Montage.doc) return;
    Historique.debut();
    const d = Montage.doc;
    const cote = Math.round(Math.min(d.largeur, d.hauteur) * 0.35);
    const c = {
      id: nouvelId('c'), type: 'forme', nom: 'Forme', forme: 'fleche',
      x: d.largeur / 2, y: d.hauteur / 2, largeur: cote, hauteur: Math.round(cote * 0.6),
      echelle: 1, rotation: 0, miroirH: false, miroirV: false, opacite: 1, visible: true, verrouille: false,
      remplissage: { actif: true, couleur: '#e4572e' },
      trait: { actif: true, couleur: '#ffffff', epaisseur: 0.04 },
      arrondi: 0.25, bord: 0.04
    };
    d.calques.push(c);
    Montage.selection = c.id;
    Montage.signaler();
    FenetreForme.ouvrir(c.id, true);
    return c;
  },

  /* Le tracé de la forme, centré sur 0, dans une boîte l × h. */
  chemin(ctx, c) {
    const l = c.largeur, h = c.hauteur, x0 = -l / 2, y0 = -h / 2;
    const petit = Math.min(l, h);
    ctx.beginPath();
    switch (c.forme) {
      case 'rond':
        ctx.ellipse(0, 0, l / 2, h / 2, 0, 0, Math.PI * 2);
        break;
      case 'fleche': {
        const tige = h * 0.38, tete = Math.min(l * 0.45, h * 0.95);
        ctx.moveTo(x0, -tige / 2);
        ctx.lineTo(l / 2 - tete, -tige / 2);
        ctx.lineTo(l / 2 - tete, y0);
        ctx.lineTo(l / 2, 0);
        ctx.lineTo(l / 2 - tete, h / 2);
        ctx.lineTo(l / 2 - tete, tige / 2);
        ctx.lineTo(x0, tige / 2);
        ctx.closePath();
        break;
      }
      case 'bulle': {
        // Une bulle arrondie, avec sa pointe en bas à gauche, d'un seul trait
        const bas = h / 2 - h * 0.24;
        const r = Math.min(c.arrondi * petit * 0.5 + petit * 0.08, (bas - y0) / 2, l / 2);
        ctx.moveTo(x0 + r, y0);
        ctx.arcTo(l / 2, y0, l / 2, bas, r);
        ctx.arcTo(l / 2, bas, x0, bas, r);
        ctx.lineTo(-l * 0.02, bas);
        ctx.lineTo(-l * 0.3, h / 2);
        ctx.lineTo(-l * 0.18, bas);
        ctx.arcTo(x0, bas, x0, y0, r);
        ctx.arcTo(x0, y0, l / 2, y0, r);
        ctx.closePath();
        break;
      }
      case 'etoile':
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const k = i % 2 ? 0.45 : 1;
          const px = Math.cos(a) * (l / 2) * k, py = Math.sin(a) * (h / 2) * k + h * 0.05;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath();
        break;
      case 'coeur': {
        const sx = l / 2, sy = h / 2;
        ctx.moveTo(0, sy * 0.95);
        ctx.bezierCurveTo(-sx * 1.6, -sy * 0.05, -sx * 0.55, -sy * 1.35, 0, -sy * 0.5);
        ctx.bezierCurveTo(sx * 0.55, -sy * 1.35, sx * 1.6, -sy * 0.05, 0, sy * 0.95);
        ctx.closePath();
        break;
      }
      case 'cadre': {
        // Le bord de l'image : l'extérieur moins l'intérieur (règle « evenodd »)
        const b = Math.max(1, c.bord * petit);
        ctx.rect(x0, y0, l, h);
        ctx.roundRect(x0 + b, y0 + b, l - 2 * b, h - 2 * b, Math.min(c.arrondi * petit * 0.25, (l - 2 * b) / 2, (h - 2 * b) / 2));
        break;
      }
      default:   // rectangle
        ctx.roundRect(x0, y0, l, h, Math.min(c.arrondi * petit * 0.5, l / 2, h / 2));
    }
  },

  dessiner(ctx, c) {
    const petit = Math.min(c.largeur, c.hauteur);
    this.chemin(ctx, c);
    ctx.lineJoin = 'round';
    if (c.forme === 'cadre') {
      ctx.fillStyle = c.remplissage.couleur;
      ctx.fill('evenodd');
      return;
    }
    if (c.remplissage.actif) {
      ctx.fillStyle = c.remplissage.couleur;
      ctx.fill();
    }
    if (c.trait.actif && c.trait.epaisseur > 0) {
      ctx.lineWidth = c.trait.epaisseur * petit;
      ctx.strokeStyle = c.trait.couleur;
      ctx.stroke();
    }
  }
};


/* La fenêtre « Forme » : la sorte de forme, ses couleurs, ses
   proportions. Une étape d'« Annuler » pour tout ce qu'on y change. */
const FenetreForme = {
  _id: null,

  initialiser() {
    const zone = $('#fo-formes');
    for (const f of FORMES) {
      const label = document.createElement('label');
      label.className = 'choix';
      label.innerHTML = `<input type="radio" name="fo-forme" value="${f.id}"><span>${f.nom}</span>`;
      zone.append(label);
    }
    const fen = $('#fenetre-forme');
    fen.addEventListener('input', (e) => this.appliquer(e.target));
    fen.addEventListener('change', (e) => this.appliquer(e.target));
    fen.addEventListener('close', () => { this._id = null; Historique.fin(); });
  },

  ouvrir(id, nouvelle = false) {
    const c = Montage.calque(id);
    if (!c || c.type !== 'forme') return;
    this._id = id;
    if (!nouvelle) Historique.debut();
    $(`input[name="fo-forme"][value="${c.forme}"]`).checked = true;
    $('#fo-remplir').checked = c.remplissage.actif;
    $('#fo-couleur').value = c.remplissage.couleur;
    $('#fo-trait').checked = c.trait.actif;
    $('#fo-trait-couleur').value = c.trait.couleur;
    $('#fo-trait-epaisseur').value = Math.round(c.trait.epaisseur * 100);
    $('#fo-proportions').value = Math.round((Math.log(c.largeur / c.hauteur) / Math.log(4)) * 100);
    $('#fo-arrondi').value = Math.round(c.arrondi * 100);
    $('#fo-bord').value = Math.round(c.bord * 100);
    $('#fenetre-forme').showModal();
    this._majZones();
  },

  _majZones() {
    const forme = ($('input[name="fo-forme"]:checked') || {}).value;
    const cadre = forme === 'cadre';
    $('#fo-zone-trait').hidden = cadre;
    $('#fo-zone-remplir-choix').hidden = cadre;
    $('#fo-zone-proportions').hidden = cadre;
    $('#fo-zone-arrondi').hidden = !['rectangle', 'bulle', 'cadre'].includes(forme);
    $('#fo-zone-bord').hidden = !cadre;
    $('#fo-zone-trait').classList.toggle('inactif', !$('#fo-trait').checked);
    for (const el of $$('#fenetre-forme input[type="range"]')) {
      const s = el.parentElement.querySelector('output');
      if (!s) continue;
      s.textContent = el.id === 'fo-proportions' ? (Math.pow(4, Number(el.value) / 100)).toFixed(2).replace('.', ',') : el.value + ' %';
    }
  },

  appliquer(cible) {
    const c = Montage.calque(this._id);
    if (!c) return;
    const d = Montage.doc;
    const forme = ($('input[name="fo-forme"]:checked') || {}).value || 'rectangle';
    const changements = {
      forme,
      remplissage: { actif: $('#fo-remplir').checked || forme === 'cadre', couleur: $('#fo-couleur').value },
      trait: { actif: $('#fo-trait').checked, couleur: $('#fo-trait-couleur').value, epaisseur: Number($('#fo-trait-epaisseur').value) / 100 },
      arrondi: Number($('#fo-arrondi').value) / 100,
      bord: Number($('#fo-bord').value) / 100
    };
    if (forme === 'cadre') {
      // Le cadre fait toujours le tour de toute l'image
      Object.assign(changements, { largeur: d.largeur, hauteur: d.hauteur, x: d.largeur / 2, y: d.hauteur / 2, echelle: 1, rotation: 0 });
    } else if (c.forme === 'cadre' || (cible && cible.id === 'fo-proportions')) {
      // Proportions : on garde à peu près la même surface
      const surface = c.forme === 'cadre' ? Math.pow(Math.min(d.largeur, d.hauteur) * 0.35, 2) * 0.6 : c.largeur * c.hauteur;
      const rapport = Math.pow(4, Number($('#fo-proportions').value) / 100);
      Object.assign(changements, { largeur: Math.sqrt(surface * rapport), hauteur: Math.sqrt(surface / rapport) });
      if (c.forme === 'cadre') Object.assign(changements, { echelle: 1 });
    }
    Montage.modifier(c.id, changements);
    this._majZones();
  }
};
