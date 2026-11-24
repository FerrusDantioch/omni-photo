/* Omni-Photo — © 2026 Ferrus Dantioch
   Licence : Creative Commons BY-NC-ND 4.0 (texte complet dans le fichier LICENSE)
   https://creativecommons.org/licenses/by-nc-nd/4.0/ */

/* ============================================================
   Harnais léger (zéro dépendance npm) pour exécuter les scripts
   globaux d'Omni-Photo dans node:vm avec un canvas pixel réel,
   un DOM léger, des minuteurs espionnables, MockURL et caches.
   ============================================================ */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function cssEscape(value) {
  const string = String(value);
  const length = string.length;
  let result = '';
  const firstCodeUnit = string.charCodeAt(0);
  for (let index = 0; index < length; index++) {
    const codeUnit = string.charCodeAt(index);
    if (codeUnit === 0x0000) { result += '\uFFFD'; continue; }
    if ((codeUnit >= 0x0001 && codeUnit <= 0x001F) || codeUnit === 0x007F ||
        (index === 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
        (index === 1 && codeUnit >= 0x0030 && codeUnit <= 0x0039 && firstCodeUnit === 0x002D)) {
      result += '\\' + codeUnit.toString(16) + ' ';
      continue;
    }
    if (index === 0 && length === 1 && codeUnit === 0x002D) { result += '\\' + string.charAt(index); continue; }
    if (codeUnit >= 0x0080 || codeUnit === 0x002D || codeUnit === 0x005F ||
        (codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
        (codeUnit >= 0x0041 && codeUnit <= 0x005A) ||
        (codeUnit >= 0x0061 && codeUnit <= 0x007A)) {
      result += string.charAt(index);
      continue;
    }
    result += '\\' + string.charAt(index);
  }
  return result;
}

function unescapeCssIdent(s) {
  return s.replace(/\\([0-9a-fA-F]{1,6})\s?|\\(.)/g, (_, hex, ch) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : ch));
}

function parseColor(style) {
  if (!style || typeof style !== 'string') return [0, 0, 0, 255];
  const s = style.trim();
  if (s === 'transparent') return [0, 0, 0, 0];
  let m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const h = m[1];
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16), 255];
  }
  m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const h = m[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255];
  }
  m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (m) {
    const a = m[4] === undefined ? 255 : Math.round(Math.max(0, Math.min(1, Number(m[4]))) * 255);
    return [Math.round(Number(m[1])), Math.round(Number(m[2])), Math.round(Number(m[3])), a];
  }
  return [0, 0, 0, 255];
}

function blendPixel(dst, idx, sr, sg, sb, sa, op) {
  const dr = dst[idx], dg = dst[idx + 1], db = dst[idx + 2], da = dst[idx + 3];
  if (op === 'copy') {
    dst[idx] = sr; dst[idx + 1] = sg; dst[idx + 2] = sb; dst[idx + 3] = sa;
    return;
  }
  if (op === 'destination-in') {
    const f = sa / 255;
    dst[idx + 3] = Math.round(da * f);
    return;
  }
  if (op === 'destination-out') {
    const f = 1 - sa / 255;
    dst[idx + 3] = Math.round(da * f);
    return;
  }
  if (op === 'source-in') {
    const f = da / 255;
    dst[idx] = sr; dst[idx + 1] = sg; dst[idx + 2] = sb; dst[idx + 3] = Math.round(sa * f);
    return;
  }
  // source-over
  if (sa === 0) return;
  if (sa === 255 || da === 0) {
    dst[idx] = sr; dst[idx + 1] = sg; dst[idx + 2] = sb; dst[idx + 3] = sa;
    return;
  }
  const aS = sa / 255, aD = da / 255;
  const aO = aS + aD * (1 - aS);
  dst[idx] = Math.round((sr * aS + dr * aD * (1 - aS)) / aO);
  dst[idx + 1] = Math.round((sg * aS + dg * aD * (1 - aS)) / aO);
  dst[idx + 2] = Math.round((sb * aS + db * aD * (1 - aS)) / aO);
  dst[idx + 3] = Math.round(aO * 255);
}

function distSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function pointInPolygon(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1];
    const xj = pts[j][0], yj = pts[j][1];
    if (((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

class MockContext2D {
  constructor(canvas, ownerCtx, opts = {}) {
    this.canvas = canvas;
    this._owner = ownerCtx;
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
    this.globalCompositeOperation = 'source-over';
    this.globalAlpha = 1;
    this.imageSmoothingEnabled = true;
    this.imageSmoothingQuality = 'low';
    this.shadowColor = 'transparent';
    this.shadowBlur = 0;
    this.shadowOffsetX = 0;
    this.shadowOffsetY = 0;
    if (!ownerCtx._safariFilter) this.filter = 'none';
    this._path = [];
    this._subpathStart = null;
    this._transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    this._stack = [];
  }

  save() {
    this._stack.push({
      fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth,
      globalCompositeOperation: this.globalCompositeOperation, globalAlpha: this.globalAlpha,
      filter: this.filter, transform: { ...this._transform }
    });
  }

  restore() {
    const s = this._stack.pop();
    if (s) Object.assign(this, s);
  }

  getTransform() { return { ...this._transform }; }
  setTransform(a, b, c, d, e, f) {
    if (typeof a === 'object') this._transform = { ...a };
    else this._transform = { a, b, c, d, e, f };
  }
  translate() {}
  scale() {}
  rotate() {}
  setLineDash() {}

  createImageData(w, h) {
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  }

  getImageData(sx, sy, sw, sh) {
    const w = this.canvas.width, h = this.canvas.height;
    const out = new Uint8ClampedArray(sw * sh * 4);
    for (let y = 0; y < sh; y++) {
      const yy = Math.floor(sy + y);
      if (yy < 0 || yy >= h) continue;
      for (let x = 0; x < sw; x++) {
        const xx = Math.floor(sx + x);
        if (xx < 0 || xx >= w) continue;
        const si = (yy * w + xx) * 4;
        const di = (y * sw + x) * 4;
        out[di] = this.canvas._pixels[si];
        out[di + 1] = this.canvas._pixels[si + 1];
        out[di + 2] = this.canvas._pixels[si + 2];
        out[di + 3] = this.canvas._pixels[si + 3];
      }
    }
    return { width: sw, height: sh, data: out };
  }

  putImageData(img, dx, dy) {
    const w = this.canvas.width, h = this.canvas.height;
    for (let y = 0; y < img.height; y++) {
      const yy = Math.floor(dy + y);
      if (yy < 0 || yy >= h) continue;
      for (let x = 0; x < img.width; x++) {
        const xx = Math.floor(dx + x);
        if (xx < 0 || xx >= w) continue;
        const si = (y * img.width + x) * 4;
        const di = (yy * w + xx) * 4;
        this.canvas._pixels[di] = img.data[si];
        this.canvas._pixels[di + 1] = img.data[si + 1];
        this.canvas._pixels[di + 2] = img.data[si + 2];
        this.canvas._pixels[di + 3] = img.data[si + 3];
      }
    }
  }

  clearRect(x, y, rw, rh) {
    const w = this.canvas.width, h = this.canvas.height;
    const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(w, Math.ceil(x + rw)), y1 = Math.min(h, Math.ceil(y + rh));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * w + xx) * 4;
        this.canvas._pixels[i] = this.canvas._pixels[i + 1] = this.canvas._pixels[i + 2] = this.canvas._pixels[i + 3] = 0;
      }
    }
  }

  fillRect(x, y, rw, rh) {
    const w = this.canvas.width, h = this.canvas.height;
    const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(w, Math.ceil(x + rw)), y1 = Math.min(h, Math.ceil(y + rh));
    const [r, g, b, a0] = typeof this.fillStyle === 'string' ? parseColor(this.fillStyle) : [0, 0, 0, 255];
    const sa = Math.round(a0 * this.globalAlpha);
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        blendPixel(this.canvas._pixels, (yy * w + xx) * 4, r, g, b, sa, this.globalCompositeOperation);
      }
    }
  }

  drawImage(img, ...args) {
    if (!img || !img.width || !img.height || !this.canvas.width || !this.canvas.height) return;
    let sx = 0, sy = 0, sw = img.width, sh = img.height, dx = 0, dy = 0, dw = img.width, dh = img.height;
    if (args.length === 2) { [dx, dy] = args; }
    else if (args.length === 4) { [dx, dy, dw, dh] = args; }
    else if (args.length === 8) { [sx, sy, sw, sh, dx, dy, dw, dh] = args; }
    if (dw <= 0 || dh <= 0 || sw <= 0 || sh <= 0) return;

    const srcPx = img._pixels || new Uint8ClampedArray(img.width * img.height * 4).fill(255);
    const w = this.canvas.width, h = this.canvas.height;
    const x0 = Math.max(0, Math.floor(dx)), y0 = Math.max(0, Math.floor(dy));
    const x1 = Math.min(w, Math.ceil(dx + dw)), y1 = Math.min(h, Math.ceil(dy + dh));
    const op = this.globalCompositeOperation;
    for (let yy = y0; yy < y1; yy++) {
      const fy = (yy + 0.5 - dy) / dh;
      const srcY = Math.max(0, Math.min(img.height - 1, Math.floor(sy + fy * sh)));
      for (let xx = x0; xx < x1; xx++) {
        const fx = (xx + 0.5 - dx) / dw;
        const srcX = Math.max(0, Math.min(img.width - 1, Math.floor(sx + fx * sw)));
        const si = (srcY * img.width + srcX) * 4;
        const sa = Math.round(srcPx[si + 3] * this.globalAlpha);
        blendPixel(this.canvas._pixels, (yy * w + xx) * 4, srcPx[si], srcPx[si + 1], srcPx[si + 2], sa, op);
      }
    }
  }

  createRadialGradient() { return { addColorStop() {} }; }
  createLinearGradient() { return { addColorStop() {} }; }
  measureText(text) { return { width: String(text || '').length * 10 }; }

  beginPath() { this._path = []; this._subpathStart = null; }
  moveTo(x, y) { this._subpathStart = [x, y]; this._path.push({ type: 'poly', pts: [[x, y]], closed: false }); }
  lineTo(x, y) {
    let cur = this._path[this._path.length - 1];
    if (!cur || cur.type !== 'poly') { this.moveTo(x, y); return; }
    cur.pts.push([x, y]);
  }
  closePath() {
    const cur = this._path[this._path.length - 1];
    if (cur && cur.type === 'poly' && cur.pts.length) {
      cur.closed = true;
    }
  }
  rect(x, y, w, h) {
    this._path.push({ type: 'poly', pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true });
  }
  arc(cx, cy, r) {
    this._path.push({ type: 'arc', cx, cy, r });
  }
  ellipse(cx, cy, rx, ry) {
    const pts = [];
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * Math.PI * 2;
      pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
    }
    this._path.push({ type: 'poly', pts, closed: true });
  }

  fill() {
    const w = this.canvas.width, h = this.canvas.height;
    const [r, g, b, a0] = typeof this.fillStyle === 'string' ? parseColor(this.fillStyle) : [0, 0, 0, 255];
    const sa = Math.round(a0 * this.globalAlpha);
    const op = this.globalCompositeOperation;
    for (const shape of this._path) {
      if (shape.type === 'arc') {
        const x0 = Math.max(0, Math.floor(shape.cx - shape.r)), x1 = Math.min(w, Math.ceil(shape.cx + shape.r));
        const y0 = Math.max(0, Math.floor(shape.cy - shape.r)), y1 = Math.min(h, Math.ceil(shape.cy + shape.r));
        const r2 = shape.r * shape.r;
        for (let yy = y0; yy < y1; yy++) {
          for (let xx = x0; xx < x1; xx++) {
            const dx = xx + 0.5 - shape.cx, dy = yy + 0.5 - shape.cy;
            if (dx * dx + dy * dy <= r2) blendPixel(this.canvas._pixels, (yy * w + xx) * 4, r, g, b, sa, op);
          }
        }
      } else if (shape.type === 'poly' && shape.pts.length >= 3) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [px, py] of shape.pts) {
          minX = Math.min(minX, px); minY = Math.min(minY, py);
          maxX = Math.max(maxX, px); maxY = Math.max(maxY, py);
        }
        const x0 = Math.max(0, Math.floor(minX)), x1 = Math.min(w, Math.ceil(maxX));
        const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(h, Math.ceil(maxY));
        for (let yy = y0; yy < y1; yy++) {
          for (let xx = x0; xx < x1; xx++) {
            if (pointInPolygon(xx + 0.5, yy + 0.5, shape.pts)) {
              blendPixel(this.canvas._pixels, (yy * w + xx) * 4, r, g, b, sa, op);
            }
          }
        }
      }
    }
  }

  stroke() {
    const w = this.canvas.width, h = this.canvas.height;
    const [r, g, b, a0] = typeof this.strokeStyle === 'string' ? parseColor(this.strokeStyle) : [0, 0, 0, 255];
    const sa = Math.round(a0 * this.globalAlpha);
    const half = Math.max(0.5, this.lineWidth / 2);
    const op = this.globalCompositeOperation;
    for (const shape of this._path) {
      if (shape.type !== 'poly' || shape.pts.length === 0) continue;
      const pts = shape.closed ? [...shape.pts, shape.pts[0]] : shape.pts;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [px, py] of pts) {
        minX = Math.min(minX, px - half); minY = Math.min(minY, py - half);
        maxX = Math.max(maxX, px + half); maxY = Math.max(maxY, py + half);
      }
      const x0 = Math.max(0, Math.floor(minX)), x1 = Math.min(w, Math.ceil(maxX));
      const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(h, Math.ceil(maxY));
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          let hit = false;
          if (pts.length === 1) {
            hit = Math.hypot(xx + 0.5 - pts[0][0], yy + 0.5 - pts[0][1]) <= half;
          } else {
            for (let i = 1; i < pts.length; i++) {
              if (distSegment(xx + 0.5, yy + 0.5, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= half) {
                hit = true; break;
              }
            }
          }
          if (hit) blendPixel(this.canvas._pixels, (yy * w + xx) * 4, r, g, b, sa, op);
        }
      }
    }
  }
}

