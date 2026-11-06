/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   La zone de travail : la toile où l'on voit le montage, et tout ce
   qu'on y fait au doigt.

   - un doigt sur un calque : on le choisit et on le fait glisser ;
   - un doigt sur la poignée ronde (coin du calque choisi) : on
     l'agrandit et on le tourne ;
   - deux doigts : on pince pour agrandir et on tourne le calque choisi
     (ou, si aucun calque n'est choisi, on zoome dans l'image) ;
   - un doigt dans le vide : on déplace la vue (utile quand on a zoomé),
     et un simple toucher enlève la sélection.

   Deux sortes de coordonnées :
   - « écran » : en pixels de la page (là où est le doigt) ;
   - « montage » : en pixels de l'image finale.
   La « vue » fait le lien : écran = montage × vue.e + (vue.x, vue.y).
   ============================================================ */
'use strict';

const Editeur = {
  toile: null,
  ctx: null,
  vue: { e: 1, x: 0, y: 0 },     // zoom et décalage de l'affichage
  _vueAjustee: true,            // la vue montre toute l'image
  _pointeurs: new Map(),        // doigts posés : numéro → { x, y }
  _geste: null,
  _dessinDemande: false,
  outil: null,                  // outil de retouche ouvert (yeux rouges, découpe…), voir retouches.js

  RAYON_POIGNEE: 18,            // en pixels d'écran
  ZONE_POIGNEE: 34,             // zone de toucher autour de la poignée

  initialiser() {
    this.toile = $('#toile');
    this.ctx = this.toile.getContext('2d');

    // La toile suit la taille de sa zone (rotation du téléphone, etc.)
    new ResizeObserver(() => this.redimensionner()).observe(this.toile.parentElement);

    const t = this.toile;
    t.addEventListener('pointerdown', (e) => this._appui(e));
    t.addEventListener('pointermove', (e) => this._mouvement(e));
    t.addEventListener('pointerup', (e) => this._relache(e));
    t.addEventListener('pointercancel', (e) => this._relache(e, true));
    t.addEventListener('lostpointercapture', (e) => { if (this._pointeurs.has(e.pointerId)) this._relache(e, true); });
    t.addEventListener('wheel', (e) => this._molette(e), { passive: false });
    t.addEventListener('contextmenu', (e) => e.preventDefault());

    Montage.ecouter(() => this.redessiner());
  },

  /* ---------- Affichage ---------- */

  redimensionner() {
    const zone = this.toile.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const l = Math.max(1, Math.round(zone.clientWidth * dpr));
    const h = Math.max(1, Math.round(zone.clientHeight * dpr));
    if (this.toile.width !== l || this.toile.height !== h) {
      this.toile.width = l;
      this.toile.height = h;
    }
    if (this._vueAjustee) this.ajusterVue();
    else this.redessiner();
  },

  /* Montre toute l'image, centrée, avec une petite marge. */
  ajusterVue() {
    const doc = Montage.doc;
    const zone = this.toile.parentElement;
    if (!doc || !zone.clientWidth) return;
    const marge = 16;
    const W = zone.clientWidth, H = zone.clientHeight;
    const e = Math.min((W - marge * 2) / doc.largeur, (H - marge * 2) / doc.hauteur);
    this.vue = { e: Math.max(e, 0.001), x: (W - doc.largeur * e) / 2, y: (H - doc.hauteur * e) / 2 };
    this._vueAjustee = true;
    this.redessiner();
  },

  /* Demande un dessin à la prochaine image de l'écran (jamais plus de
     60 fois par seconde, même si on bouge beaucoup le doigt). */
  redessiner() {
    if (this._dessinDemande) return;
    this._dessinDemande = true;
    requestAnimationFrame(() => {
      this._dessinDemande = false;
      this._dessiner();
    });
  },

  _dessiner() {
    const ctx = this.ctx, doc = Montage.doc;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.toile.width, this.toile.height);
    if (!doc) return;
    const v = this.vue;

    // 1. Le damier des zones transparentes (en pixels d'écran)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = Rendu.damier(ctx);
    ctx.fillRect(v.x, v.y, doc.largeur * v.e, doc.hauteur * v.e);

    // 2. Le montage, rogné aux bords de l'image
    ctx.setTransform(dpr * v.e, 0, 0, dpr * v.e, dpr * v.x, dpr * v.y);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, doc.largeur, doc.hauteur);
    ctx.clip();
    Rendu.dessinerMontage(ctx, doc, { ecran: true, zoom: dpr * v.e });
    ctx.restore();

    // 3. Ce qui n'est pas dans l'image : cadre, sélection, outils
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = 'rgba(214, 194, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(v.x - 0.5, v.y - 0.5, doc.largeur * v.e + 1, doc.hauteur * v.e + 1);

    const c = Montage.calqueChoisi();
    if (c && c.visible && !this.outil) this._dessinerSelection(ctx, c);
    if (this.outil && this.outil.dessiner) this.outil.dessiner(ctx);
  },

  /* Le cadre autour du calque choisi, et sa poignée ronde. */
  _dessinerSelection(ctx, c) {
    const coins = this.coinsEcran(c);
    ctx.save();
    ctx.lineJoin = 'round';
    const chemin = () => {
      ctx.beginPath();
      coins.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
    };
    // Trait sombre dessous, trait clair dessus : visible sur toutes les photos
    chemin(); ctx.strokeStyle = 'rgba(20, 17, 29, 0.7)'; ctx.lineWidth = 4; ctx.stroke();
    chemin(); ctx.strokeStyle = '#d6c2ff'; ctx.lineWidth = 2; ctx.stroke();

    if (!c.verrouille) {
      const p = coins[2];   // coin en bas à droite
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.RAYON_POIGNEE, 0, Math.PI * 2);
      ctx.fillStyle = '#a777ff';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#14111d';
      ctx.stroke();
      // Petite flèche courbe : « tourner et agrandir »
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, -Math.PI * 0.9, Math.PI * 0.4);
      ctx.strokeStyle = '#140d24';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      const fx = p.x + 8 * Math.cos(Math.PI * 0.4), fy = p.y + 8 * Math.sin(Math.PI * 0.4);
      ctx.beginPath();
      ctx.moveTo(fx - 5, fy - 1); ctx.lineTo(fx, fy); ctx.lineTo(fx + 1, fy - 5);
      ctx.stroke();
    }
    ctx.restore();
  },

  /* ---------- Conversions de coordonnées ---------- */

  ecranVersMontage(x, y) {
    return { x: (x - this.vue.x) / this.vue.e, y: (y - this.vue.y) / this.vue.e };
  },

  montageVersEcran(x, y) {
    return { x: x * this.vue.e + this.vue.x, y: y * this.vue.e + this.vue.y };
  },

  /* D'un point de l'écran vers un pixel de l'IMAGE d'un calque (en
     tenant compte de son déplacement, de sa taille, de sa rotation et de
     son retournement). Sert aux retouches : yeux rouges, découpe… */
  ecranVersCalque(c, xEcran, yEcran) {
    const p = this.ecranVersMontage(xEcran, yEcran);
    const a = (-c.rotation * Math.PI) / 180;
    const dx = p.x - c.x, dy = p.y - c.y;
    let lx = (dx * Math.cos(a) - dy * Math.sin(a)) / c.echelle;
    let ly = (dx * Math.sin(a) + dy * Math.cos(a)) / c.echelle;
    if (c.miroirH) lx = -lx;
    if (c.miroirV) ly = -ly;
    return { x: lx + c.largeur / 2, y: ly + c.hauteur / 2 };
  },

  /* L'inverse : d'un pixel de l'image d'un calque vers l'écran. */
  calqueVersEcran(c, px, py) {
    let lx = (px - c.largeur / 2) * c.echelle, ly = (py - c.hauteur / 2) * c.echelle;
    if (c.miroirH) lx = -lx;
    if (c.miroirV) ly = -ly;
    const a = (c.rotation * Math.PI) / 180;
    return this.montageVersEcran(c.x + lx * Math.cos(a) - ly * Math.sin(a), c.y + lx * Math.sin(a) + ly * Math.cos(a));
  },

  /* Combien de pixels d'écran pour un pixel de l'image du calque. */
  zoomCalque(c) {
    return this.vue.e * c.echelle;
  },

  /* Ouvre ou ferme un outil de retouche. */
  choisirOutil(outil) {
    this.outil = outil || null;
    this._geste = null;
    this._pointeurs.clear();
    Panneaux.majPanneau();
    Historique.majBoutons();
    this.redessiner();
  },

  /* Les 4 coins d'un calque, en pixels d'écran (haut-gauche, haut-droite,
     bas-droite, bas-gauche, tels qu'on les voit). */
  coinsEcran(c) {
    const { largeur, hauteur } = Rendu.tailleCalque(c);
    const a = (c.rotation * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
    const l = (largeur * c.echelle) / 2, h = (hauteur * c.echelle) / 2;
    return [[-l, -h], [l, -h], [l, h], [-l, h]].map(([px, py]) =>
      this.montageVersEcran(c.x + px * cos - py * sin, c.y + px * sin + py * cos));
  },

  /* Le point (en pixels du montage) est-il sur ce calque ?
     « tolerance » en pixels d'écran, pour les tout petits calques. */
  _touche(c, x, y, tolerance = 10) {
    const { largeur, hauteur } = Rendu.tailleCalque(c);
    const a = (-c.rotation * Math.PI) / 180;
    const dx = x - c.x, dy = y - c.y;
    const lx = (dx * Math.cos(a) - dy * Math.sin(a)) / c.echelle;
    const ly = (dx * Math.sin(a) + dy * Math.cos(a)) / c.echelle;
    const marge = tolerance / (this.vue.e * c.echelle);
    const dedans = Math.abs(lx) <= largeur / 2 + marge && Math.abs(ly) <= hauteur / 2 + marge;
    // Un cadre (forme qui fait le tour de l'image) ne se prend que par son
    // bord : sinon il cacherait tout ce qui est dessous.
    if (dedans && c.type === 'forme' && c.forme === 'cadre') {
      const bord = c.bord * Math.min(largeur, hauteur) + marge * 2;
      return Math.abs(lx) >= largeur / 2 - bord || Math.abs(ly) >= hauteur / 2 - bord;
    }
    return dedans;
  },

  /* Le calque le plus haut sous le doigt (seulement ceux qu'on peut bouger). */
  calqueSous(xEcran, yEcran) {
    const p = this.ecranVersMontage(xEcran, yEcran);
    const liste = Montage.doc.calques;
    for (let i = liste.length - 1; i >= 0; i--) {
      const c = liste[i];
      if (c.visible && !c.verrouille && c.type !== 'fond' && this._touche(c, p.x, p.y)) return c;
    }
    return null;
  },

  _surPoignee(xEcran, yEcran) {
    const c = Montage.calqueChoisi();
    if (!c || c.verrouille || !c.visible) return false;
    const p = this.coinsEcran(c)[2];
    return Math.hypot(p.x - xEcran, p.y - yEcran) <= this.ZONE_POIGNEE;
  },

  _position(e) {
    const r = this.toile.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  },

  /* ---------- Les doigts ---------- */

  _appui(e) {
    if (!Montage.doc) return;
    e.preventDefault();
    try { this.toile.setPointerCapture(e.pointerId); } catch (err) { /* sans gravité */ }
    const p = this._position(e);
    this._pointeurs.set(e.pointerId, p);

    // Un outil de retouche est ouvert (yeux rouges, découpe…) : un doigt
    // est pour l'outil, deux doigts zooment et déplacent la vue.
    if (this.outil) { this._appuiOutil(p); return; }

    if (this._pointeurs.size === 1) {
      this._commencerUnDoigt(p);
    } else if (this._pointeurs.size === 2) {
      this._commencerDeuxDoigts();
    }
  },

  _appuiOutil(p) {
    if (this._pointeurs.size === 1) {
      // L'outil prend le doigt (tracé, point déplacé)… ou non : alors le
      // doigt déplace la vue, et un simple toucher est donné à l'outil.
      if (this.outil.appui && this.outil.appui(p)) this._geste = { type: 'outil', depart: p };
      else this._geste = { type: 'vue', depart: p, bouge: false, vx: this.vue.x, vy: this.vue.y, pourOutil: true };
    } else if (this._pointeurs.size === 2) {
      // Un 2e doigt arrive pendant un tracé : ce n'était pas un tracé,
      // mais le début d'un zoom. L'outil oublie ce bout de trait.
      if (this._geste && this._geste.type === 'outil' && this.outil.interrompre) this.outil.interrompre();
      const [a, b] = [...this._pointeurs.values()];
      this._geste = {
        type: 'deux-vue', milieu: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), vue: { ...this.vue }
      };
    }
  },

  _commencerUnDoigt(p) {
    const choisi = Montage.calqueChoisi();
    if (this._surPoignee(p.x, p.y)) {
      const centre = this.montageVersEcran(choisi.x, choisi.y);
      this._geste = {
        type: 'poignee', calque: choisi.id, depart: p, bouge: false,
        echelle: choisi.echelle, rotation: choisi.rotation,
        distance: Math.max(1, Math.hypot(p.x - centre.x, p.y - centre.y)),
        angle: Math.atan2(p.y - centre.y, p.x - centre.x)
      };
      Historique.debut();
      return;
    }
    const c = this.calqueSous(p.x, p.y);
    if (c) {
      const dejaChoisi = Montage.selection === c.id;
      if (!dejaChoisi) Montage.choisir(c.id);
      this._geste = { type: 'deplacer', calque: c.id, depart: p, bouge: false, dejaChoisi, x: c.x, y: c.y };
      Historique.debut();
      return;
    }
    // Dans le vide : déplacer la vue (ou enlever la sélection)
    this._geste = { type: 'vue', depart: p, bouge: false, vx: this.vue.x, vy: this.vue.y };
  },

  _commencerDeuxDoigts() {
    const [a, b] = [...this._pointeurs.values()];
    const milieu = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const c = Montage.calqueChoisi();
    if (c && !c.verrouille && c.visible) {
      Historique.debut();
      this._geste = { type: 'deux-calque', calque: c.id, milieu, distance, angle, x: c.x, y: c.y, echelle: c.echelle, rotation: c.rotation };
    } else {
      this._geste = { type: 'deux-vue', milieu, distance, vue: { ...this.vue } };
    }
  },

  _mouvement(e) {
    if (!this._pointeurs.has(e.pointerId)) return;
    e.preventDefault();
    const p = this._position(e);
    this._pointeurs.set(e.pointerId, p);
    const g = this._geste;
    if (!g) return;
    if (g.type === 'outil') { if (this._pointeurs.size === 1 && this.outil) this.outil.mouvement(p); return; }

    if (g.depart && !g.bouge && Math.hypot(p.x - g.depart.x, p.y - g.depart.y) > 6) g.bouge = true;

    if (g.type === 'deplacer' && g.bouge) {
      Montage.modifier(g.calque, {
        x: g.x + (p.x - g.depart.x) / this.vue.e,
        y: g.y + (p.y - g.depart.y) / this.vue.e
      });
    } else if (g.type === 'poignee' && g.bouge) {
      const c = Montage.calque(g.calque);
      if (!c) return;
      const centre = this.montageVersEcran(c.x, c.y);
      const d = Math.max(1, Math.hypot(p.x - centre.x, p.y - centre.y));
      const a = Math.atan2(p.y - centre.y, p.x - centre.x);
      Montage.modifier(g.calque, {
        echelle: g.echelle * (d / g.distance),
        rotation: aimanterAngle(g.rotation + ((a - g.angle) * 180) / Math.PI)
      });
    } else if (g.type === 'vue' && g.bouge) {
      this.vue.x = g.vx + (p.x - g.depart.x);
      this.vue.y = g.vy + (p.y - g.depart.y);
      this._vueAjustee = false;
      this.redessiner();
    } else if (g.type === 'deux-calque' || g.type === 'deux-vue') {
      if (this._pointeurs.size < 2) return;
      const [a, b] = [...this._pointeurs.values()];
      const milieu = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const facteur = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)) / g.distance;
      if (g.type === 'deux-calque') {
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        Montage.modifier(g.calque, {
          x: g.x + (milieu.x - g.milieu.x) / this.vue.e,
          y: g.y + (milieu.y - g.milieu.y) / this.vue.e,
          echelle: g.echelle * facteur,
          rotation: aimanterAngle(g.rotation + ((angle - g.angle) * 180) / Math.PI)
        });
      } else {
        // Zoom autour du milieu des deux doigts
        const v0 = g.vue;
        const e2 = limiter(v0.e * facteur, this._zoomMin(), this._zoomMax());
        const k = e2 / v0.e;
        this.vue = {
          e: e2,
          x: milieu.x - (g.milieu.x - v0.x) * k,
          y: milieu.y - (g.milieu.y - v0.y) * k
        };
        this._vueAjustee = false;
        this.redessiner();
      }
    }
  },

  _relache(e, annule = false) {
    if (!this._pointeurs.has(e.pointerId)) return;
    this._pointeurs.delete(e.pointerId);
    const g = this._geste;

    if (this._pointeurs.size > 0) {
      // On passe de deux doigts à un : on attend que tout soit relâché,
      // pour éviter un saut brusque du calque.
      if (g && g.type.startsWith('deux')) this._geste = { type: 'attente' };
      return;
    }
    this._geste = null;
    if (!g) return;

    if (g.type === 'outil') {
      if (this.outil && this.outil.relache) this.outil.relache(this._position(e), annule);
      return;
    }
    if (g.pourOutil) {
      // Un simple toucher avec un outil ouvert : c'est pour l'outil
      if (!annule && !g.bouge && this.outil && this.outil.toucher) this.outil.toucher(this._position(e));
      return;
    }

    if (!annule && !g.bouge) {
      // Un simple toucher (sans glisser)
      if (g.type === 'vue') Montage.choisir(null);
      if (g.type === 'deplacer' && g.dejaChoisi) {
        const c = Montage.calque(g.calque);
        if (c && c.type === 'texte') Panneaux.ouvrirTexte(c.id);   // toucher un texte déjà choisi = le modifier
      }
    }
    Historique.fin();
  },

  _molette(e) {
    if (!Montage.doc) return;
    e.preventDefault();
    const p = this._position(e);
    const e2 = limiter(this.vue.e * Math.exp(-e.deltaY * 0.0015), this._zoomMin(), this._zoomMax());
    const k = e2 / this.vue.e;
    this.vue = { e: e2, x: p.x - (p.x - this.vue.x) * k, y: p.y - (p.y - this.vue.y) * k };
    this._vueAjustee = false;
    this.redessiner();
  },

  _zoomMin() {
    const doc = Montage.doc, zone = this.toile.parentElement;
    return Math.min(zone.clientWidth / doc.largeur, zone.clientHeight / doc.hauteur) * 0.25;
  },
  _zoomMax() {
    return 16;   // un pixel de l'image = 16 pixels d'écran (pour la précision)
  }
};

/* « Aimant » : près de 0°, 90°, 180° ou -90°, l'angle se cale tout seul
   (à 4° près), pour remettre facilement un calque bien droit. */
function aimanterAngle(a) {
  a = normaliserAngle(a);
  for (const droit of [-180, -90, 0, 90, 180]) if (Math.abs(a - droit) < 4) return droit === -180 ? 180 : droit;
  return a;
}
