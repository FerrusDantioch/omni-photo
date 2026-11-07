/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   L'écran « Vérifier mon téléphone » : ce que le téléphone sait faire,
   et ce qui est prêt (hors ligne, installation, mémoire, IA, place).
   Utile pour comprendre un souci. Rien n'est envoyé : tout est mesuré
   dans le téléphone.
   ============================================================ */
'use strict';

const Diagnostic = {
  /* Ajoute une ligne : etat = 'ok' (✓), 'attention' (!) ou 'info' (i). */
  _ligne(liste, etat, titre, texte) {
    const li = document.createElement('li');
    li.className = 'ligne-verif ' + etat;
    const marque = document.createElement('span');
    marque.className = 'marque-verif';
    marque.setAttribute('aria-hidden', 'true');
    marque.textContent = etat === 'ok' ? '✓' : (etat === 'attention' ? '!' : 'i');
    const corps = document.createElement('div');
    const t = document.createElement('strong');
    t.textContent = titre;
    const p = document.createElement('p');
    p.textContent = texte;
    corps.append(t, p);
    li.append(marque, corps);
    li.dataset.titre = titre;
    liste.append(li);
  },

  async afficher() {
    const liste = $('#verif-liste');
    liste.textContent = '';
    $('#verif-vitesse-resultat').textContent = '';

    // 1. Le navigateur
    const m = /Chrome\/(\d+)/.exec(navigator.userAgent);
    const version = m ? Number(m[1]) : 0;
    if (!m) this._ligne(liste, 'info', 'Navigateur', 'Ce n\'est pas Google Chrome. Omni-Photo est pensée pour Chrome : en cas de souci, essaie avec lui.');
    else if (version < 110) this._ligne(liste, 'attention', 'Navigateur', `Chrome ${version} : un peu ancien. Mets Chrome à jour depuis le Play Store.`);
    else this._ligne(liste, 'ok', 'Navigateur', `Google Chrome ${version} : à jour.`);

    // 2. Le fonctionnement hors ligne
    const hl = await etatHorsLigne();
    const textesHL = {
      pret: ['ok', 'Omni-Photo est rangée dans le téléphone : elle s\'ouvre même sans internet.'],
      'premiere-visite': ['info', 'Première visite : rouvre Omni-Photo une fois, et elle marchera ensuite sans internet.'],
      incomplet: ['attention', 'Il manque des fichiers pour le hors ligne. Ouvre Omni-Photo avec internet, puis patiente une minute.'],
      impossible: ['attention', 'Ce navigateur ne permet pas le hors ligne (page ouverte sans « https » ?).']
    };
    this._ligne(liste, textesHL[hl][0], 'Sans internet', textesHL[hl][1]);

    // 3. L'installation
    const installee = window.matchMedia && matchMedia('(display-mode: standalone)').matches;
    this._ligne(liste, installee ? 'ok' : 'info', 'Installation', installee
      ? 'Omni-Photo est installée comme une application.'
      : 'Omni-Photo n\'est pas installée. Sur l\'accueil, touche « Installer Omni-Photo » (ou menu ⋮ de Chrome → « Ajouter à l\'écran d\'accueil »).');

    // 4. La mémoire
    const go = navigator.deviceMemory;
    if (!go) this._ligne(liste, 'info', 'Mémoire', 'Le téléphone ne donne pas sa mémoire.');
    else if (go >= 4) this._ligne(liste, 'ok', 'Mémoire', `Environ ${nombre(go)} Go : suffisant pour les grandes photos et l'IA.`);
    else this._ligne(liste, 'attention', 'Mémoire', `Environ ${nombre(go)} Go : c'est peu. Avant un détourage, ferme les autres applications.`);

    // 5. Les grandes photos (une toile de 4 096 × 4 096 pixels)
    let grandes = false;
    try {
      const { toile, ctx } = nouvelleToile(4096, 4096);
      ctx.fillStyle = '#123456';
      ctx.fillRect(4090, 4090, 6, 6);
      grandes = ctx.getImageData(4093, 4093, 1, 1).data[2] === 0x56;
      toile.width = 0;
    } catch (e) { /* refusé */ }
    this._ligne(liste, grandes ? 'ok' : 'attention', 'Grandes photos', grandes
      ? 'Les photos jusqu\'à 4 096 pixels de côté s\'ouvrent sans souci.'
      : 'Le téléphone a du mal avec les très grandes photos : préfère des photos plus petites.');

    // 6. L'intelligence artificielle
    const possible = Detourage.possible();
    const etat = await ModulesIA.etat();
    const pretes = Object.entries(etat).filter(([, ok]) => ok).map(([k]) => MODELES_IA[k].nom);
    if (!possible) this._ligne(liste, 'attention', 'Intelligence artificielle', 'Ce navigateur ne sait pas la faire tourner. Mets Chrome à jour.');
    else this._ligne(liste, pretes.length ? 'ok' : 'info', 'Intelligence artificielle', pretes.length
      ? `Dans le téléphone : ${pretes.join(' et ')}. Le détourage marche sans internet.`
      : 'Pas encore téléchargée : elle le sera au premier détourage (19 Mo, une seule fois).');

    // 7. La place
    const montages = await Sauvegarde.place();
    let ia = 0;
    for (const [modele, ok] of Object.entries(etat)) if (ok) ia += MODELES_IA[modele].octets;
    if (Object.values(etat).some(Boolean)) ia += MOTEUR_IA.reduce((s, [, o]) => s + o, 0);
    let libre = '';
    try {
      const est = await navigator.storage.estimate();
      if (est && est.quota) libre = ` Place encore disponible : environ ${nombre(Math.max(0, est.quota - est.usage) / 1073741824)} Go.`;
    } catch (e) { /* pas d'estimation */ }
    this._ligne(liste, 'info', 'Place utilisée', `Mes montages : ${nombre(montages / 1048576)} Mo. Intelligence artificielle : ${nombre(ia / 1048576)} Mo.${libre}`);

    // 8. La protection des données
    let protege = false;
    try { protege = await navigator.storage.persisted(); } catch (e) { /* inconnu */ }
    this._ligne(liste, protege ? 'ok' : 'info', 'Protection des montages', protege
      ? 'Le téléphone ne les effacera pas, même s\'il manque de place.'
      : 'Si le téléphone manque beaucoup de place, il pourrait les effacer. Installer Omni-Photo les protège ; pense aussi à « Sauvegarder tous mes montages ».');
  },

  /* Le test de vitesse : un détourage d'une petite image d'essai. */
  async testerVitesse() {
    const sortie = $('#verif-vitesse-resultat');
    if ((await ModulesIA.manquants('objet')).length) {
      sortie.textContent = 'L\'intelligence artificielle n\'est pas encore téléchargée : fais d\'abord un premier détourage.';
      return;
    }
    // Une image d'essai : un disque orangé sur fond gris
    const { toile, ctx } = nouvelleToile(600, 400);
    ctx.fillStyle = '#d5d9e0';
    ctx.fillRect(0, 0, 600, 400);
    ctx.fillStyle = '#e4572e';
    ctx.beginPath();
    ctx.arc(300, 200, 120, 0, Math.PI * 2);
    ctx.fill();
    const r = { image: toile, largeur: 600, hauteur: 400 };
    const debut = performance.now();
    const masque = await avecIA('objet', (avancer) => Detourage.masque(r, 'objet', avancer));
    toile.width = 0;
    if (!masque) { sortie.textContent = 'Le test n\'a pas pu aller au bout.'; return; }
    const s = (performance.now() - debut) / 1000;
    const avis = s < 4 ? 'rapide' : (s < 10 ? 'correct' : 'lent : ferme les autres applications avant un détourage');
    sortie.textContent = `Détourage d'essai : ${s.toFixed(1).replace('.', ',')} s (${avis}).`;
  }
};