export class MockCanvas {
  constructor(ownerCtx, width = 300, height = 150) {
    this.tagName = 'CANVAS';
    this._owner = ownerCtx;
    this._width = width;
    this._height = height;
    this._pixels = new Uint8ClampedArray(Math.max(0, width) * Math.max(0, height) * 4);
    this._ctx = null;
    this.style = {};
    this.dataset = {};
  }

  get width() { return this._width; }
  set width(v) {
    const n = Number(v) | 0;
    this._width = n;
    if (n === 0 || this._height === 0) {
      this._pixels = new Uint8ClampedArray(0);
      this._owner._zeroedCanvases.push(this);
    } else {
      this._pixels = new Uint8ClampedArray(n * this._height * 4);
    }
  }

  get height() { return this._height; }
  set height(v) {
    const n = Number(v) | 0;
    this._height = n;
    if (n === 0 || this._width === 0) {
      this._pixels = new Uint8ClampedArray(0);
      this._owner._zeroedCanvases.push(this);
    } else {
      this._pixels = new Uint8ClampedArray(this._width * n * 4);
    }
  }

  getContext(kind, opts) {
    if (kind !== '2d') return null;
    if (this._owner._onNewCanvasContext) {
      const res = this._owner._onNewCanvasContext(this, opts);
      if (res === null) return null;
    }
    if (!this._ctx) this._ctx = new MockContext2D(this, this._owner, opts);
    return this._ctx;
  }

