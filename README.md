# Omni-Photo

**Le montage photo tout simple, sur téléphone et tablette.**
Application de l'Omni-système, par Ferrus Dantioch.

- 100 % gratuite, **sans publicité**, sans pistage, sans compte.
- 100 % locale : **aucune photo n'est envoyée sur internet**, tout se passe dans
  le téléphone.
- Fonctionne **hors ligne** une fois ouverte une première fois (et encore mieux
  une fois installée).
- Pensée pour le doigt : gros boutons, glisser, pincer, tourner à deux doigts.
- Interface en français, couleurs douces, aucune animation agressive, aucun son.

## Ce que fait l'application

État actuel : **version 1.1.0** (les trois étapes du plan, puis 11 améliorations).

| Fonction | État |
|---|---|
| Ouvrir une photo (galerie ou appareil photo), ou partir d'une toile vide | ✅ |
| Exporter en PNG (transparence gardée) ou en JPG (qualité réglable), enregistrer ou partager | ✅ |
| Textes : 7 polices, taille, couleur, gras, contour, ombre, alignement, plusieurs lignes | ✅ |
| Images ajoutées en calques (logos, autres photos) | ✅ |
| Calques : déplacer, agrandir, tourner, retourner, dupliquer, supprimer, ordre, opacité, masquer, verrouiller | ✅ |
| Gestes : glisser, pincer, tourner à deux doigts, poignée ronde, zoom dans la photo | ✅ |
| Annuler / Rétablir (30 niveaux) | ✅ |
| Sauvegarde automatique du montage en cours (« Reprendre mon montage ») | ✅ |
| Page « À propos » (auteur, version, licences) | ✅ |
| Yeux rouges : toucher l'œil, zone réglable, aperçu avant / après, puis valider | ✅ |
| Découpe de silhouette au doigt (tracé libre ou points), zoom pour la précision, garder l'intérieur ou l'extérieur, bord doux, aperçu | ✅ |
| Retrait du fond par IA, **dans le téléphone** (modèle U²-Netp), avec barre de progression et bouton « Arrêter » | ✅ |
| Retouche du détourage : pinceau « Restaurer » et gomme, taille et douceur réglables, fond retiré visible en transparence | ✅ |
| Nouvel arrière-plan : couleur unie, dégradé (4 directions) ou photo de la galerie ; sujet déplaçable et redimensionnable | ✅ |
| **1.1** Recadrer (formats tout prêts), tourner d'un quart de tour, redresser une photo penchée | ✅ |
| **1.1** Lumière : luminosité, contraste, couleurs, chaleur, et 8 filtres (noir et blanc, sépia, vintage…) | ✅ |
| **1.1** Flou du fond (effet portrait), grâce à l'IA | ✅ |
| **1.1** Contour et ombre autour d'un sujet détouré (effet autocollant) | ✅ |
| **1.1** Mode « Une personne » (modèle MODNet), plus précis sur les cheveux | ✅ |
| **1.1** « Mes montages » : plusieurs montages gardés, renommer, supprimer | ✅ |
| **1.1** Taille d'export au choix (réelle, 2 048 px, 1 080 px pour partager) | ✅ |
| **1.1** Guide de la première fois (quatre bulles) | ✅ |
| **1.1** IA téléchargée seulement au premier détourage (installation : 1 Mo au lieu de 20) | ✅ |
| **1.1** Formes : flèche, rectangle, rond, bulle, étoile, cœur, cadre | ✅ |
| **1.1** Fichier « .omniphoto » pour passer un montage du téléphone à la tablette | ✅ |

Les très grandes photos sont réduites à 4 096 pixels de côté pour rester
fluides sur un téléphone milieu de gamme (un message le signale).

Le détourage par IA travaille sur une copie réduite (320 pixels pour trouver
le sujet, 1 024 pixels pour recaler les bords sur la photo), puis le résultat
est appliqué à la photo **en taille réelle** : la qualité de l'image n'est pas
réduite. Il faut compter 2 à 6 secondes sur un téléphone milieu de gamme.

**Première ouverture :** l'application télécharge environ 1 Mo. L'intelligence
artificielle (19 Mo, et 26 Mo de plus pour le mode « Une personne ») n'est
téléchargée qu'au premier détourage, après votre accord, une seule fois.
Ensuite, tout marche sans internet, détourage compris. La page « À propos »
permet de supprimer ces fichiers pour libérer de la place.

Les outils sont rangés en trois onglets : **Ajouter** (texte, image, forme,
calques), **Retoucher** (recadrer, lumière, yeux rouges, découpe) et
**Détourage** (retirer le fond, pinceau, nouveau fond, flou du fond). Les messages
d'erreur (format non pris en charge comme le HEIC, fichier vide, manque de
mémoire…) sont en français et expliquent quoi faire.

## Tester sur votre téléphone

Le plus simple : publier l'application sur GitHub Pages (voir plus bas), puis
ouvrir l'adresse dans **Google Chrome** sur le téléphone :
**https://ferrusdantioch.github.io/omni-photo/**

1. Touchez « Ouvrir une photo de ma galerie » et choisissez une photo.
2. Touchez « Texte », écrivez quelque chose, essayez les polices, le contour,
   l'ombre. Touchez « Terminé ».
