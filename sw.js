/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* Service Worker d'Omni-Photo.
   Rôle : rendre l'application utilisable SANS connexion internet.
   À la première visite, tous les fichiers de l'application sont rangés
   dans le téléphone (le « cache »), puis servis depuis là, même hors
   ligne. Les photos, elles, ne passent jamais par ici : elles restent
   dans le téléphone et ne sont jamais envoyées. */

/* ⚠️ À augmenter d'un cran (v1 → v2…) à CHAQUE modification d'un fichier
   de la liste FICHIERS ci-dessous, en même temps que VERSION dans app.js.
   Sinon, les téléphones qui ont déjà ouvert l'application gardent
   l'ancienne version. */
const CACHE = 'omni-photo-v6';

/* Les photos reçues du menu « Partager » d'Android, le temps que la page
   les ouvre (version 1.2). */
const CACHE_PARTAGE = 'omni-photo-partage';

/* La réserve des fichiers de l'intelligence artificielle (19 à 45 Mo).
   Ils ne sont PAS téléchargés à l'installation, mais au premier
   détourage, par la page (ia.js, après accord). Cette réserve a son propre
   nom et n'est jamais vidée par une mise à jour de l'application. */
const CACHE_IA = 'omni-photo-ia-v1';
const FICHIERS_IA = [
  './ort.wasm.bundle.min.mjs',
  './ort-wasm-simd-threaded.wasm',
  './u2netp.onnx',
  './modnet.onnx'
];

/* Le début du nom de cache propre à Omni-Photo. Toutes les applications
   de ferrusdantioch.github.io partagent la même adresse de site, donc le
   même espace de caches : on ne touche JAMAIS aux caches des autres
   applications, seulement aux anciennes versions d'Omni-Photo. */
const PREFIXE = 'omni-photo-';

/* La liste des fichiers indispensables au fonctionnement hors ligne.
   Si on ajoute un fichier au projet, il faut aussi l'ajouter ici. */
const FICHIERS = [
  './',
  './index.html',
  './styles.css',
  './outils.js',
  './polices.js',
  './ressources.js',
  './montage.js',
  './rendu.js',
  './editeur.js',
  './panneaux.js',
  './retouches.js',
  './ia.js',
  './fond.js',
  './lumiere.js',
  './effets.js',
  './formes.js',
  './flou.js',
  './recadrage.js',
  './guide.js',
  './montages.js',
  './signature.js',
  './collage.js',
  './diagnostic.js',
  './correcteur.js',
  './cacher.js',
  './modeles.js',
  './detourage-travail.js',
  './export.js',
  './impression.js',
  './sauvegarde.js',
  './app.js',
  './manifest.json',
  './logo.svg',
  './icon-192.png',
  './icon-512.png',
  './maskable-512.png',
  './apple-touch-icon.png',
  './roboto-slab.woff2',
  './roboto-slab-gras.woff2',
  './special-elite.woff2',
  './permanent-marker.woff2',
  './luckiest-guy.woff2',
  './coming-soon.woff2',
  './satisfy.woff2'
];

/* Télécharge tous les fichiers et les range dans le cache.
   { cache: 'reload' } oblige à reprendre chaque fichier sur le serveur,
   sans passer par la mémoire temporaire du navigateur (GitHub Pages la
   garde 10 minutes). */
function remplirCache() {
  return caches.open(CACHE)
    .then((c) => c.addAll(FICHIERS.map((f) => new Request(f, { cache: 'reload' }))));
}

/* Vérifie que tous les fichiers sont bien dans le cache, et le remplit à
   nouveau s'il en manque (une autre application du même site a pu
   faire du ménage). */
function verifierCache() {
  return caches.open(CACHE)
    .then((c) => Promise.all(FICHIERS.map((f) => c.match(f))))
    .then((trouves) => (trouves.some((r) => !r) ? remplirCache() : null))
    .then(() => true)
    .catch(() => false);   // hors ligne : on réessaiera à la prochaine ouverture
}

/* 1. Installation : on range tout dans le cache.
      Volontairement, PAS de self.skipWaiting() ici : une nouvelle version
      attend que la personne touche « Mettre à jour » sur l'accueil.
      Rien ne change par surprise au milieu d'un montage. */
