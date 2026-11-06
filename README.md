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

État actuel : **étape 2 sur 3** (version 0.2.0).

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
| Retrait du fond par IA locale, retouche du détourage, nouvel arrière-plan | étape 3 |

Les très grandes photos sont réduites à 4 096 pixels de côté pour rester
fluides sur un téléphone milieu de gamme (un message le signale). Les messages
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
9. Touchez « Exporter », choisissez PNG ou JPG, puis « Enregistrer dans le
   téléphone » : l'image arrive dans le dossier « Téléchargements ».
10. Pour installer l'application : bouton « Installer Omni-Photo » sur l'accueil,
   ou menu ⋮ de Chrome → « Ajouter à l'écran d'accueil ».
11. Pour vérifier le hors ligne : mettez le téléphone en mode avion, puis
   rouvrez Omni-Photo.

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
| `retouches.js` | les yeux rouges et la découpe de silhouette |
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
une tablette, et vérifient plus de 120 points : ouverture de photos, textes,
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
Les polices incluses gardent leur propre licence (Apache 2.0) : voir
[LICENCES-TIERS.md](LICENCES-TIERS.md).
