/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   Le « travailleur » du détourage par intelligence artificielle.

   Il tourne À CÔTÉ de la page (un « Web Worker ») : pendant les quelques
   secondes de calcul, l'écran reste fluide et la barre de progression
   avance. Tout se passe dans le téléphone : aucune photo n'est envoyée.

   Il utilise :
   - ONNX Runtime Web (Microsoft, licence MIT), le moteur qui fait
     tourner un modèle d'IA dans le navigateur : ort.wasm.bundle.min.mjs
     et ort-wasm-simd-threaded.wasm ;
   - deux modèles, au choix :
     · « objet » : U²-Netp (Xuebin Qin et coll., licence Apache 2.0), qui
       repère le sujet principal d'une photo (personne, animal, objet) :
       u2netp.onnx (4,6 Mo) ;
     · « personne » : MODNet (Zhanghan Ke et coll., licence Apache 2.0),
       spécialisé dans les personnes, plus précis sur les cheveux :
       modnet.onnx (25,9 Mo).
   Ces fichiers sont téléchargés une seule fois puis gardés dans le
   téléphone (voir ia.js) : ensuite, tout marche hors ligne.

   Message reçu de la page :
   - { type: 'detourer', modele, entree, largeurEntree, hauteurEntree, guide }
   Messages envoyés : 'progression', 'pret', 'masque', 'erreur'.
   ============================================================ */

import * as ort from './ort.wasm.bundle.min.mjs';

// Le moteur trouve son fichier .wasm à côté de ce fichier-ci. (Seul le
// .wasm est indiqué : le reste du moteur est déjà dans ort.wasm.bundle.min.mjs.)
ort.env.wasm.wasmPaths = { wasm: new URL('./ort-wasm-simd-threaded.wasm', import.meta.url).href };
// GitHub Pages ne permet pas le calcul à plusieurs « fils » : un seul suffit.
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.logLevel = 'error';

const FICHIERS_MODELES = { objet: './u2netp.onnx', personne: './modnet.onnx' };
// Un seul modèle en mémoire à la fois (un téléphone n'a pas de mémoire à perdre)
let session = null, modeleCharge = null;

function envoyer(message, transferts) {
  self.postMessage(message, transferts || []);
}

/* Télécharge le modèle (depuis la copie rangée dans le téléphone), en
   donnant l'avancement, puis prépare le moteur. */
async function preparer(modele) {
  if (session && modeleCharge === modele) return;
  if (session) { try { await session.release(); } catch (e) { /* rien */ } session = null; modeleCharge = null; }
  const reponse = await fetch(new URL(FICHIERS_MODELES[modele] || FICHIERS_MODELES.objet, import.meta.url));
  if (!reponse.ok) throw new Error('modele-absent');
  const total = Number(reponse.headers.get('Content-Length')) || (modele === 'personne' ? 25888640 : 4574861);
  let octets;
  if (reponse.body && reponse.body.getReader) {
    const lecteur = reponse.body.getReader();
    const morceaux = [];
    let recu = 0;
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      morceaux.push(value);
      recu += value.length;
      envoyer({ type: 'progression', etape: 'modele', fraction: Math.min(1, recu / total) });
    }
    octets = new Uint8Array(recu);
    let position = 0;
    for (const m of morceaux) { octets.set(m, position); position += m.length; }
  } else {
    octets = new Uint8Array(await reponse.arrayBuffer());
  }
  envoyer({ type: 'progression', etape: 'moteur', fraction: 0 });
  session = await ort.InferenceSession.create(octets, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all'
  });
  modeleCharge = modele;
}

/* ---------- Le filtre « guidé » ----------
   Le modèle donne une carte du sujet en 320 × 320 : ses bords sont flous
   une fois agrandis. Ce filtre recale ces bords sur les vrais contours de
   la photo (cheveux, épaules…), à une taille plus grande (le « guide »).
   Méthode connue (He, Sun et Tang, 2010), calculée avec des sommes
   cumulées pour aller vite. */
function moyenneBoite(source, l, h, r) {
  // Somme cumulée (une case de plus en largeur et en hauteur)
  const L = l + 1;
  const somme = new Float64Array(L * (h + 1));
  for (let y = 0; y < h; y++) {
    let ligne = 0;
    for (let x = 0; x < l; x++) {
      ligne += source[y * l + x];
      somme[(y + 1) * L + x + 1] = somme[y * L + x + 1] + ligne;
    }
  }
  const sortie = new Float32Array(l * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r) + 1;
    for (let x = 0; x < l; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(l - 1, x + r) + 1;
      const s = somme[y1 * L + x1] - somme[y0 * L + x1] - somme[y1 * L + x0] + somme[y0 * L + x0];
      sortie[y * l + x] = s / ((x1 - x0) * (y1 - y0));
    }
  }
  return sortie;
}