self.addEventListener('install', (e) => {
  e.waitUntil(remplirCache());
});

/* 2. Activation : on supprime les anciennes versions d'Omni-Photo, et
      uniquement elles (voir PREFIXE plus haut). */
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const anciens = (await caches.keys()).filter((k) => k.startsWith(PREFIXE) && k !== CACHE && k !== CACHE_IA && k !== CACHE_PARTAGE);
    // La version 1.0 rangeait l'IA avec le reste : on la garde (pas besoin
    // de la retélécharger), dans la réserve de l'IA.
    const ia = await caches.open(CACHE_IA);
    for (const k of anciens) {
      const vieux = await caches.open(k);
      for (const f of FICHIERS_IA) {
        const rep = await vieux.match(f);
        if (rep && !(await ia.match(f))) await ia.put(new URL(f, self.registration.scope).href, rep);
      }
      await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

/* 3. Les messages de la page :
      - « activer » : la personne a touché « Mettre à jour » ;
      - « verifier » : la page demande si tout est prêt pour le hors ligne. */
self.addEventListener('message', (e) => {
  if (!e.data) return;
  if (e.data.type === 'activer') self.skipWaiting();
  if (e.data.type === 'verifier' && e.ports[0]) {
    const reponse = e.ports[0];
    e.waitUntil(verifierCache().then((complet) => reponse.postMessage({ complet, version: CACHE })));
  }
});

/* 4. Les demandes de fichiers : on sert la copie rangée dans le téléphone
      (instantané, hors ligne). On ne va sur internet que pour un fichier
      absent de la copie. On ne remplace JAMAIS en arrière-plan un fichier
      déjà rangé. « ignoreSearch » : une adresse avec un « ? » trouve
      quand même sa page. */
self.addEventListener('fetch', (e) => {
  // Version 1.2 : des photos partagées depuis la galerie (menu « Partager »
  // d'Android). Elles arrivent ici (voir « share_target » dans
  // manifest.json) : on les range, puis on ouvre l'application.
  if (e.request.method === 'POST' && new URL(e.request.url).pathname.endsWith('/partage')) {
    e.respondWith((async () => {
      try {
        const donnees = await e.request.formData();
        const fichiers = donnees.getAll('photos').filter((f) => f && f.size);
        const c = await caches.open(CACHE_PARTAGE);
        for (const k of await c.keys()) await c.delete(k);
        let i = 0;
        for (const f of fichiers.slice(0, 9)) {
          await c.put(new URL('./partage/' + i++, self.registration.scope).href, new Response(f, {
            headers: { 'Content-Type': f.type || 'image/jpeg', 'X-Nom': encodeURIComponent(f.name || 'photo') }
          }));
        }
      } catch (err) { /* la page dira que rien n'est arrivé */ }
      return Response.redirect(new URL('./index.html#partage', self.registration.scope).href, 303);
    })());
    return;
  }
  if (e.request.method !== 'GET') return;
  // Seulement les fichiers d'Omni-Photo (pas les liens vers d'autres sites)
  if (!e.request.url.startsWith(self.registration.scope)) return;

  // À chaque ouverture de l'application, on vérifie que le cache est complet
  if (e.request.mode === 'navigate') e.waitUntil(verifierCache());

  // Les fichiers de l'IA : dans leur réserve, sinon sur internet (la page
  // se charge de les ranger, voir ia.js)
  const chemin = new URL(e.request.url).pathname;
  if (FICHIERS_IA.some((f) => chemin.endsWith(f.slice(1)))) {
    e.respondWith(caches.open(CACHE_IA).then((c) => c.match(e.request, { ignoreSearch: true })).then((rep) => rep || fetch(e.request)));
    return;
  }

  e.respondWith(
    caches.open(CACHE).then((c) => c.match(e.request, { ignoreSearch: true }).then((enCache) => {
      if (enCache) return enCache;
      return fetch(e.request).then((rep) => {
        if (rep && rep.status === 200 && rep.type === 'basic') c.put(e.request, rep.clone());
        return rep;
      });
    }))
  );
});