  toBlob(cb, type, quality) {
    if (this._owner._onToBlob) {
      this._owner._onToBlob(this, cb, type, quality);
      return;
    }
    cb(new Blob([new Uint8Array([1, 2, 3, 4])], { type: type || 'image/png' }));
  }
}

export function creerToile(ownerCtx, w, h, fillRgba = null) {
  const c = new MockCanvas(ownerCtx, w, h);
  if (fillRgba) {
    for (let i = 0; i < w * h; i++) {
      c._pixels[i * 4] = fillRgba[0];
      c._pixels[i * 4 + 1] = fillRgba[1];
      c._pixels[i * 4 + 2] = fillRgba[2];
      c._pixels[i * 4 + 3] = fillRgba[3];
    }
  }
  return c;
}

class MockClassList {
  constructor(el) { this._el = el; this._set = new Set(); }
  add(...names) { for (const n of names) if (n) this._set.add(n); this._sync(); }
  remove(...names) { for (const n of names) this._set.delete(n); this._sync(); }
  toggle(n, force) {
    const on = force === undefined ? !this._set.has(n) : !!force;
    if (on) this._set.add(n); else this._set.delete(n);
    this._sync();
    return on;
  }
  contains(n) { return this._set.has(n); }
  _sync() { this._el._className = [...this._set].join(' '); }
}

