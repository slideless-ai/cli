/**
 * Annotation overlay client.
 *
 * Served by `slideless dev` at `/__slideless_annotate.js` and injected into
 * every served HTML page (alongside the live-reload snippet). It lets you
 * select text in the browser, attach a remark, and persist it to
 * `.slideless/annotations.json` via the dev server. Gathering only — nothing
 * here applies changes to the deck.
 *
 * Authored as a plain-JS string (no template literals / `${...}` inside) so
 * the surrounding TypeScript template literal stays clean and `tsc` needs no
 * asset-copy step. The transport layer (the `api*` helpers) is isolated so the
 * same overlay can later target the hosted app via postMessage.
 *
 * Theming follows the browser's `prefers-color-scheme` (light/dark).
 */

export const ANNOTATE_CLIENT_PATH = '/__slideless_annotate.js';
export const ANNOTATIONS_API_PATH = '/__slideless_annotations';

export const ANNOTATION_CLIENT_JS = `(function () {
  'use strict';
  if (window.__slidelessAnnotatorLoaded) return;
  window.__slidelessAnnotatorLoaded = true;

  var API = '${ANNOTATIONS_API_PATH}';
  var CONTEXT_CHARS = 40;
  var ENTRY = (window.__slidelessAnnotate && window.__slidelessAnnotate.entry) || '';

  // The deck-relative path of the page currently shown (mirrors the server's
  // pathToEntryFile: a directory request resolves to its entry file).
  function currentPage() {
    var p;
    try { p = decodeURIComponent(location.pathname); } catch (_) { p = location.pathname; }
    p = p.replace(/^[/]+/, '');
    if (p === '' || p.charAt(p.length - 1) === '/') p += ENTRY;
    return p;
  }
  function isSamePage(entryFile) {
    return !entryFile || currentPage() === entryFile;
  }

  // ---- State ------------------------------------------------------------
  var notes = [];
  var filter = 'open'; // 'open' | 'done'
  var snapshot = null; // pending selection captured for the popover
  var openMenuEl = null; // the currently-open per-item action menu
  var seenIds = null; // ids already rendered once (so only new notes animate in)
  var toast = null; // transient bottom toast element

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toast.classList.remove('show'); }, 2800);
  }

  // ---- Icons (feather-style, inherit currentColor) ----------------------
  var ICONS = {
    mark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    jump: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>',
    done: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
    remove: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>',
  };

  // ---- Transport (the only seam that would change for a hosted backend) -
  function apiList() {
    return fetch(API, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : { annotations: [] }; })
      .catch(function () { return { annotations: [] }; });
  }
  function apiCreate(body) {
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); });
  }
  function apiUpdate(id, patch) {
    return fetch(API + '?id=' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then(function (r) { return r.json(); });
  }
  function apiDelete(id) {
    return fetch(API + '?id=' + encodeURIComponent(id), { method: 'DELETE' });
  }

  // ---- Anchor + context capture ----------------------------------------
  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');
  }
  function parseIdx(v) { var n = parseInt(v, 10); return isNaN(n) ? null : n; }

  function elementOf(range) {
    var n = range.startContainer;
    return n.nodeType === 1 ? n : n.parentElement;
  }
  function findContainer(el) {
    var node = el;
    while (node && node.nodeType) {
      if (node.nodeType === 1 && node.hasAttribute) {
        if (node.hasAttribute('data-slide'))
          return { el: node, kind: 'slide', index: parseIdx(node.getAttribute('data-slide')) };
        if (node.hasAttribute('data-panel'))
          return { el: node, kind: 'panel', index: parseIdx(node.getAttribute('data-panel')) };
      }
      node = node.parentNode;
    }
    return null;
  }
  function headingOf(el) {
    if (!el) return null;
    var h = el.querySelector('h1,h2,h3,h4,.headline,.title');
    return h ? h.textContent.trim().slice(0, 120) : null;
  }
  function buildSelector(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.id) return '#' + cssEscape(el.id);
    var parts = [];
    var node = el;
    var stop = 0;
    while (node && node.nodeType === 1 && node !== document.body && stop < 6) {
      if (node.id) { parts.unshift('#' + cssEscape(node.id)); break; }
      if (node.hasAttribute && node.hasAttribute('data-slide')) {
        parts.unshift('[data-slide="' + node.getAttribute('data-slide') + '"]'); break;
      }
      if (node.hasAttribute && node.hasAttribute('data-panel')) {
        parts.unshift('[data-panel="' + node.getAttribute('data-panel') + '"]'); break;
      }
      var part = node.tagName.toLowerCase();
      var parent = node.parentNode;
      if (parent && parent.children) {
        var same = [];
        for (var i = 0; i < parent.children.length; i++) {
          if (parent.children[i].tagName === node.tagName) same.push(parent.children[i]);
        }
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      node = node.parentNode;
      stop++;
    }
    return parts.join(' > ');
  }
  function getContext(range) {
    var before = '', after = '';
    try {
      var s = range.startContainer;
      if (s.nodeType === 3) {
        before = s.textContent.slice(Math.max(0, range.startOffset - CONTEXT_CHARS), range.startOffset);
      }
      var e = range.endContainer;
      if (e.nodeType === 3) {
        after = e.textContent.slice(range.endOffset, range.endOffset + CONTEXT_CHARS);
      }
    } catch (_) {}
    return { before: before, after: after };
  }
  function buildAnchor(range) {
    var el = elementOf(range);
    var c = findContainer(el);
    return {
      container: {
        kind: c ? c.kind : null,
        index: c ? c.index : null,
        heading: c ? headingOf(c.el) : null,
      },
      selector: buildSelector(el),
    };
  }

  // ---- Jump-to (best-effort) -------------------------------------------
  function findTextInElement(root, text) {
    if (!text) return null;
    var needle = text.trim().slice(0, 60);
    if (!needle) return null;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      if (node.textContent && node.textContent.indexOf(needle) !== -1) {
        return node.parentElement;
      }
    }
    return null;
  }
  function resolveTarget(a) {
    if (a.anchor && a.anchor.selector) {
      try { var el = document.querySelector(a.anchor.selector); if (el) return el; } catch (_) {}
    }
    var c = a.anchor && a.anchor.container;
    if (c && c.index != null && c.kind) {
      try {
        var cont = document.querySelector('[data-' + c.kind + '="' + c.index + '"]');
        if (cont) {
          var hit = findTextInElement(cont, a.selectedText);
          return hit || cont;
        }
      } catch (_) {}
    }
    return null;
  }
  function flash(el) {
    el.classList.add('__sl-anno-flash');
    setTimeout(function () { el.classList.remove('__sl-anno-flash'); }, 1600);
  }
  function jumpTo(a) {
    // On a different page of a multi-page deck: navigate there, carrying the
    // note id in the hash so the destination page scrolls to it on load.
    if (!isSamePage(a.entryFile)) {
      location.assign('/' + a.entryFile + '#__slanno=' + encodeURIComponent(a.id));
      return true;
    }
    var target = resolveTarget(a);
    if (!target) {
      showToast('That section no longer exists in the deck.');
      return false;
    }
    try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) { target.scrollIntoView(); }
    flash(target);
    return true;
  }

  // After a cross-page navigation, scroll to the note named in the URL hash.
  function jumpFromHash() {
    var m = /__slanno=([^&]+)/.exec(location.hash || '');
    if (!m) return;
    var id;
    try { id = decodeURIComponent(m[1]); } catch (_) { id = m[1]; }
    try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
    var a = null;
    for (var i = 0; i < notes.length; i++) { if (notes[i].id === id) { a = notes[i]; break; } }
    if (a) setTimeout(function () { jumpTo(a); }, 250);
  }

  // ---- DOM helpers ------------------------------------------------------
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function iconBtn(cls, iconKey, label) {
    var a = el('a', cls);
    a.innerHTML = ICONS[iconKey];
    a.appendChild(el('span', null, label));
    return a;
  }

  // ---- Root + styles ----------------------------------------------------
  var root = el('div');
  root.id = '__slideless_annotator';
  var style = document.createElement('style');
  style.textContent = [
    '#__slideless_annotator{',
    '  --sl-bg:#17171d; --sl-bg2:#1f1f28; --sl-ink:#ededf2; --sl-muted:#9b9baa;',
    '  --sl-border:#2b2b36; --sl-border2:#363643; --sl-accent:#f5b301; --sl-accent-ink:#1a1505;',
    '  --sl-danger:#e0625e; --sl-shadow:0 12px 40px rgba(0,0,0,.46);',
    '  position:fixed; z-index:2147483000;',
    '  font:13px/1.45 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
    '  color:var(--sl-ink); -webkit-font-smoothing:antialiased;}',
    '@media (prefers-color-scheme: light){#__slideless_annotator{',
    '  --sl-bg:#ffffff; --sl-bg2:#f6f6f9; --sl-ink:#1d1d24; --sl-muted:#6c6c78;',
    '  --sl-border:#e6e6ec; --sl-border2:#dadae2; --sl-shadow:0 12px 40px rgba(20,20,40,.16);}}',
    '#__slideless_annotator *{box-sizing:border-box;}',
    '#__slideless_annotator svg{width:15px;height:15px;display:block;flex:none;}',

    // Flash highlight on jump-to. The class lands on DECK elements (outside the
    // overlay), so colors must be literal — CSS vars scoped to the overlay are
    // out of scope here. Outline stays visible even when an ancestor clips the
    // box-shadow; the pulse fades it out smoothly.
    '@keyframes __sl-anno-pulse{0%{outline-color:#f5b301;box-shadow:0 0 0 6px rgba(245,179,1,.34);}',
    '  68%{outline-color:#f5b301;box-shadow:0 0 0 6px rgba(245,179,1,.16);}',
    '  100%{outline-color:rgba(245,179,1,0);box-shadow:0 0 0 12px rgba(245,179,1,0);}}',
    '.__sl-anno-flash{border-radius:5px;outline:2px solid #f5b301;outline-offset:3px;',
    '  animation:__sl-anno-pulse 1.5s ease-out forwards;}',

    // Floating "Add note" button at the selection
    '#__sl-anno-add{position:fixed;display:none;align-items:center;gap:7px;transform:translateY(7px);',
    '  background:var(--sl-accent);color:var(--sl-accent-ink);border:0;border-radius:9px;',
    '  padding:8px 12px;font:600 12.5px/1 inherit;cursor:pointer;box-shadow:var(--sl-shadow);}',
    '#__sl-anno-add svg{width:14px;height:14px;}',
    '#__sl-anno-add:hover{filter:brightness(1.05);}',

    // Capture popover
    '#__sl-anno-pop{position:fixed;display:none;width:300px;background:var(--sl-bg);',
    '  border:1px solid var(--sl-border);border-radius:14px;padding:14px;box-shadow:var(--sl-shadow);}',
    '#__sl-anno-pop .__sl-cap{font:600 11px/1 inherit;letter-spacing:.06em;text-transform:uppercase;',
    '  color:var(--sl-muted);margin-bottom:9px;}',
    '#__sl-anno-pop .__sl-quote{font-size:12px;color:var(--sl-muted);margin-bottom:10px;max-height:46px;',
    '  overflow:hidden;border-left:2px solid var(--sl-accent);padding-left:9px;font-style:italic;}',
    '#__sl-anno-pop textarea{width:100%;min-height:74px;resize:vertical;background:var(--sl-bg2);',
    '  color:var(--sl-ink);border:1px solid var(--sl-border);border-radius:9px;padding:9px;font:inherit;}',
    '#__sl-anno-pop textarea:focus{outline:none;border-color:var(--sl-accent);}',
    '#__sl-anno-pop .__sl-row{display:flex;gap:8px;justify-content:flex-end;margin-top:11px;}',
    '.__sl-btn{border:0;border-radius:8px;padding:7px 14px;cursor:pointer;font:600 12.5px/1 inherit;}',
    '.__sl-btn-primary{background:var(--sl-accent);color:var(--sl-accent-ink);}',
    '.__sl-btn-primary:hover{filter:brightness(1.05);}',
    '.__sl-btn-ghost{background:transparent;color:var(--sl-muted);border:1px solid var(--sl-border);}',
    '.__sl-btn-ghost:hover{color:var(--sl-ink);border-color:var(--sl-border2);}',

    // Bottom-right badge that expands to explain itself
    '#__sl-anno-badge{position:fixed;right:20px;bottom:20px;display:inline-flex;align-items:center;',
    '  background:var(--sl-bg);border:1px solid var(--sl-border);border-radius:999px;padding:10px 13px;',
    '  cursor:pointer;box-shadow:var(--sl-shadow);user-select:none;color:var(--sl-ink);}',
    '#__sl-anno-badge:hover{border-color:var(--sl-border2);}',
    '#__sl-anno-badge .__sl-bicon{display:flex;color:var(--sl-accent);}',
    '#__sl-anno-badge .__sl-bicon svg{width:18px;height:18px;}',
    // Label width animates via grid (0fr->1fr) so the easing tracks the real
    // label width — smoother than animating a fixed max-width past the content.
    '#__sl-anno-badge .__sl-blabel{display:grid;grid-template-columns:0fr;opacity:0;margin:0;',
    '  transition:grid-template-columns .5s cubic-bezier(.22,1,.36,1),opacity .36s ease,margin .5s cubic-bezier(.22,1,.36,1);}',
    '#__sl-anno-badge .__sl-blabel>span{overflow:hidden;white-space:nowrap;font-weight:500;}',
    '#__sl-anno-badge.__sl-open .__sl-blabel,#__sl-anno-badge:hover .__sl-blabel{',
    '  grid-template-columns:1fr;opacity:1;margin:0 11px;}',
    '#__sl-anno-badge .__sl-bcount{display:none;min-width:20px;height:20px;padding:0 6px;border-radius:999px;',
    '  margin-left:10px;background:var(--sl-accent);color:var(--sl-accent-ink);font:700 11px/20px inherit;',
    '  text-align:center;transition:margin .5s cubic-bezier(.22,1,.36,1);}',
    '#__sl-anno-badge.__sl-has .__sl-bcount{display:inline-block;}',
    '#__sl-anno-badge.__sl-open .__sl-bcount,#__sl-anno-badge:hover .__sl-bcount{margin-left:0;}',

    // Review panel
    '#__sl-anno-panel{position:fixed;top:0;right:0;height:100%;width:360px;max-width:92vw;',
    '  background:var(--sl-bg);border-left:1px solid var(--sl-border);box-shadow:var(--sl-shadow);',
    '  transform:translateX(100%);transition:transform .26s cubic-bezier(.2,.8,.2,1);',
    '  display:flex;flex-direction:column;}',
    '#__sl-anno-panel.open{transform:translateX(0);}',
    '#__sl-anno-panel .__sl-head{display:flex;align-items:center;justify-content:space-between;',
    '  padding:16px 16px 12px;}',
    '#__sl-anno-panel .__sl-head strong{font-size:15px;font-weight:650;}',
    '#__sl-anno-panel .__sl-x{display:flex;align-items:center;justify-content:center;width:30px;height:30px;',
    '  border-radius:8px;cursor:pointer;color:var(--sl-muted);}',
    '#__sl-anno-panel .__sl-x:hover{background:var(--sl-bg2);color:var(--sl-ink);}',
    '#__sl-anno-tabs{display:flex;gap:4px;margin:2px 16px 8px;padding:3px;background:var(--sl-bg2);',
    '  border-radius:10px;}',
    '.__sl-tab{flex:1;display:flex;align-items:center;justify-content:center;gap:5px;text-align:center;',
    '  padding:7px;border-radius:8px;cursor:pointer;color:var(--sl-muted);',
    '  font-weight:600;font-size:12.5px;transition:background .15s,color .15s;}',
    '.__sl-tab:hover{color:var(--sl-ink);}',
    '.__sl-tab.active{background:var(--sl-bg);color:var(--sl-ink);box-shadow:0 1px 3px rgba(0,0,0,.16);}',
    '.__sl-tab .__sl-tcount{opacity:.55;font-weight:600;}',
    '#__sl-anno-list{flex:1;overflow:auto;padding:6px 16px 20px;}',
    '.__sl-item{position:relative;background:var(--sl-bg2);border:1px solid var(--sl-border);',
    '  border-radius:12px;padding:12px;margin-bottom:10px;cursor:pointer;',
    '  transition:border-color .15s,background .15s;}',
    '.__sl-item:hover{border-color:var(--sl-border2);}',
    '.__sl-item .__sl-ihead{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;}',
    '.__sl-item .__sl-where{font-size:11px;color:var(--sl-muted);margin-bottom:7px;font-weight:500;flex:1;}',
    '.__sl-item .__sl-quote{font-size:11.5px;color:var(--sl-muted);border-left:2px solid var(--sl-border2);',
    '  padding-left:8px;margin-bottom:8px;max-height:36px;overflow:hidden;font-style:italic;}',
    '.__sl-item .__sl-note{white-space:pre-wrap;word-break:break-word;font-size:13.5px;}',
    // Enter (new note) / leave (removed or moved to other tab) animations.
    '@keyframes __sl-anno-in{from{opacity:0;transform:translateY(-7px) scale(.96);}to{opacity:1;transform:none;}}',
    '@keyframes __sl-anno-out{from{opacity:1;transform:none;max-height:340px;}',
    '  to{opacity:0;transform:scale(.95);max-height:0;margin-bottom:0;padding-top:0;padding-bottom:0;border-width:0;}}',
    '.__sl-item.__sl-enter{animation:__sl-anno-in .28s cubic-bezier(.2,.8,.2,1);}',
    '.__sl-item.__sl-leave{overflow:hidden;pointer-events:none;animation:__sl-anno-out .26s ease forwards;}',
    '@media (prefers-reduced-motion: reduce){.__sl-item.__sl-enter,.__sl-item.__sl-leave{animation:none;}}',
    '.__sl-item textarea{width:100%;background:var(--sl-bg);color:var(--sl-ink);border:1px solid var(--sl-border);',
    '  border-radius:8px;padding:8px;font:inherit;min-height:54px;resize:vertical;}',
    '.__sl-item textarea:focus{outline:none;border-color:var(--sl-accent);}',
    // Kebab trigger + popover menu
    '.__sl-kebab{flex:none;display:flex;align-items:center;justify-content:center;width:26px;height:26px;',
    '  margin:-3px -3px 0 0;border-radius:7px;cursor:pointer;color:var(--sl-muted);}',
    '.__sl-kebab:hover{background:var(--sl-bg);color:var(--sl-ink);}',
    '.__sl-kebab svg{width:16px;height:16px;}',
    '.__sl-menu{display:none;position:absolute;right:10px;top:34px;z-index:5;min-width:166px;',
    '  background:var(--sl-bg);border:1px solid var(--sl-border);border-radius:10px;padding:5px;',
    '  box-shadow:var(--sl-shadow);}',
    '.__sl-menu.open{display:block;}',
    '.__sl-menu a{display:flex;align-items:center;gap:10px;padding:8px 9px;border-radius:7px;cursor:pointer;',
    '  color:var(--sl-ink);font-size:12.5px;}',
    '.__sl-menu a:hover{background:var(--sl-bg2);}',
    '.__sl-menu a svg{width:14px;height:14px;color:var(--sl-muted);}',
    '.__sl-menu a.__sl-danger{color:var(--sl-danger);}',
    '.__sl-menu a.__sl-danger svg{color:var(--sl-danger);}',
    '.__sl-menu a.__sl-danger:hover{background:rgba(224,98,94,.12);}',
    '.__sl-menu .__sl-sep{height:1px;background:var(--sl-border);margin:4px 2px;}',
    '.__sl-empty{display:flex;flex-direction:column;align-items:center;gap:12px;color:var(--sl-muted);',
    '  text-align:center;padding:48px 18px;}',
    '.__sl-empty svg{width:34px;height:34px;opacity:.5;}',
    // Transient toast (e.g. when a jumped-to section no longer exists)
    '#__sl-anno-toast{position:fixed;left:50%;bottom:80px;transform:translateX(-50%) translateY(10px);',
    '  background:var(--sl-bg);color:var(--sl-ink);border:1px solid var(--sl-border);border-radius:10px;',
    '  padding:10px 15px;font-size:12.5px;font-weight:500;box-shadow:var(--sl-shadow);opacity:0;',
    '  pointer-events:none;max-width:80vw;transition:opacity .25s ease,transform .25s ease;}',
    '#__sl-anno-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}',
  ].join('\\n');

  // ---- Add button + popover --------------------------------------------
  var addBtn = el('button');
  addBtn.id = '__sl-anno-add';
  addBtn.innerHTML = ICONS.add;
  addBtn.appendChild(el('span', null, 'Add note'));

  var pop = el('div');
  pop.id = '__sl-anno-pop';
  pop.appendChild(el('div', '__sl-cap', 'New annotation'));
  var popQuote = el('div', '__sl-quote');
  var popText = el('textarea');
  popText.placeholder = 'What should change here?';
  var popRow = el('div', '__sl-row');
  var popSave = el('button', '__sl-btn __sl-btn-primary', 'Save');
  var popCancel = el('button', '__sl-btn __sl-btn-ghost', 'Cancel');
  popRow.appendChild(popCancel);
  popRow.appendChild(popSave);
  pop.appendChild(popQuote);
  pop.appendChild(popText);
  pop.appendChild(popRow);

  function hideAdd() { addBtn.style.display = 'none'; }
  function showAddAt(range, text) {
    // getBoundingClientRect() is viewport-relative, and the button is
    // position:fixed — so use the rect coordinates directly (no scroll offset).
    var rect = range.getBoundingClientRect();
    snapshot = {
      selectedText: text,
      context: getContext(range),
      anchor: buildAnchor(range),
      path: location.pathname,
    };
    var left = Math.min(rect.left, window.innerWidth - 140);
    addBtn.style.left = Math.max(8, left) + 'px';
    addBtn.style.top = Math.max(8, rect.bottom) + 'px';
    addBtn.style.display = 'inline-flex';
  }
  function openPopover() {
    if (!snapshot) return;
    hideAdd();
    popQuote.textContent = '\\u201C' + snapshot.selectedText.slice(0, 140) + '\\u201D';
    popText.value = '';
    var left = parseFloat(addBtn.style.left) || 8;
    left = Math.max(8, Math.min(left, window.innerWidth - 316));
    var top = parseFloat(addBtn.style.top) || 8;
    if (top + 240 > window.innerHeight) top = Math.max(8, window.innerHeight - 250);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    pop.style.display = 'block';
    popText.focus();
  }
  function closePopover() { pop.style.display = 'none'; }

  addBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
  addBtn.addEventListener('click', function () { openPopover(); });
  popCancel.addEventListener('click', function () { closePopover(); snapshot = null; });
  popSave.addEventListener('click', function () {
    if (!snapshot) return;
    var note = popText.value;
    if (!note || !note.trim()) { popText.focus(); return; }
    apiCreate({
      note: note,
      path: snapshot.path,
      selectedText: snapshot.selectedText,
      context: snapshot.context,
      anchor: snapshot.anchor,
    }).then(function () {
      closePopover();
      snapshot = null;
      try { window.getSelection().removeAllRanges(); } catch (_) {}
      refresh();
    });
  });

  // ---- Badge + panel ----------------------------------------------------
  var badge = el('div');
  badge.id = '__sl-anno-badge';
  var bIcon = el('span', '__sl-bicon');
  bIcon.innerHTML = ICONS.mark;
  var bLabel = el('span', '__sl-blabel');
  var bLabelText = el('span'); // inner span clipped by the grid-column animation
  bLabel.appendChild(bLabelText);
  var bCount = el('span', '__sl-bcount');
  badge.appendChild(bIcon);
  badge.appendChild(bLabel);
  badge.appendChild(bCount);

  var panel = el('div');
  panel.id = '__sl-anno-panel';
  var head = el('div', '__sl-head');
  head.appendChild(el('strong', null, 'Annotations'));
  var headClose = el('div', '__sl-x');
  headClose.innerHTML = ICONS.close;
  head.appendChild(headClose);
  var tabs = el('div');
  tabs.id = '__sl-anno-tabs';
  function makeTab(label, active) {
    var t = el('div', '__sl-tab' + (active ? ' active' : ''));
    t.appendChild(el('span', null, label));
    var count = el('span', '__sl-tcount', '(0)');
    t.appendChild(count);
    t._count = count;
    return t;
  }
  var tabOpen = makeTab('Open', true);
  var tabDone = makeTab('Done', false);
  tabs.appendChild(tabOpen);
  tabs.appendChild(tabDone);
  var list = el('div');
  list.id = '__sl-anno-list';
  panel.appendChild(head);
  panel.appendChild(tabs);
  panel.appendChild(list);

  toast = el('div');
  toast.id = '__sl-anno-toast';

  function togglePanel(open) {
    var willOpen = open != null ? open : !panel.classList.contains('open');
    panel.classList.toggle('open', willOpen);
    if (willOpen) refresh();
  }
  badge.addEventListener('click', function () { togglePanel(); });
  headClose.addEventListener('click', function () { togglePanel(false); });
  tabOpen.addEventListener('click', function () { filter = 'open'; syncTabs(); renderList(); });
  tabDone.addEventListener('click', function () { filter = 'done'; syncTabs(); renderList(); });
  function syncTabs() {
    tabOpen.classList.toggle('active', filter === 'open');
    tabDone.classList.toggle('active', filter === 'done');
  }

  function whereLabel(a) {
    var c = a.anchor && a.anchor.container;
    var bits = [];
    if (a.entryFile) bits.push(a.entryFile);
    if (c && c.index != null) bits.push((c.kind === 'panel' ? 'panel ' : 'slide ') + c.index);
    if (c && c.heading) bits.push('\\u201C' + c.heading + '\\u201D');
    return bits.join(' \\u00B7 ') || 'unknown location';
  }

  // Per-item action menu (one open at a time).
  function closeMenus() {
    if (openMenuEl) { openMenuEl.classList.remove('open'); openMenuEl = null; }
  }
  function toggleMenu(menu) {
    if (openMenuEl === menu) { closeMenus(); return; }
    closeMenus();
    menu.classList.add('open');
    openMenuEl = menu;
  }

  // Play the leave (collapse + fade) animation, then run the mutation. Falls
  // back to a timer and short-circuits when the user prefers reduced motion.
  function playLeave(item, cb) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cb();
      return;
    }
    var done = false;
    function go() { if (done) return; done = true; cb(); }
    item.classList.add('__sl-leave');
    item.addEventListener('animationend', go, { once: true });
    setTimeout(go, 380);
  }

  function startEdit(item, noteEl, a) {
    var ta = el('textarea');
    ta.value = a.note;
    item.replaceChild(ta, noteEl);
    ta.focus();
    var save = el('button', '__sl-btn __sl-btn-primary', 'Save');
    save.style.marginTop = '8px';
    item.appendChild(save);
    save.addEventListener('click', function () {
      apiUpdate(a.id, { note: ta.value }).then(refresh);
    });
  }

  function renderItem(a) {
    var item = el('div', '__sl-item');
    if (seenIds && !seenIds[a.id]) { item.classList.add('__sl-enter'); seenIds[a.id] = 1; }
    var ihead = el('div', '__sl-ihead');
    ihead.appendChild(el('div', '__sl-where', whereLabel(a)));
    var kebab = el('div', '__sl-kebab');
    kebab.innerHTML = ICONS.more;
    ihead.appendChild(kebab);
    item.appendChild(ihead);

    if (a.selectedText) item.appendChild(el('div', '__sl-quote', '\\u201C' + a.selectedText.slice(0, 120) + '\\u201D'));
    var noteEl = el('div', '__sl-note', a.note);
    item.appendChild(noteEl);

    var menu = el('div', '__sl-menu');
    var mJump = iconBtn('', 'jump', 'Jump to');
    var mEdit = iconBtn('', 'edit', 'Edit');
    var mMark = iconBtn('', a.processed ? 'undo' : 'done', a.processed ? 'Mark as open' : 'Mark as done');
    var mDel = iconBtn('__sl-danger', 'remove', 'Remove');
    menu.appendChild(mJump);
    menu.appendChild(mEdit);
    menu.appendChild(mMark);
    menu.appendChild(el('div', '__sl-sep'));
    menu.appendChild(mDel);
    item.appendChild(menu);

    // Stop mousedown/click from bubbling so the document handler doesn't close
    // the menu before an action fires, and so menu/kebab clicks don't trigger
    // the card's click-to-jump.
    kebab.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    menu.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    kebab.addEventListener('click', function (e) { e.stopPropagation(); toggleMenu(menu); });
    menu.addEventListener('click', function (e) { e.stopPropagation(); });
    mJump.addEventListener('click', function () { closeMenus(); jumpTo(a); });
    mEdit.addEventListener('click', function () { closeMenus(); startEdit(item, noteEl, a); });
    mMark.addEventListener('click', function () {
      closeMenus();
      playLeave(item, function () { apiUpdate(a.id, { processed: !a.processed }).then(refresh); });
    });
    mDel.addEventListener('click', function () {
      closeMenus();
      playLeave(item, function () { apiDelete(a.id).then(refresh); });
    });

    // Click the card body to jump (skip when interacting with the menu/kebab,
    // while editing, or when selecting the note's own text).
    item.addEventListener('click', function (e) {
      if (e.target.closest && (e.target.closest('.__sl-kebab') || e.target.closest('.__sl-menu'))) return;
      if (e.target.closest && (e.target.closest('textarea') || e.target.closest('button'))) return;
      var sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.anchorNode && item.contains(sel.anchorNode)) return;
      jumpTo(a);
    });
    return item;
  }

  function renderList() {
    list.innerHTML = '';
    var shown = notes.filter(function (a) {
      return filter === 'open' ? !a.processed : a.processed;
    });
    if (!shown.length) {
      var empty = el('div', '__sl-empty');
      empty.innerHTML = ICONS.empty;
      empty.appendChild(el('div', null, filter === 'open'
        ? 'No open annotations. Select text in the deck to leave one.'
        : 'Nothing marked done yet.'));
      list.appendChild(empty);
      return;
    }
    shown.forEach(function (a) { list.appendChild(renderItem(a)); });
  }

  function counts() {
    var open = 0;
    for (var i = 0; i < notes.length; i++) { if (!notes[i].processed) open++; }
    return { open: open, done: notes.length - open };
  }

  function updateBadge() {
    var c = counts();
    bCount.textContent = String(c.open);
    badge.classList.toggle('__sl-has', notes.length > 0);
    bLabelText.textContent = notes.length === 0
      ? 'Select any text to leave a note'
      : (c.open > 0 ? 'Review annotations' : 'All annotations done');
    tabOpen._count.textContent = '(' + c.open + ')';
    tabDone._count.textContent = '(' + c.done + ')';
  }

  function refresh() {
    return apiList().then(function (data) {
      notes = (data && data.annotations) || [];
      // First load: mark everything as already-seen so the initial render
      // doesn't animate. After that, only genuinely new notes animate in.
      if (seenIds === null) {
        seenIds = {};
        notes.forEach(function (a) { seenIds[a.id] = 1; });
      }
      closeMenus();
      updateBadge();
      renderList();
    });
  }

  // ---- Global selection listener ---------------------------------------
  document.addEventListener('mouseup', function () {
    setTimeout(function () {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) { hideAdd(); return; }
      var text = sel.toString();
      if (!text || !text.trim()) { hideAdd(); return; }
      var range = sel.getRangeAt(0);
      if (root.contains(range.startContainer) || root.contains(range.endContainer)) return;
      showAddAt(range, text);
    }, 0);
  });
  document.addEventListener('mousedown', function (e) {
    if (!addBtn.contains(e.target)) hideAdd();
    if (pop.style.display === 'block' && !pop.contains(e.target)) { closePopover(); snapshot = null; }
    // Kebab + menu stop their own mousedown, so reaching here means an
    // outside click — close any open action menu.
    if (openMenuEl) closeMenus();
  });

  // ---- Mount ------------------------------------------------------------
  function mount() {
    root.appendChild(style);
    root.appendChild(addBtn);
    root.appendChild(pop);
    root.appendChild(badge);
    root.appendChild(panel);
    root.appendChild(toast);
    document.body.appendChild(root);
    refresh().then(jumpFromHash);
    // Teach once: gently expand the badge to reveal the hint, then collapse.
    // Skipped when we arrived via a cross-page jump (hash present).
    if (!/__slanno=/.test(location.hash || '')) {
      setTimeout(function () {
        badge.classList.add('__sl-open');
        setTimeout(function () { badge.classList.remove('__sl-open'); }, 4200);
      }, 700);
    }
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
`;
