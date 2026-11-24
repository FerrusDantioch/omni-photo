/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   Contrôles statiques (sans dépendances npm) :
   - hygiène du dépôt (.nojekyll, licences, .gitignore) ;
   - CSP stricte, zéro script/style/attribut inline, zéro URL externe ;
   - réciprocité complète HTML / CSS / manifest.json / Worker <-> sw.js <-> disque ;
   - vérification syntaxique (node --check) de tous les fichiers JS/MJS.

   Lancer :  node tests/verifier-statique.mjs
   ============================================================ */
'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function lire(rel) {
  return fs.readFileSync(path.join(RACINE, rel), 'utf8');
}

function sansCommentairesHtml(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

function sansCommentairesCss(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function normaliserChemin(ref) {
  if (typeof ref !== 'string') return null;
  const brut = ref.trim();
  if (!brut || brut.startsWith('#')) return null;
  if (/^(?:data:|blob:|mailto:|https?:|\/\/)/i.test(brut)) return null;
  const sansAncre = brut.split('#')[0].split('?')[0].trim();
  if (!sansAncre || sansAncre === '.' || sansAncre === './') return 'index.html';
  return sansAncre.replace(/^\.\//, '');
}

function extraireTableauJs(source, nomConst) {
  const m = source.match(new RegExp(`const\\s+${nomConst}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  assert.ok(m, `Constante ${nomConst} introuvable dans sw.js`);
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
}

function extraireAttributsHtml(htmlNettoye) {
  const refs = [];
  const balises = htmlNettoye.matchAll(/<(link|script|img|source)\b([^>]*)>/gi);
  for (const [, tag, attrs] of balises) {
    for (const attr of ['href', 'src']) {
      const m = attrs.match(new RegExp(`\\b${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
      if (m) {
        const val = m[1] ?? m[2];
        refs.push({ source: `index.html <${tag.toLowerCase()} ${attr}>`, brut: val });
      }
    }
  }
  return refs;
}

test('Hygiène du dépôt (.nojekyll, licences, README, .gitignore)', () => {
  for (const f of ['.nojekyll', 'LICENSE', 'LICENCES-TIERS.md', 'LICENCE-APACHE-2.0.txt', 'LICENCE-ONNXRUNTIME-MIT.txt', 'README.md', '.gitignore']) {
    assert.ok(fs.existsSync(path.join(RACINE, f)), `Fichier attendu manquant : ${f}`);
  }
  assert.equal(fs.existsSync(path.join(RACINE, '.agents')), false, 'Aucun dossier .agents ne doit exister dans le dépôt');
  const gitignore = lire('.gitignore').split(/\r?\n/).map((l) => l.trim());
  for (const entree of ['node_modules/', 'package.json', 'package-lock.json']) {
    assert.ok(gitignore.includes(entree), `.gitignore doit ignorer ${entree}`);
  }
});

test('CSP stricte dans index.html et zéro code/attribut inline', () => {
  const html = sansCommentairesHtml(lire('index.html'));
  const cspMatch = html.match(/<meta\s+http-equiv=(?:"Content-Security-Policy"|'Content-Security-Policy')\s+content=(?:"([^"]*)"|'([^']*)')[^>]*>/i);
  assert.ok(cspMatch, 'Balise <meta http-equiv="Content-Security-Policy"> absente');
  const cspContent = cspMatch[1] ?? cspMatch[2];

  const directives = new Map();
  for (const part of cspContent.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    directives.set(tokens[0].toLowerCase(), tokens.slice(1));
  }

  const attendues = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'wasm-unsafe-eval'"],
    'style-src': ["'self'"],
    'img-src': ["'self'", 'blob:', 'data:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'", 'blob:', 'data:'],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'none'"],
    'frame-src': ["'none'"]
  };
  for (const [cle, valeurs] of Object.entries(attendues)) {
    assert.deepEqual(directives.get(cle), valeurs, `Directive CSP inattendue pour ${cle}`);
  }

  const interdits = ["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", '*', 'http:', 'https:'];
  for (const [cle, vals] of directives.entries()) {
    for (const v of vals) {
      assert.ok(!interdits.includes(v.toLowerCase()), `Jeton CSP dangereux ${v} dans ${cle}`);
    }
  }

  assert.equal(/<style\b/i.test(html), false, 'index.html ne doit contenir aucune balise <style>');

  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    assert.ok(/\bsrc\s*=\s*["'][^"']+["']/i.test(m[1]), 'Tout <script> dans index.html doit avoir un attribut src=');
    assert.equal(m[2].trim(), '', 'Tout <script> dans index.html doit avoir un corps vide');
  }

  assert.equal(/\sstyle\s*=/i.test(html), false, 'index.html ne doit contenir aucun attribut style=');
  assert.equal(/\son[a-z]+\s*=/i.test(html), false, 'index.html ne doit contenir aucun gestionnaire inline on*=');

  // Vérification des injections HTML style= / on*= dans les scripts de l'application
  // (y compris littéraux/gabarits multi-lignes, en ignorant les commentaires JS)
  const jsRacine = fs.readdirSync(RACINE).filter((f) => f.endsWith('.js') && f !== 'sw.js');
  const litteralOuCommentaire = /\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|('(?:[^'\\\r\n]|\\[\s\S])*'|"(?:[^"\\\r\n]|\\[\s\S])*"|`(?:[^`\\]|\\[\s\S])*`)/g;
  for (const fichier of jsRacine) {
    const code = lire(fichier);
    for (const m of code.matchAll(litteralOuCommentaire)) {
      if (!m[1]) continue;
      assert.equal(
        /<[a-z][^>]*\s(?:style|on[a-z]+)\s*=/i.test(m[1]),
        false,
        `${fichier} ne doit pas injecter d'attribut HTML style= ou on*=`
      );
    }
  }
});

test('Zéro ressource externe dans index.html et styles.css', () => {
  const html = sansCommentairesHtml(lire('index.html'));
  for (const m of html.matchAll(/<(link|script|img|iframe|source|video|audio|object|embed)\b([^>]*)>/gi)) {
    for (const attr of ['href', 'src']) {
      const am = m[2].match(new RegExp(`\\b${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
      if (!am) continue;
      const val = (am[1] ?? am[2]).trim();
      assert.equal(/^(?:https?:|\/\/)/i.test(val), false, `URL externe interdite dans <${m[1]}>: ${val}`);
    }
  }

  const css = sansCommentairesCss(lire('styles.css'));
  assert.equal(/@import\b/i.test(css), false, 'styles.css ne doit pas contenir @import');
  for (const m of css.matchAll(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi)) {
    const val = m[2].trim();
    assert.equal(/^(?:https?:|\/\/)/i.test(val), false, `URL externe interdite dans styles.css : ${val}`);
  }
});

test('Réciprocité complète HTML / CSS / manifest / Worker <-> sw.js <-> disque', () => {
  const swTexte = lire('sw.js');
  const fichiersBruts = extraireTableauJs(swTexte, 'FICHIERS');
  const fichiersIaBruts = extraireTableauJs(swTexte, 'FICHIERS_IA');

  assert.ok(fichiersBruts.includes('./'), "sw.js FICHIERS doit inclure './' pour la racine hors ligne");
  assert.match(swTexte, /const\s+PREFIXE\s*=\s*['"]omni-photo-['"]/, "PREFIXE doit valoir 'omni-photo-'");
  assert.match(swTexte, /const\s+CACHE\s*=\s*['"]omni-photo-v\d+['"]/, 'CACHE doit commencer par omni-photo-v');
  assert.ok(
    swTexte.includes("!k.startsWith(PREFIXE + 'ia-')") && /\/\^omni-photo-v\[123\]\$\//.test(swTexte),
    'activate dans sw.js doit exclure omni-photo-ia-* et restreindre la migration à omni-photo-v[123]'
  );
  assert.ok(swTexte.includes("endsWith('/partage')"), 'sw.js doit intercepter le share_target /partage');

  const swSet = new Set(fichiersBruts.map(normaliserChemin).filter(Boolean));
  const iaSet = new Set(fichiersIaBruts.map(normaliserChemin).filter(Boolean));

  // Chaque entrée de FICHIERS et FICHIERS_IA existe sur le disque
  for (const f of [...swSet, ...iaSet]) {
    assert.ok(fs.existsSync(path.join(RACINE, f)), `Fichier cité dans sw.js absent du disque : ${f}`);
  }

  // Extraction des références locales
  const refsLocales = [];
  const html = sansCommentairesHtml(lire('index.html'));
  refsLocales.push(...extraireAttributsHtml(html));

  const css = sansCommentairesCss(lire('styles.css'));
  for (const m of css.matchAll(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi)) {
    refsLocales.push({ source: 'styles.css url()', brut: m[2] });
  }

  const manifest = JSON.parse(lire('manifest.json'));
  assert.equal(manifest.id, '/omni-photo/', 'manifest.json id doit valoir /omni-photo/');
  if (manifest.share_target) {
    assert.equal(manifest.share_target.action, './partage', 'share_target.action doit correspondre à la route virtuelle ./partage');
  }
  refsLocales.push({ source: 'manifest.json start_url', brut: manifest.start_url });
  refsLocales.push({ source: 'manifest.json scope', brut: manifest.scope });
  for (const icone of manifest.icons || []) {
    refsLocales.push({ source: 'manifest.json icon', brut: icone.src });
  }

  // Workers dynamiques dans les scripts racine
  for (const fichier of fs.readdirSync(RACINE).filter((f) => f.endsWith('.js') && f !== 'sw.js')) {
    const code = lire(fichier);
    for (const m of code.matchAll(/new\s+Worker\(\s*['"]([^'"]+)['"]/g)) {
      refsLocales.push({ source: `${fichier} new Worker()`, brut: m[1] });
    }
  }

  for (const ref of refsLocales) {
    const norm = normaliserChemin(ref.brut);
    if (!norm) continue;
    assert.ok(fs.existsSync(path.join(RACINE, norm)), `Référence locale introuvable sur disque (${ref.source}) : ${ref.brut}`);
    assert.ok(swSet.has(norm), `Référence locale absente de sw.js FICHIERS (${ref.source}) : ${ref.brut} -> ${norm}`);
  }

  // Les 4 fichiers IA dans ia.js et detourage-travail.js doivent figurer dans FICHIERS_IA
  const iaJs = lire('ia.js');
  const workerJs = lire('detourage-travail.js');
  const refsIaAttendues = ['ort.wasm.bundle.min.mjs', 'ort-wasm-simd-threaded.wasm', 'u2netp.onnx', 'modnet.onnx'];
  for (const f of refsIaAttendues) {
    assert.ok(iaJs.includes(f) && workerJs.includes(f), `Référence IA attendue dans ia.js et detourage-travail.js : ${f}`);
    assert.ok(iaSet.has(f), `Référence IA absente de sw.js FICHIERS_IA : ${f}`);
  }
});

test('Cohérence de version et présence des fichiers JS', () => {
  const appJs = lire('app.js');
  const m = appJs.match(/const\s+VERSION\s*=\s*['"]([^'"]+)['"]/);
  assert.ok(m, 'VERSION introuvable dans app.js');
  const readme = lire('README.md');
  assert.ok(readme.includes(m[1]), `README.md doit mentionner la version ${m[1]}`);
});

test('Syntaxe valide (node --check) sur tous les fichiers JS/MJS', () => {
  const aVerifier = [
    ...fs.readdirSync(RACINE).filter((f) => f.endsWith('.js') || f.endsWith('.mjs')).map((f) => path.join(RACINE, f)),
    ...fs.readdirSync(path.join(RACINE, 'tests'))
      .filter((f) => f.endsWith('.js') || f.endsWith('.mjs'))
      .map((f) => path.join(RACINE, 'tests', f))
  ];
  const unitDir = path.join(RACINE, 'tests', 'unit');
  if (fs.existsSync(unitDir)) {
    for (const f of fs.readdirSync(unitDir)) {
      if (f.endsWith('.js') || f.endsWith('.mjs')) aVerifier.push(path.join(unitDir, f));
    }
  }
  for (const fichier of aVerifier) {
    execFileSync(process.execPath, ['--check', fichier], { stdio: 'pipe' });
  }
});
