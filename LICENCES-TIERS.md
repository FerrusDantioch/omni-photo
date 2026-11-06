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
| **ONNX Runtime Web** 1.30.0, le moteur qui fait tourner le modèle d'IA dans le navigateur (version « WebAssembly », sur le processeur) | `ort.wasm.bundle.min.mjs`, `ort-wasm-simd-threaded.wasm` | Copyright (c) Microsoft Corporation | MIT — [LICENCE-ONNXRUNTIME-MIT.txt](LICENCE-ONNXRUNTIME-MIT.txt) | paquet npm `onnxruntime-web` 1.30.0 (publié le 14 septembre 2026), dossier `dist/` |
| **MODNet**, le modèle d'IA du mode « Une personne » (plus précis sur les cheveux), 25,9 Mo | `modnet.onnx` | Zhanghan Ke, Jiayu Sun, Kaican Li, Qiong Yan et Rynson W.H. Lau (article « MODNet: Trimap-Free Portrait Matting in Real Time », 2022) | Apache 2.0 — [LICENCE-APACHE-2.0.txt](LICENCE-APACHE-2.0.txt) | poids officiels du dépôt `ZHKKKe/MODNet` (« The code, models, and demos in this repository […] are released under the Apache License 2.0 »), conversion ONNX de Xenova (`Xenova/modnet`, fichier `onnx/model.onnx`, 25 888 640 octets, empreinte MD5 `d0ded73e80bc0d38a64e2286486e4ea3`) ; récupéré via le paquet npm `@dloizides/background-removal` 0.2.0, dont la notice indique cette origine |
| **U²-Netp**, le modèle d'IA qui repère le sujet d'une photo (version légère d'U²-Net, 4,6 Mo) | `u2netp.onnx` | Xuebin Qin, Zichen Zhang, Chenyang Huang, Masood Dehghan, Osmar R. Zaiane et Martin Jagersand (article « U²-Net: Going Deeper with Nested U-Structure for Salient Object Detection », 2020) | Apache 2.0 — [LICENCE-APACHE-2.0.txt](LICENCE-APACHE-2.0.txt) | conversion ONNX du modèle officiel (dépôt `xuebinqin/U-2-Net`), identique au fichier diffusé par le projet rembg (empreinte MD5 `8e83ca70e441ab06c318d82300c84806`) ; récupéré via le paquet npm `@rmbg/model-u2netp` 0.0.1 |

Texte complet de la licence Apache 2.0 : [LICENCE-APACHE-2.0.txt](LICENCE-APACHE-2.0.txt).
Texte complet de la licence MIT d'ONNX Runtime : [LICENCE-ONNXRUNTIME-MIT.txt](LICENCE-ONNXRUNTIME-MIT.txt).

**À savoir sur le modèle.** Le paquet npm `@rmbg/model-u2netp` ne précise ni licence
ni auteur. C'est pourquoi le fichier a été vérifié par son empreinte : il est
octet pour octet celui que diffuse rembg (projet libre, licence MIT) comme
conversion du modèle officiel U²-Netp, publié par ses auteurs sous licence
Apache 2.0. Le fichier est inclus sans modification.

**À savoir sur MODNet.** La licence a été lue directement dans le dépôt officiel
(fichier LICENSE et README de `ZHKKKe/MODNet`). Une version « allégée » de 6,6 Mo
existe aussi ; elle a été écartée après comparaison : sur les photos de test, elle
oubliait des parties entières du sujet. La version complète est incluse sans
modification.

**Téléchargés à la demande.** Les fichiers de l'IA (moteur et modèles) sont dans
le dépôt, mais l'application ne les télécharge qu'au premier détourage, après
accord de la personne, puis les garde dans le téléphone.

**À savoir sur ONNX Runtime.** Le moteur compilé (`.wasm`) contient aussi de
petits composants libres utilisés par Microsoft pour le fabriquer (listés dans
le fichier « ThirdPartyNotices » du projet ONNX Runtime), chacun sous sa propre
licence permissive. Les deux fichiers sont copiés sans modification.

Les fichiers de police sont copiés **sans modification** (sous-ensemble
« latin » fourni par Fontsource, qui contient tous les caractères du français :
é è ê à ç œ « » €…). Ils n'ont pas de fichier « NOTICE ».

La police « Simple » proposée pour les textes est celle du téléphone lui-même
(Roboto sur Android) : elle n'est pas incluse dans l'application.

Le **logo** (le dé à vingt faces de l'Omni-système, avec un petit appareil photo)
et les icônes tirées de lui (`logo.svg`, `icon-192.png`, `icon-512.png`,
`maskable-512.png`, `apple-touch-icon.png`) sont de Ferrus Dantioch, tous droits
réservés, comme les autres logos de l'Omni-système.

## Écartés volontairement

| Élément | Raison |
|---|---|
| Polices Arimo, Tinos, Cousine, Roboto, Open Sans | passées sous licence SIL OFL (libre, mais ni Apache ni MIT) |
| Modèles RMBG 1.4 et 2.0 (BRIA AI) | licence non commerciale |
| Bibliothèque « background-removal » d'IMG.LY | licence AGPL (copyleft) |
| Modèle U²-Net complet (176 Mo) et BiRefNet | trop lourds pour un téléphone milieu de gamme |
| MODNet « allégé » (quantifié, 6,6 Mo) | résultats nettement moins bons que la version complète |
| Décodeur HEIC « libheif » | licence LGPL (ni Apache ni MIT) |
| Version WebGPU d'ONNX Runtime (28 Mo) | deux fois plus lourde ; la version WebAssembly suffit (2 à 6 secondes) |

## Outils de développement (non inclus dans l'application)

| Outil | Rôle | Licence |
|---|---|---|
| **Playwright** (Microsoft) | pilote un navigateur pour les tests automatiques (`tests/`) | Apache 2.0 |