export function creerEl(tag, ownerCtx, props = {}) {
  const listeners = new Map();
  let _parent = null;
  const el = {
    tagName: String(tag).toUpperCase(),
    id: '',
    name: '',
    type: '',
    value: '',
    min: '0',
    max: '100',
    checked: false,
    disabled: false,
    hidden: false,
    open: false,
    returnValue: '',
    textContent: '',
    innerHTML: '',
    _className: '',
    get className() { return this._className; },
    set className(v) {
      this._className = String(v || '');
      this.classList._set = new Set(this._className.split(/\s+/).filter(Boolean));
    },
    dataset: {},
    style: {},
    children: [],
    _attrs: new Map(),
    setAttribute(k, v) {
      this._attrs.set(k, String(v));
      if (k === 'id') this.id = String(v);
      else if (k.startsWith('data-')) {
        const camel = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        this.dataset[camel] = String(v);
      }
    },
    getAttribute(k) {
      if (k === 'id' && this.id) return this.id;
      return this._attrs.has(k) ? this._attrs.get(k) : null;
    },
    hasAttribute(k) { return this._attrs.has(k); },
    get parentElement() {
      if (!_parent) {
        const out = creerEl('output', ownerCtx);
        _parent = {
          clientWidth: 800,
          clientHeight: 600,
          querySelector(s) { return s === 'output' ? out : null; },
          _output: out
        };
      }
      return _parent;
    },
    set parentElement(p) { _parent = p; },
    append(...nodes) {
      for (const n of nodes) {
        if (typeof n === 'object' && n) {
          this.children.push(n);
          n.parentElement = this;
        }
      }
    },
    appendChild(n) { this.append(n); return n; },
    remove() {},
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type);
      if (!list) return;
      const idx = list.indexOf(fn);
      if (idx >= 0) list.splice(idx, 1);
    },
    dispatchEvent(ev) {
      if (!ev || typeof ev !== 'object') return true;
      if (!ev.target) ev.target = el;
      for (const fn of [...(listeners.get(ev.type) || [])]) fn(ev);
      if (ev.bubbles && _parent && typeof _parent.dispatchEvent === 'function') {
        _parent.dispatchEvent(ev);
      }
      return true;
    },
    click() { this.dispatchEvent({ type: 'click', target: el, bubbles: true }); },
    showModal() { this.open = true; },
    close(val) {
      if (val !== undefined) this.returnValue = val;
      this.open = false;
      this.dispatchEvent({ type: 'close', target: el });
    },
    focus() {},
    select() {},
    closest(sel) {
      let cur = this;
      while (cur && cur.matches) {
        if (cur.matches(sel)) return cur;
        cur = cur === _parent ? null : _parent;
      }
      return null;
    },
    matches(sel) { return matchesSimple(this, sel); },
    querySelector(sel) { return findInTree(this, sel)[0] || null; },
    querySelectorAll(sel) { return findInTree(this, sel); }
  };
  el.classList = new MockClassList(el);
  Object.assign(el, props);
  return el;
}

