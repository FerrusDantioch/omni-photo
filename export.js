/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   L'export : fabriquer le fichier final (PNG ou JPG), puis
   l'enregistrer dans le téléphone ou le partager.

   - PNG : garde la transparence (idéal pour un sujet détouré, un logo).
   - JPG : fichier plus léger, pour les photos. Le JPG ne connaît pas la
     transparence : les zones transparentes deviennent blanches.
   ============================================================ */
'use strict';

const Export = {
  enCours: false,

  initialiser() {
    const fenetre = $('#fenetre-export');
    fenetre.addEventListener('input', () => this.majFenetre());
    // Le bouton « Partager » n'apparaît que si le téléphone sait partager des fichiers
    $('[data-action="partager"]').hidden = !this._peutPartager();
  },

  ouvrir() {
    if (!Montage.doc) return;
    this.majFenetre();
    $('#fenetre-export').showModal();
  },

  format() {
    return ($('input[name="e-format"]:checked') || {}).value === 'jpg' ? 'jpg' : 'png';
  },

  qualite() {
    return limiter(Number($('#e-qualite').value) / 100, 0.5, 1);
  },

  /* Le côté le plus long voulu (0 = taille réelle). */
  cote() {
    return Number(($('input[name="e-taille"]:checked') || {}).value) || 0;
  },

  _dimensions(cote) {
    const d = Montage.doc;
    const f = cote ? Math.min(1, cote / Math.max(d.largeur, d.hauteur)) : 1;
    return [Math.max(1, Math.round(d.largeur * f)), Math.max(1, Math.round(d.hauteur * f))];
  },

  majFenetre() {
    const jpg = this.format() === 'jpg';
    $('#zone-qualite').hidden = !jpg;
    $('#e-qualite').parentElement.querySelector('output').textContent = $('#e-qualite').value + ' %';
    const d = Montage.doc;
    // Les tailles plus petites que l'image : 2 048 et 1 080 pixels (côté le plus long)
    for (const el of $$('input[name="e-taille"]')) {
      const cote = Number(el.value) || 0;
      const inutile = cote && cote >= Math.max(d.largeur, d.hauteur);
      el.disabled = inutile;
      if (inutile && el.checked) $('input[name="e-taille"][value="reelle"]').checked = true;
      const [l, h] = this._dimensions(cote);
      el.parentElement.querySelector('small').textContent = `${nombre(l)} × ${nombre(h)}`;
    }
    const [l, h] = this._dimensions(this.cote());
    $('#e-dimensions').textContent = `${nombre(l)} × ${nombre(h)} pixels`;
    $('#e-explication').textContent = jpg
      ? 'JPG : fichier léger, idéal pour une photo. Les zones transparentes deviennent blanches.'
      : 'PNG : qualité parfaite et transparence gardée (idéal pour un détourage ou un logo). Fichier plus lourd.';
  },

  /* Dessine le montage (en taille réelle, ou réduit : « cote » = côté le
     plus long voulu) et en fait un fichier. */
  async fabriquer(format, qualite, cote = 0) {
    const doc = Montage.doc;
    await Polices.pret;
    const [l, h] = this._dimensions(cote);
    const f = l / doc.largeur;
    let toile;
    try {
      toile = document.createElement('canvas');
      toile.width = l;
      toile.height = h;
      const ctx = toile.getContext('2d');
      if (!ctx || toile.width !== l) throw new Error('memoire');
      if (format === 'jpg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, l, h);
      }
      ctx.setTransform(f, 0, 0, f, 0, 0);
      ctx.imageSmoothingQuality = 'high';
      Rendu.dessinerMontage(ctx, doc, { ecran: false });
      const type = format === 'jpg' ? 'image/jpeg' : 'image/png';
      const blob = await new Promise((ok) => toile.toBlob(ok, type, qualite));
      // Un téléphone à court de mémoire renvoie un fichier vide
      if (!blob || !blob.size) throw new Error('memoire');
      return blob;
    } finally {
      if (toile) toile.width = toile.height = 0;   // libère la mémoire tout de suite
    }
  },

  async _preparer() {
    if (this.enCours) return null;
    this.enCours = true;
    const format = this.format();
    Patience.montrer('Fabrication de ton image…');
    await laisserAfficher();
    try {
      const blob = await this.fabriquer(format, this.qualite(), this.cote());
      return { blob, nom: nomDeFichier(format), type: blob.type };
    } catch (e) {
      console.warn(e);
      // La fenêtre d'export se ferme : sinon elle empêcherait de toucher
      // « D'accord » sous le message.
      if ($('#fenetre-export').open) $('#fenetre-export').close();
      Message.erreur('Ton téléphone manque de mémoire pour fabriquer l\'image. Ferme quelques applications puis réessaie. ' +
        'Ton montage est intact.');
      return null;
    } finally {
      this.enCours = false;
      Patience.cacher();
    }
  },

  /* Enregistre le fichier dans le téléphone (dossier « Téléchargements »). */
  async enregistrer() {
    const f = await this._preparer();
    if (!f) return;
    const url = URL.createObjectURL(f.blob);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = f.nom;
    document.body.append(lien);
    lien.click();
    lien.remove();
    // On laisse au téléphone le temps de copier le fichier avant de l'oublier
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    $('#fenetre-export').close();
    Message.montrer(`Image enregistrée : ${f.nom} (${this._poids(f.blob.size)}). Tu la trouves dans le dossier « Téléchargements ».`);
  },

  _peutPartager() {
    try {
      return !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'essai.png', { type: 'image/png' })] }));
    } catch (e) {
      return false;
    }
  },

  /* Ouvre le menu de partage du téléphone (messagerie, galerie…). */
  async partager() {
    // Le téléphone n'autorise le partage que juste après un toucher. Si la
    // fabrication a été longue, il faut toucher une 2e fois : l'image déjà
    // prête est alors gardée, pour ne pas la refaire.
    const empreinte = Montage.copie() + this.format() + this.qualite() + this.cote();
    let fichier = this._pret && this._pret.empreinte === empreinte ? this._pret.fichier : null;
    if (!fichier) {
      const f = await this._preparer();
      if (!f) return;
      fichier = new File([f.blob], f.nom, { type: f.type });
      this._pret = { empreinte, fichier };
    }
    try {
      await navigator.share({ files: [fichier], title: 'Omni-Photo' });
      this._pret = null;
      $('#fenetre-export').close();
    } catch (e) {
      if (e && e.name === 'NotAllowedError') {
        Message.montrer('Ton image est prête : touche encore une fois « Partager ».');
      } else if (e && e.name !== 'AbortError') {
        // « AbortError » : la personne a simplement fermé le menu de partage
        Message.erreur('Le partage n\'a pas marché. Utilise plutôt « Enregistrer », puis partage l\'image depuis ta galerie.');
      }
    }
  },

  _poids(octets) {
    if (octets < 1024 * 1024) return Math.max(1, Math.round(octets / 1024)) + ' Ko';
    return (octets / 1024 / 1024).toFixed(1).replace('.', ',') + ' Mo';
  }
};
