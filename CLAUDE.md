# Omni-Photo — notes pour Claude

PWA de montage photo, en **HTML/CSS/JS pur, sans compilation**, pour téléphone
Android (Redmi) et tablette. Application de l'Omni-système (même thème que
Omni-Vidéo, Omni-Time…). L'auteur est novice : commentaires en français simple,
lui répondre en français, expliquer les commandes Git une par une.

## Construction en trois étapes (arrêt et retour de l'auteur entre chaque)

1 base, import/export, calques, texte, images, annuler ✅ (0.1.0) ·
2 yeux rouges, découpe manuelle (zoom) ✅ (0.2.0) · 3 détourage IA (U²-Netp + ONNX Runtime
Web, choisis par l'auteur), retouche pinceau/gomme, nouvel arrière-plan ✅ (1.0.0).
Puis 1.1.0 : les 11 suggestions (recadrer, lumière, flou du fond, autocollant,
MODNet, « Mes montages », taille d'export, guide, IA à la demande, formes,
fichier .omniphoto), demandées toutes ensemble par l'auteur.
Puis 1.2.0 : 11 autres suggestions (partage Android, collage, « Vérifier mon
téléphone », bouton Auto, signature, format YouTube, texte en arc / bandeau /
espacement, sauvegarde de tout, astuce émojis, puis les deux plus ambitieuses
en dernier : correcteur et modèles tout prêts).

## ⚠️ Contraintes à préserver

- Auteur : **Ferrus Dantioch** uniquement, jamais d'autre nom. « À propos » :
  « Application gratuite et sans publicité », version, licences tierces.
- **Composants tiers : Apache 2.0 ou MIT seulement** (choix de l'auteur : PAS
  d'OFL, donc pas les polices Oxanium/Literata des autres applications).
  Chacun dans `LICENCES-TIERS.md` et dans le bloc « Licences tierces » d'À propos.
  Tout est hébergé dans le dépôt (aucun chargement extérieur).
- Licence du code : CC BY-NC-ND 4.0 (comme la famille), en-tête de 3 lignes
  en haut de chaque fichier de code.
- Thème Omni-système à l'identique (variables de `styles.css`), aucun blanc ni
  noir pur dans l'interface, boutons ≥ 56 px avec icône ET texte, transitions
  400 ms, `prefers-reduced-motion` respecté, aucun son.
- Tutoiement dans l'application ; vouvoiement dans le README.
- Action qui fait perdre quelque chose = deux appuis (`armerBouton()`), jamais
  de `confirm()`.
- Tous les fichiers à la racine (envoi depuis un téléphone). Préfixes partagés
  avec les autres applications du site : base IndexedDB `omniphoto`, caches
  `omni-photo-*`, `"id": "/omni-photo/"` dans le manifeste (ne plus changer).

## Architecture

- `Montage.doc` = `{ largeur, hauteur, calques: [...] }`, du bas vers le haut.
  Calque : `x, y` (centre, pixels du montage), `echelle`, `rotation` (degrés),
  `miroirH/V`, `opacite`, `visible`, `verrouille` ; image : `ressource`,
  `largeur`, `hauteur` ; texte : `texte, police, taille, couleur, gras,
  alignement, contour{actif,couleur,epaisseur}, ombre{actif,couleur,flou,distance}`
  (épaisseur, flou, distance en fraction de `taille`).
- `Ressources` : numéro → image (ImageBitmap ou toile). **Jamais modifiée** :
  une retouche (étapes 2-3) crée une nouvelle ressource (`depuisToile`) et
  change le numéro du calque, pour qu'« Annuler » marche. `pourEcran()` = copie
  réduite (1 600 px) pour l'affichage.
- `Historique` : copies JSON de `Montage.doc` (30 au plus). `debut()`/`fin()`
  pour une modification qui dure (geste, curseur, fenêtre) ; `action(fn)` pour
  un bouton. `nettoyer()` libère les ressources que plus aucun état n'utilise.
- `Rendu.dessinerMontage()` sert à l'écran ET à l'export (ne jamais dessiner
  autrement à l'export).
- `Editeur.outil` : `OutilYeux`, `OutilDecoupe`, `OutilPinceau`
  (retouches.js), `OutilIA` (ia.js), `OutilRecadrage`, `OutilLumiere`,
  `OutilFlou`, `OutilCorrecteur`. Interface : `panneau` (id du `.panneau-outil`), `commencer(c)`,
  `appui(p)` → vrai si l'outil prend le doigt (sinon le doigt déplace la vue),
  `mouvement`, `relache`, `interrompre` (2e doigt = zoom, trait oublié),
  `toucher(p)` (simple toucher), `dessiner(ctx)` (pixels d'écran),
  `aDuTravail()`, `retirerDernier()` (« Annuler » du haut), `fermer()`,
  `majPanneau()`. Deux doigts = toujours zoom/déplacement de la vue.
  `Retouche.ouvrir/valider/verifierLibre` ; aperçu par `Rendu.remplacements`
  (écran seulement). Coordonnées : `Editeur.ecranVersCalque()` /
  `calqueVersEcran()` (pixels de l'image du calque, rotation et miroir compris).
- Yeux rouges (`corrigerYeuxRouges`) : rouge = R / ((V+B)/2 + 8) ≥ 1,45 et
  R > 45 ; tache reliée au centre (graines dans 55 % du rayon, croissance par
  seuil faible) ; masque adouci 3×3 ; R ramené à min(R, (V+B)/2) × 0,85.
- Découpe : contour en pixels de l'image, `destination-in` / `destination-out`,
  bord doux par `filter: blur()`. L'image garde sa taille (calque inchangé).
- Détourage IA (`ia.js` + travailleur module `detourage-travail.js`) :
  ONNX Runtime Web 1.30.0, version `ort.wasm.bundle.min.mjs` + `.wasm` seul
  (`wasmPaths = { wasm: … }`, sinon il réclame `ort-wasm-simd-threaded.mjs`),
  1 fil (GitHub Pages n'est pas « cross-origin isolated »). Entrée 1×3×320×320
  étirée, /max puis moyenne/écart ImageNet ; sortie 0 (« d0 ») normalisée
  min-max ; filtre guidé (rayon ≈ côté/170, eps 0,002) sur un guide ≤ 1 024 px ;
  masque appliqué à la photo en taille réelle. Barre de progression :
  `Patience.montrer(t, { progression, arreter })` / `avancer()` ; durée du
  dernier calcul dans `omniphoto-duree-ia-<modèle>`. `Detourage.arreter()` (même avant
  le démarrage du calcul : `_arretDemande`). Erreurs : `ErreurIA` + `MESSAGES_IA`.
- `calque.source` = image d'origine d'un sujet détouré (IA, découpe, pinceau :
  `Retouche.valider(c, toile, { garderSource: true })`). Le pinceau
  (`OutilPinceau`) = origine × masque (restaurer : ajoute au masque ; gommer :
  `destination-out`), traits rejoués pour « Retirer le dernier ». Les yeux
  rouges corrigent aussi `source`. `source` compte pour `nettoyer()`, la
  sauvegarde et `ressourcesUtilisees()`. `Rendu.fantomes` = origine à 30 %
  sous le sujet pendant le pinceau (écran seulement).
- Fond (`fond.js`) : calque `type: 'fond'` tout en bas (`mode` couleur /
  degrade / photo), dessiné par `dessinerFond()` sur toute l'image, jamais
  pris au doigt ; la fenêtre = une étape d'« Annuler » ; à la fermeture, le
  sujet détouré est déverrouillé et choisi.
- **Version 1.1** :
  - Outils en 3 onglets (`#outils-generaux [data-groupe]`, `Panneaux.choisirOnglet`,
    `omniphoto-onglet`) ; « Voir tout » posé sur la photo. Les retouches d'une
    image (`#retouches-calque`) restent visibles même si elle est verrouillée.
  - IA à la demande (`ModulesIA`, ia.js) : réserve `omni-photo-ia-v1`, jamais
    vidée par une mise à jour ; `sw.js` sert ces fichiers depuis elle (sinon
    internet) et, à l'activation, récupère l'IA rangée par la 1.0 dans
    l'ancienne réserve. Accord demandé dans `#fenetre-ia`. `avecIA(modele, fn)`
    = téléchargement + barre + messages. Modèles : `objet` (U²-Netp, 320²) et
    `personne` (MODNet fp32, petit côté 512, multiples de 32, (x/255-0,5)/0,5,
    sortie déjà entre 0 et 1, eps du filtre guidé 0,0008). MODNet quantifié
    écarté (mauvais résultats). `Detourage.masque(r, modele, avancer)` rend une
    toile ≤ 1 024 px (opacité = sujet), réutilisée par le flou.
  - `calque.reglages` (lumiere.js) et `calque.effet` (effets.js) : appliqués au
    dessin (`ctx.filter`, chaleur = filtre SVG `#omni-chaleur-N` créé à la
    demande), l'image ne change pas. Contour = silhouette posée en rond (cache
    `WeakMap` par image pour l'écran ; à l'export, libéré seulement s'il n'est
    pas en réserve).
  - Formes (formes.js) : `type: 'forme'`, boîte `largeur`×`hauteur`. Un
    « cadre » fait toute l'image et ne se prend au doigt que par son bord
    (`Editeur._touche`). Le recadrage et la rotation recalent fond et cadre.
  - Recadrage (recadrage.js) : change `doc.largeur/hauteur` et décale les
    calques (aucune image réduite). « Redresser » part du quart de tour actuel.
  - Flou (flou.js) : fond flouté SANS le sujet (pas de halo) + photo nette
    dessous (bords de l'image) + sujet net dessus ; résultat opaque,
    `oublierSource`.
  - « Mes montages » : IndexedDB version 2, tiroirs `montages` ({ id, nom,
    date, doc, ressources, miniature }) et `images` ; l'ancien tiroir `etat`
    (1.0) est repris puis supprimé dans `onupgradeneeded`. `Montage.id/nom`,
    `Montage.charger()`. Fichier `.omniphoto` : `OMNIPHOTO-MONTAGE-1\n` +
    longueur uint32 LE + JSON + images ; à l'import, nouveaux numéros.
  - Guide (guide.js) : `omniphoto-guide-vu` ; les tests le coupent
    (`sansGuide`) sauf la section qui le teste.
- Limites (`LIMITES`) : photo 4 096 px de côté, calque 2 048 px, 200 Mo,
  270 Mpx. Erreurs lisibles : `ErreurPhoto` + `MESSAGES_PHOTO`.
- Sauvegarde auto (`sauvegarde.js`) : voir « Mes montages » ci-dessus
  (tiroirs `montages` et `images` ; l'ancien tiroir `etat` n'existe plus
  depuis la 1.1).
- **Version 1.2** :
  - Partage Android : `share_target` (manifeste, POST `./partage`, champ
    `photos`) ; `sw.js` range les fichiers dans la réserve `omni-photo-partage`
    (jamais supprimée par l'activation) puis redirige vers `#partage` ;
    `Partage.recevoir()` (app.js) : 1 photo = montage, plusieurs = collage.
  - Collage (collage.js) : cases en parts de 1, `dispositionsCollage(n)`,
    images « cuites » à la taille de leur case (coins ronds) + calque `fond`.
  - Modèles (modeles.js) : calques en proportions (`rx, ry, rl, rh`, taille
    = part du petit côté) ; photo « cuite » dans sa zone (ronde ou à coins
    ronds), sinon forme « Emplacement photo » ; texte trop large réduit.
  - Correcteur (correcteur.js, `OutilCorrecteur`) : « effacer » = masque du
    trait, épluchage du bord vers le centre + lissage + grain ; « copier » =
    tampon depuis un instantané pris au début du trait. Appliqué aussi à
    `source`. Opérations rejouées pour « Retirer le dernier ».
  - Texte : `courbure` (-100 à 100, arc lettre par lettre), `espacement`
    (fraction de la taille, `ctx.letterSpacing`), `bandeau { actif, couleur,
    opacite }` ; tous facultatifs (anciens textes inchangés).
  - Signature (signature.js) : localStorage `omniphoto-signature` (+ image
    dans `images`, clé `signature`, épargnée par `_menage`).
  - Fichier « tous les montages » : en-tête `OMNIPHOTO-TOUT-1\n`, relu par
    le même `Sauvegarde.depuisFichier()` (qui renvoie une liste de numéros).
  - Diagnostic (diagnostic.js) : vue `verifier` ; `etatHorsLigne()` (app.js).
  - Lumière : `OutilLumiere.auto()` (histogramme d'une copie de 200 px).
- Message et « Patiente » sont des `popover` (au-dessus des fenêtres) ; mais
  une fenêtre modale rend le reste inerte : fermer la fenêtre avant un message
  d'erreur qui demande « D'accord ».

## Version

`VERSION` en haut d'`app.js` ET `CACHE` en haut de `sw.js` (`omni-photo-vN`),
à augmenter ensemble à chaque version publiée. Tout nouveau fichier va dans
`FICHIERS` de `sw.js`.

## Tests

`node tests/tester.js` (Playwright + Chromium ; environ 300 vérifications, dont le détourage hors ligne) ;
`RAPIDE=1` saute les contrôles communs. `tests/outils.js` = boîte à outils
commune à plusieurs applications de l'Omni-système.
Servir le dossier parent pour reproduire l'adresse de GitHub Pages
(`http://localhost:8000/omni-photo/`). Déploiement : GitHub Pages, branche
`main`, racine → https://ferrusdantioch.github.io/omni-photo/