function matchesSimple(el, sel) {
  if (!el || typeof el !== 'object') return false;
  let s = sel.trim();
  const checkedOnly = s.endsWith(':checked');
  if (checkedOnly) s = s.slice(0, -':checked'.length);
  if (checkedOnly && !el.checked) return false;

  const idMatch = s.match(/^#(.+)$/);
  if (idMatch && !s.includes('[')) {
    return el.id === unescapeCssIdent(idMatch[1]);
  }
  const classMatch = s.match(/^\.([a-z0-9_-]+)$/i);
  if (classMatch) return el.classList && el.classList.contains(classMatch[1]);

  // Extract tag, classes, and [attr="val"] predicates
  const rest = s.replace(/\[(?:\\.|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\]])*\]/g, '').trim();
  if (rest) {
    const parts = rest.split('.');
    const tag = parts[0];
    if (tag && el.tagName && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    for (const cls of parts.slice(1)) {
      if (cls && !(el.classList && el.classList.contains(cls))) return false;
    }
  }
  for (const m of s.matchAll(/\[([^=\]]+)(?:=["']((?:\\.|[^"'\\])*)["'])?\]/g)) {
    const attr = m[1].trim();
    const expected = m[2] !== undefined ? unescapeCssIdent(m[2]) : null;
    let actual = null;
    if (attr === 'name') actual = el.name;
    else if (attr === 'value') actual = el.value;
    else if (attr.startsWith('data-')) {
      const camel = attr.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      actual = el.dataset ? el.dataset[camel] : undefined;
    } else if (el.getAttribute) {
      actual = el.getAttribute(attr);
    }
    if (expected === null) {
      if (actual === undefined || actual === null || actual === '') return false;
    } else if (String(actual) !== expected) {
      return false;
    }
  }
  return true;
}

function findInTree(root, sel) {
  const parts = sel.trim().split(/\s+/);
  const results = [];
  const walk = (node) => {
    for (const ch of node.children || []) {
      if (parts.length === 1) {
        if (matchesSimple(ch, parts[0])) results.push(ch);
      } else if (matchesSimple(ch, parts[parts.length - 1])) {
        // Check ancestor match for 2-part selector
        let anc = ch.parentElement;
        let ok = false;
        while (anc) {
          if (matchesSimple(anc, parts[0])) { ok = true; break; }
          anc = anc.parentElement;
        }
        if (ok) results.push(ch);
      }
      walk(ch);
    }
  };
  walk(root);
  return results;
}

export function creerMocksCaches(scope = 'https://ferrusdantioch.github.io/omni-photo/') {
  const stores = new Map();
  const opened = new Set();
  const normKey = (req) => {
    const raw = typeof req === 'string' ? req : req.url;
    return new URL(raw, scope).href;
  };
  const stripQuery = (u) => u.split('?')[0];

  function creerStore(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const map = stores.get(name);
    return {
      async match(req, opts = {}) {
        const key = normKey(req);
        if (map.has(key)) return map.get(key);
        if (opts && opts.ignoreSearch) {
          const base = stripQuery(key);
          for (const [k, v] of map.entries()) {
            if (stripQuery(k) === base) return v;
          }
        }
        return undefined;
      },
      async put(req, res) { map.set(normKey(req), res); },
      async delete(req) { return map.delete(normKey(req)); },
      async keys() { return [...map.keys()].map((url) => ({ url })); },
      async addAll(reqs) {
        for (const r of reqs) {
          await this.put(r, new Response('cached:' + normKey(r), { status: 200 }));
        }
      }
    };
  }

  return {
    _stores: stores,
    _opened: opened,
    async keys() { return [...stores.keys()]; },
    async open(name) { opened.add(name); return creerStore(name); },
    async delete(name) { return stores.delete(name); },
    async match(req, opts) {
      for (const name of stores.keys()) {
        const hit = await creerStore(name).match(req, opts);
        if (hit) return hit;
      }
      return undefined;
    }
  };
}

