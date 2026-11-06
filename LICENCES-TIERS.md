# Omni-Photo — licences des composants tiers

Omni-Photo est sous licence **Creative Commons BY-NC-ND 4.0**
(© 2026 Ferrus Dantioch, texte complet dans [LICENSE](LICENSE)). Cette licence
couvre le code écrit pour Omni-Photo (HTML, CSS et JavaScript).

L'application inclut aussi des éléments créés par d'autres. Chacun garde **sa
propre licence**, rappelée ci-dessous.

**Règle suivie :** seuls des composants sous licence permissive **Apache 2.0**
ou **MIT** sont inclus. Aucun composant à licence non commerciale, aucune
licence « copyleft » (GPL, AGPL), aucune licence SIL OFL. Tous les fichiers
sont rangés **dans le dépôt lui-même** (aucun chargement depuis un autre site),
pour que l'application marche hors ligne.

## Inclus dans l'application

| Élément | Fichier(s) | Auteur (mention de copyright) | Licence | Origine |
|---|---|---|---|---|
| **Roboto Slab** (police « Roboto Slab », et titres de l'application), version 2.002, normal et gras | `roboto-slab.woff2`, `roboto-slab-gras.woff2` | Copyright 2018 The Roboto Slab Project Authors | Apache 2.0 | Google Fonts, via le paquet npm `@fontsource/roboto-slab` 5.3.0 |
| **Special Elite** (police « Machine à écrire »), version 1.001 | `special-elite.woff2` | Copyright (c) 2010 by Brian J. Bonislawsky DBA Astigmatic (AOETI) | Apache 2.0 | `@fontsource/special-elite` 5.3.0 |
| **Permanent Marker** (police « Feutre »), version 1.001 | `permanent-marker.woff2` | Copyright (c) 2010 by Font Diner, Inc. | Apache 2.0 | `@fontsource/permanent-marker` 5.3.0 |
| **Luckiest Guy** (police « Affiche »), version 1.001 | `luckiest-guy.woff2` | Copyright (c) 2010 by Brian J. Bonislawsky DBA Astigmatic (AOETI) | Apache 2.0 | `@fontsource/luckiest-guy` 5.3.0 |
| **Coming Soon** (police « Écriture »), version 1.002 | `coming-soon.woff2` | Copyright (c) 2010 by Open Window | Apache 2.0 | `@fontsource/coming-soon` 5.3.0 |
| **Satisfy** (police « Élégante »), version 1.001 | `satisfy.woff2` | Copyright (c) 2011 by Font Diner, Inc. | Apache 2.0 | `@fontsource/satisfy` 5.3.0 |

Texte complet de la licence Apache 2.0 : [LICENCE-APACHE-2.0.txt](LICENCE-APACHE-2.0.txt).

Les fichiers de police sont copiés **sans modification** (sous-ensemble
« latin » fourni par Fontsource, qui contient tous les caractères du français :
é è ê à ç œ « » €…). Ils n'ont pas de fichier « NOTICE ».

La police « Simple » proposée pour les textes est celle du téléphone lui-même
(Roboto sur Android) : elle n'est pas incluse dans l'application.

Le **logo** (le dé à vingt faces de l'Omni-système, avec un petit appareil photo)
et les icônes tirées de lui (`logo.svg`, `icon-192.png`, `icon-512.png`,
`maskable-512.png`, `apple-touch-icon.png`) sont de Ferrus Dantioch, tous droits
réservés, comme les autres logos de l'Omni-système.

## Prévus pour l'étape 3 (pas encore inclus)

| Élément | Rôle | Licence |
|---|---|---|
| **ONNX Runtime Web** (Microsoft) | le moteur qui fait tourner le modèle d'IA dans le navigateur | MIT |
| **U²-Netp** (Xuebin Qin et coll.) | le modèle d'IA qui détoure le sujet | Apache 2.0 |

L'origine exacte des fichiers et leur licence seront vérifiées et notées ici au
moment de les ajouter.

## Écartés volontairement

| Élément | Raison |
|---|---|
| Polices Arimo, Tinos, Cousine, Roboto, Open Sans | passées sous licence SIL OFL (libre, mais ni Apache ni MIT) |
| Modèles RMBG 1.4 et 2.0 (BRIA AI) | licence non commerciale |
| Bibliothèque « background-removal » d'IMG.LY | licence AGPL (copyleft) |

## Outils de développement (non inclus dans l'application)

| Outil | Rôle | Licence |
|---|---|---|
| **Playwright** (Microsoft) | pilote un navigateur pour les tests automatiques (`tests/`) | Apache 2.0 |