3. Faites glisser le texte, pincez pour l'agrandir, tournez à deux doigts.
4. Touchez « Image » pour ajouter un logo ou une autre photo par-dessus.
5. Touchez « Calques » pour changer l'ordre, masquer ou verrouiller.
6. Essayez « Annuler » et « Rétablir ».
7. Touchez « Yeux rouges », puis le centre d'un œil rouge : l'aperçu apparaît.
   « Voir l'original » compare, « Valider » garde la correction.
8. Touchez « Découper », tracez le contour du sujet au doigt (zoomez à deux
   doigts pour la précision), puis « Aperçu » et « Valider la découpe ».
9. Ouvrez une photo d'une personne ou d'un objet, touchez « Détourer » :
   la barre de progression avance, puis l'aperçu montre le fond retiré
   (damier). Touchez « Valider et retoucher ».
10. Avec le pinceau : « Gommer » efface ce qui reste du fond, « Restaurer »
    fait revenir une partie coupée (cheveux…). Zoomez à deux doigts pour les
    détails. Touchez « Valider ».
11. Touchez « Fond » : essayez une couleur, un dégradé, puis une photo de
    votre galerie. Touchez « Terminé », puis déplacez et pincez le sujet.
12. Touchez « Exporter », choisissez PNG ou JPG, puis « Enregistrer dans le
    téléphone » : l'image arrive dans le dossier « Téléchargements ».
13. Pour installer l'application : bouton « Installer Omni-Photo » sur l'accueil,
   ou menu ⋮ de Chrome → « Ajouter à l'écran d'accueil ».
14. Pour vérifier le hors ligne : mettez le téléphone en mode avion, puis
    rouvrez Omni-Photo et essayez « Détourer ».

## Publier sur GitHub Pages

1. Sur github.com, ouvrez le dépôt **omni-photo**.
2. Touchez **Settings** (Paramètres), puis **Pages** dans le menu de gauche.
3. Dans « Build and deployment », « Source » : choisissez **Deploy from a branch**.
4. « Branch » : choisissez **main** et le dossier **/ (root)**, puis **Save**.
5. Patientez une à deux minutes : l'adresse
   https://ferrusdantioch.github.io/omni-photo/ apparaît en haut de la page.

À chaque nouvelle version publiée, les téléphones qui ont déjà l'application
affichent un bandeau « Mettre à jour » sur l'accueil.

## Organisation des fichiers

Tous les fichiers sont à la racine (plus simple à envoyer depuis un téléphone).

| Fichier | Rôle |
|---|---|
| `index.html` | la page : écrans, boutons, fenêtres |
| `styles.css` | l'apparence (couleurs du thème Omni-système) |
| `app.js` | le chef d'orchestre : écrans, boutons, ouverture des photos, mises à jour |
| `montage.js` | le montage (les calques) et « Annuler / Rétablir » |
| `ressources.js` | l'ouverture des images, en toute sécurité (formats, taille, mémoire) |
| `rendu.js` | le dessin du montage (le même à l'écran et dans le fichier exporté) |
| `editeur.js` | la zone de travail et les gestes au doigt |
| `panneaux.js` | les réglages du calque, la liste des calques, la fenêtre « Texte » |
| `retouches.js` | les yeux rouges, la découpe de silhouette, le pinceau « Restaurer » et la gomme |
| `ia.js` | le détourage par IA : préparation, barre de progression, application du masque |
| `detourage-travail.js` | le « travailleur » qui fait tourner l'IA à côté de la page (écran fluide) |
| `fond.js` | le nouvel arrière-plan (couleur, dégradé, photo) |
| `recadrage.js` | recadrer, tourner, redresser |
| `lumiere.js` | lumière, contraste, couleurs, chaleur et filtres |
| `flou.js` | le flou du fond (effet portrait) |
| `effets.js` | le contour et l'ombre (effet autocollant) |
| `formes.js` | les formes (flèche, bulle, cadre…) |
| `montages.js` | l'accueil : « Mes montages » et les fichiers « .omniphoto » |
| `guide.js` | le guide de la première fois |
| `modnet.onnx` | le modèle d'IA MODNet, mode « Une personne » (licence Apache 2.0) |
| `ort.wasm.bundle.min.mjs`, `ort-wasm-simd-threaded.wasm` | le moteur ONNX Runtime Web (licence MIT) |
| `u2netp.onnx` | le modèle d'IA U²-Netp (licence Apache 2.0) |
| `export.js` | la fabrication du fichier PNG ou JPG |
| `sauvegarde.js` | la sauvegarde automatique dans le téléphone |
| `polices.js` | la liste des polices |
| `sw.js` | le « service worker » : le fonctionnement hors ligne |
| `manifest.json` | la fiche d'identité pour l'installation |
| `*.woff2` | les polices (licence Apache 2.0) |
| `LICENCES-TIERS.md` | les licences de tous les composants tiers |
| `tests/` | les tests automatiques (pour le développement seulement) |

## Tests automatiques (sur ordinateur)

Ils ouvrent l'application dans un vrai navigateur qui imite un téléphone, puis
une tablette, et vérifient 242 points : ouverture de photos, textes,
gestes, annuler, export, sauvegarde, hors ligne, messages d'erreur…

```bash
npm install playwright
```

```bash
npx playwright install chromium
```

```bash
node tests/tester.js
```

## Licence

© 2026 Ferrus Dantioch — Creative Commons BY-NC-ND 4.0 (voir [LICENSE](LICENSE)).
Les polices, le moteur ONNX Runtime Web (MIT) et les modèles U²-Netp et MODNet
(Apache 2.0) gardent leur propre licence : voir [LICENCES-TIERS.md](LICENCES-TIERS.md).