export function creerContexte(overrides = {}) {
  const scope = overrides.scope || 'https://ferrusdantioch.github.io/omni-photo/';
  const createdUrls = [];
  const revokedUrls = [];
  let urlCounter = 0;

  class MockURL extends globalThis.URL {
    static createObjectURL(blob) {
      const u = `blob:mock/${++urlCounter}`;
      createdUrls.push({ url: u, blob });
      return u;
    }
    static revokeObjectURL(url) {
      revokedUrls.push(url);
    }
  }

  class MockRequest {
    constructor(input, init = {}) {
      const base = typeof input === 'string' ? input : (input && input.url) || '';
      this.url = new globalThis.URL(base, scope).href;
      this.method = (init.method || (input && input.method) || 'GET').toUpperCase();
      this.cache = init.cache || 'default';
      this.mode = init.mode || 'same-origin';
      this.headers = new Headers(init.headers || (input && input.headers));
      this._formData = init.formData || null;
    }
    async formData() {
      if (this._formData instanceof Error) throw this._formData;
      return this._formData || new FormData();
    }
  }

  const scheduledTimers = [];
  let timerSeq = 0;
  const mockSetTimeout = (fn, ms = 0, ...args) => {
    const id = ++timerSeq;
    const entry = { id, ms, fn: () => fn(...args), cleared: false, fired: false };
    scheduledTimers.push(entry);
    const native = globalThis.setTimeout(() => {
      if (!entry.cleared && !entry.fired) {
        entry.fired = true;
        entry.fn();
      }
    }, ms);
    if (native && typeof native.unref === 'function') native.unref();
    entry._native = native;
    return entry;
  };
  const mockClearTimeout = (handle) => {
    if (!handle || typeof handle !== 'object') return;
    handle.cleared = true;
    globalThis.clearTimeout(handle._native);
  };

  const intervalTimers = [];
  const mockSetInterval = (fn, ms = 0, ...args) => {
    const native = globalThis.setInterval(() => fn(...args), ms);
    if (native && typeof native.unref === 'function') native.unref();
    intervalTimers.push(native);
    return native;
  };
  const mockClearInterval = (h) => globalThis.clearInterval(h);

  const listeners = new Map();
  const elements = [];
  const queriedSelectors = [];
  const zeroedCanvases = [];

  const ctx = {
    _safariFilter: !!overrides.safariFilter,
    _createdUrls: createdUrls,
    _revokedUrls: revokedUrls,
    _scheduledTimers: scheduledTimers,
    _zeroedCanvases: zeroedCanvases,
    _queriedSelectors: queriedSelectors,
    _elements: elements,
    _onNewCanvasContext: overrides.onNewCanvasContext || null,
    _onToBlob: overrides.onToBlob || null,
    Blob, File, Headers, FormData, Response, Request: MockRequest,
    TextEncoder, TextDecoder, WebAssembly,
    Uint8Array, Uint8ClampedArray, Int32Array, Float32Array, Uint32Array, ArrayBuffer, DataView,
    Error, TypeError, RangeError, Promise, Map, Set, Math, Date, JSON, RegExp, Number, String, Boolean, Array, Object,
    URL: MockURL,
    CSS: { escape: cssEscape },
    console: overrides.console || console,
    performance: overrides.performance || performance,
    navigator: overrides.navigator || { onLine: true, storage: { persist: async () => true } },
    localStorage: overrides.localStorage || (() => {
      const m = new Map();
      return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: (k) => m.delete(k)
      };
    })(),
    location: overrides.location || new globalThis.URL(scope),
    history: overrides.history || {
      state: null,
      replaceState(s) { this.state = s; },
      pushState(s) { this.state = s; },
      back() {}
    },
    Event: class MockEvent { constructor(type, opts = {}) { this.type = type; this.bubbles = !!opts.bubbles; } },
    setTimeout: mockSetTimeout,
    clearTimeout: mockClearTimeout,
    setInterval: mockSetInterval,
    clearInterval: mockClearInterval,
    requestAnimationFrame: (cb) => mockSetTimeout(() => cb(performance.now()), 0),
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    dispatchEvent(type, ev) {
      const promises = [];
      for (const fn of listeners.get(type) || []) {
        const res = fn(ev);
        if (res && typeof res.then === 'function') promises.push(res);
      }
      return promises;
    },
    caches: overrides.caches || creerMocksCaches(scope),
    fetch: overrides.fetch || (async () => new Response('', { status: 404 })),
    ...overrides
  };

  const doc = {
    body: creerEl('body', ctx),
    head: creerEl('head', ctx),
    documentElement: creerEl('html', ctx),
    activeElement: null,
    _selectors: new Map(),
    _register(el) { elements.push(el); return el; },
    createElement(tag) {
      if (String(tag).toLowerCase() === 'canvas') return new MockCanvas(ctx, 300, 150);
      return creerEl(tag, ctx);
    },
    createElementNS(ns, tag) { return creerEl(tag, ctx); },
    createTextNode(t) { return { nodeType: 3, textContent: String(t) }; },
    getElementById(id) {
      return elements.find((e) => e.id === id) || this._selectors.get('#' + id) || null;
    },
    querySelector(sel) {
      queriedSelectors.push(sel);
      if (this._selectors.has(sel)) return this._selectors.get(sel);
      for (const el of elements) {
        if (matchesSimple(el, sel)) return el;
        const found = findInTree(el, sel)[0];
        if (found) return found;
      }
      if (overrides.autoCreateElements !== false) {
        // Fallback auto-element for unmocked UI controls
        const mId = sel.match(/^#([a-z0-9_-]+)$/i);
        if (mId) {
          const el = creerEl('div', ctx, { id: mId[1] });
          elements.push(el);
          return el;
        }
        const mAction = sel.match(/^\[data-action="([^"]+)"\]/);
        if (mAction) {
          const el = creerEl('button', ctx);
          el.dataset.action = mAction[1];
          elements.push(el);
          return el;
        }
      }
      return null;
    },
    querySelectorAll(sel) {
      queriedSelectors.push(sel);
      const out = [];
      for (const el of elements) {
        if (matchesSimple(el, sel)) out.push(el);
        for (const sub of findInTree(el, sel)) out.push(sub);
      }
      return out;
    },
    addEventListener() {},
    removeEventListener() {}
  };
  if (!ctx.document) ctx.document = doc;
  ctx.window = ctx;
  ctx.self = ctx;

  vm.createContext(ctx);
  return ctx;
}

export function chargerScripts(ctx, fichiers) {
  for (const f of fichiers) {
    const code = fs.readFileSync(path.join(RACINE, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }
}

export function lireSymbole(ctx, expr) {
  return vm.runInContext(expr, ctx);
}

export function executer(ctx, code) {
  return vm.runInContext(code, ctx);
}

export function avancerMinuteur(ctx, minMs = 0) {
  let count = 0;
  for (const entry of [...ctx._scheduledTimers]) {
    if (!entry.cleared && !entry.fired && entry.ms >= minMs) {
      entry.fired = true;
      globalThis.clearTimeout(entry._native);
      entry.fn();
      count++;
    }
  }
  return count;
}

export function annulerMinuteurs(ctx) {
  for (const entry of ctx._scheduledTimers) {
    entry.cleared = true;
    globalThis.clearTimeout(entry._native);
  }
}