function filtreGuide(I, p, l, h, r, eps) {
  const n = l * h;
  const II = new Float32Array(n), Ip = new Float32Array(n);
  for (let i = 0; i < n; i++) { II[i] = I[i] * I[i]; Ip[i] = I[i] * p[i]; }
  const mI = moyenneBoite(I, l, h, r), mp = moyenneBoite(p, l, h, r);
  const mII = moyenneBoite(II, l, h, r), mIp = moyenneBoite(Ip, l, h, r);
  const a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const variance = mII[i] - mI[i] * mI[i];
    const covariance = mIp[i] - mI[i] * mp[i];
    a[i] = covariance / (variance + eps);
    b[i] = mp[i] - a[i] * mI[i];
  }
  const ma = moyenneBoite(a, l, h, r), mb = moyenneBoite(b, l, h, r);
  const q = new Float32Array(n);
  for (let i = 0; i < n; i++) q[i] = ma[i] * I[i] + mb[i];
  return q;
}

/* Agrandit la carte du modèle (cl × ch) à la taille du guide (interpolation douce). */
function agrandir(carte, cl, ch, l, h) {
  const sortie = new Float32Array(l * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(ch - 1, Math.max(0, ((y + 0.5) * ch) / h - 0.5));
    const y0 = Math.floor(sy), y1 = Math.min(ch - 1, y0 + 1), fy = sy - y0;
    for (let x = 0; x < l; x++) {
      const sx = Math.min(cl - 1, Math.max(0, ((x + 0.5) * cl) / l - 0.5));
      const x0 = Math.floor(sx), x1 = Math.min(cl - 1, x0 + 1), fx = sx - x0;
      const haut = carte[y0 * cl + x0] * (1 - fx) + carte[y0 * cl + x1] * fx;
      const bas = carte[y1 * cl + x0] * (1 - fx) + carte[y1 * cl + x1] * fx;
      sortie[y * l + x] = haut * (1 - fy) + bas * fy;
    }
  }
  return sortie;
}

async function detourer({ modele, entree, largeurEntree: cl, hauteurEntree: ch, guide }) {
  await preparer(modele);
  envoyer({ type: 'progression', etape: 'analyse', fraction: 0 });

  // 1. Le modèle cherche le sujet
  const debut = performance.now();
  const tenseur = new ort.Tensor('float32', entree, [1, 3, ch, cl]);
  const resultats = await session.run({ [session.inputNames[0]]: tenseur });
  const carte = resultats[session.outputNames[0]].data;   // la sortie principale
  const duree = performance.now() - debut;
  envoyer({ type: 'progression', etape: 'bords', fraction: 0, duree });

  // 2. La carte est ramenée entre 0 et 1. U²-Netp : on étire ses valeurs
  //    (comme le fait rembg) ; MODNet donne déjà une opacité entre 0 et 1.
  const normale = new Float32Array(cl * ch);
  if (modele === 'personne') {
    for (let i = 0; i < normale.length; i++) normale[i] = Math.min(1, Math.max(0, carte[i]));
  } else {
    let min = Infinity, max = -Infinity;
    for (const v of carte) { if (v < min) min = v; if (v > max) max = v; }
    const ecart = max - min || 1;
    for (let i = 0; i < normale.length; i++) normale[i] = (carte[i] - min) / ecart;
  }

  // 3. Les bords sont recalés sur la photo, à la taille du guide
  const { largeur: l, hauteur: h, pixels } = guide;
  const p = agrandir(normale, cl, ch, l, h);
  const I = new Float32Array(l * h);
  for (let i = 0; i < l * h; i++) {
    I[i] = (0.299 * pixels[i * 4] + 0.587 * pixels[i * 4 + 1] + 0.114 * pixels[i * 4 + 2]) / 255;
  }
  const rayon = Math.max(2, Math.round(Math.max(l, h) / 170));
  // MODNet suit déjà finement les cheveux : recalage plus léger
  const q = filtreGuide(I, p, l, h, rayon, modele === 'personne' ? 0.0008 : 0.002);

  // 4. Le masque final (0 = fond, 255 = sujet), un peu contrasté pour des
  //    bords nets sans perdre la douceur des cheveux.
  const masque = new Uint8ClampedArray(l * h);
  for (let i = 0; i < l * h; i++) {
    const v = Math.min(1, Math.max(0, (q[i] - 0.06) / 0.88));
    masque[i] = Math.round(v * 255);
  }
  envoyer({ type: 'masque', masque, largeur: l, hauteur: h, duree }, [masque.buffer]);
}

self.onmessage = async (e) => {
  const m = e.data || {};
  try {
    if (m.type === 'detourer') await detourer(m);
  } catch (erreur) {
    envoyer({ type: 'erreur', message: String((erreur && erreur.message) || erreur) });
  }
};
