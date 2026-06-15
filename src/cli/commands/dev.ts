/**
 * `slideless dev` — local live-reload server for a deck folder.
 *
 * Serves the deck over HTTP, watches the folder, and reloads the browser on
 * every save. Pure local iteration: no auth, no network, no version churn.
 * Publish with `slideless push` when you're happy.
 *
 * Usage:
 *   slideless dev                 # serve the current folder
 *   slideless dev ./my-deck       # serve a folder
 *   slideless dev . --port 8080   # pick a port (auto-bumps if taken)
 *   slideless dev . --no-open     # don't open the browser
 *   slideless dev . --entry plan.html   # override the first page
 */

import { Command } from 'commander';
import {
  createServer,
  IncomingMessage,
  ServerResponse,
  Server,
} from 'http';
import { readFileSync, statSync, existsSync } from 'fs';
import { resolve, relative, sep } from 'path';
import { spawn } from 'child_process';

import chokidar, { FSWatcher } from 'chokidar';

import {
  walkDeck,
  createDeckIgnore,
  toPosixPath,
  type WalkedFile,
} from '../../utils/folder-walker.js';
import { detectContentType } from '../../utils/manifest.js';
import {
  hasLocalManifest,
  readLocalManifest,
} from '../../utils/local-manifest.js';
import {
  ANNOTATE_CLIENT_PATH,
  ANNOTATIONS_API_PATH,
  ANNOTATION_CLIENT_JS,
} from '../dev/annotation-client.js';
import {
  readAnnotations,
  addAnnotation,
  updateAnnotation,
  removeAnnotation,
} from '../../utils/annotations-store.js';
import { getActiveProfile } from '../../utils/config.js';
import { exitWithError, green, cyan, yellow, CHECK } from '../utils/output.js';

interface DevOptions {
  port?: string;
  host?: string;
  entry?: string;
  open?: boolean; // commander sets `open: false` for --no-open
  reload?: boolean; // commander sets `reload: false` for --no-reload
  annotate?: boolean; // commander sets `annotate: false` for --no-annotate
  author?: string;
}

export const RELOAD_PATH = '/__slideless_reload';
const MAX_PORT_TRIES = 20;

/** The tiny client we inject into served HTML to drive live-reload. */
export const RELOAD_SNIPPET =
  `<script>(function(){try{var es=new EventSource('${RELOAD_PATH}');` +
  `es.onmessage=function(e){if(e.data==='reload')location.reload();};` +
  `}catch(_){}})();</script>`;

/** Build a relative-posix-path → file map of everything `push` would upload. */
export function buildServedMap(deckRoot: string): Map<string, WalkedFile> {
  const map = new Map<string, WalkedFile>();
  for (const f of walkDeck(deckRoot).files) {
    map.set(f.path, f);
  }
  return map;
}

/**
 * Resolve the deck's entry HTML, mirroring the hosted viewer where possible.
 * Precedence: `flag` → slideless.json entryPath → index.html → the sole .html
 * → first .html alphabetically (with a warning). Throws if none can be found.
 */
export function resolveEntry(
  deckRoot: string,
  served: Map<string, WalkedFile>,
  flag: string | undefined,
): string {
  if (flag) {
    const norm = toPosixPath(flag).replace(/^\.?\//, '');
    if (!served.has(norm)) {
      throw new Error(
        `Entry file "${flag}" not found in ${deckRoot} (or it is ignored).`,
      );
    }
    return norm;
  }

  if (hasLocalManifest(deckRoot)) {
    try {
      const ep = readLocalManifest(deckRoot).entryPath;
      if (ep && served.has(ep)) return ep;
      if (ep && !served.has(ep)) {
        console.log(
          yellow(
            `⚠ slideless.json records entryPath "${ep}" but it isn't present — falling back.`,
          ),
        );
      }
    } catch {
      // Malformed manifest: ignore and fall through to heuristics.
    }
  }

  if (served.has('index.html')) return 'index.html';

  const htmlFiles = [...served.keys()]
    .filter((p) => p.toLowerCase().endsWith('.html'))
    .sort((a, b) => a.localeCompare(b));

  if (htmlFiles.length === 0) {
    throw new Error(
      `No HTML file found in ${deckRoot}. Pass a folder containing a deck, or use --entry.`,
    );
  }
  if (htmlFiles.length === 1) return htmlFiles[0];

  console.log(
    yellow(
      `⚠ No index.html and no recorded entry; defaulting to "${htmlFiles[0]}". Use --entry to pick another, or re-pull to record the deck's real entry.`,
    ),
  );
  return htmlFiles[0];
}

/** Insert the reload client before </body>, or append if there's no body tag. */
export function injectReload(html: string): string {
  const idx = html.toLowerCase().lastIndexOf('</body>');
  if (idx === -1) return html + RELOAD_SNIPPET;
  return html.slice(0, idx) + RELOAD_SNIPPET + html.slice(idx);
}

/** The tag that pulls in the annotation overlay client. */
export const ANNOTATE_SNIPPET = `<script src="${ANNOTATE_CLIENT_PATH}" defer></script>`;

/**
 * Insert the annotation overlay client before </body>, or append if absent.
 * When `entry` is given, a tiny config script tells the client which file is
 * the deck entry — needed so it can tell whether a note belongs to the page
 * currently shown or to another page in a multi-page deck.
 */
export function injectAnnotator(html: string, entry?: string): string {
  const config = entry
    ? `<script>window.__slidelessAnnotate={entry:${JSON.stringify(entry)}};</script>`
    : '';
  const snippet = config + ANNOTATE_SNIPPET;
  const idx = html.toLowerCase().lastIndexOf('</body>');
  if (idx === -1) return html + snippet;
  return html.slice(0, idx) + snippet + html.slice(idx);
}

/** Map a served URL path to the deck-relative entry file it represents. */
export function pathToEntryFile(rawPath: string, entry: string): string {
  let p: string;
  try {
    p = decodeURIComponent(rawPath.split('?')[0].split('#')[0]);
  } catch {
    p = rawPath;
  }
  p = p.replace(/^\/+/, '');
  // Mirror the static handler: a directory request serves its entry file.
  if (p === '' || p.endsWith('/')) return p + entry;
  return p;
}

/** Deck version this annotation is made against: slideless.json's
 * lastPulledVersion, or null when the deck was never pushed/pulled. */
function resolveDeckVersion(deckRoot: string): number | null {
  if (!hasLocalManifest(deckRoot)) return null;
  try {
    const v = readLocalManifest(deckRoot).lastPulledVersion;
    return typeof v === 'number' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Local annotation author = the active profile's API key name (the local analog
 * of a hosted share token's name). Falls back to org name → profile name → null.
 * Overridable via `--author` / `SLIDELESS_AUTHOR`.
 */
export function resolveAuthor(override?: string): string | null {
  const forced = override ?? process.env.SLIDELESS_AUTHOR;
  if (forced && forced.trim()) return forced.trim();
  try {
    const active = getActiveProfile();
    if (!active) return null;
    return active.profile.keyName || active.profile.organizationName || active.name || null;
  } catch {
    return null;
  }
}

/** Read a request body and parse it as JSON, tolerating empty/garbage. */
function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolvePromise) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) req.destroy(); // 1MB guard
    });
    req.on('end', () => {
      if (!data) return resolvePromise({});
      try {
        const parsed = JSON.parse(data);
        resolvePromise(
          parsed && typeof parsed === 'object'
            ? (parsed as Record<string, unknown>)
            : {},
        );
      } catch {
        resolvePromise({});
      }
    });
    req.on('error', () => resolvePromise({}));
  });
}

/** Handle the `/__slideless_annotations` REST surface (GET/POST/PATCH/DELETE). */
async function handleAnnotationsApi(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  deckRoot: string,
  entry: string,
  author: string | null,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const id = url.searchParams.get('id') ?? '';
  const json = (status: number, obj: unknown) => {
    const buf = Buffer.from(JSON.stringify(obj), 'utf-8');
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': buf.length,
      'Cache-Control': 'no-store',
    });
    res.end(method === 'HEAD' ? undefined : buf);
  };

  try {
    if (method === 'GET' || method === 'HEAD') {
      return json(200, readAnnotations(deckRoot));
    }
    if (method === 'POST') {
      const body = await readJsonBody(req);
      const entryFile = pathToEntryFile(
        typeof body.path === 'string' ? body.path : '',
        entry,
      );
      const created = addAnnotation(deckRoot, {
        note: typeof body.note === 'string' ? body.note : '',
        entryFile,
        selectedText:
          typeof body.selectedText === 'string' ? body.selectedText : '',
        context: body.context as { before?: string; after?: string } | undefined,
        anchor: body.anchor as Record<string, unknown> | undefined,
        deckVersion: resolveDeckVersion(deckRoot),
        source: 'local',
        author,
      });
      return json(201, created);
    }
    if (method === 'PATCH') {
      const body = await readJsonBody(req);
      if (!id) return json(400, { error: 'id query param required' });
      const updated = updateAnnotation(deckRoot, id, {
        note: typeof body.note === 'string' ? body.note : undefined,
        processed:
          typeof body.processed === 'boolean' ? body.processed : undefined,
      });
      return updated ? json(200, updated) : json(404, { error: 'not found' });
    }
    if (method === 'DELETE') {
      if (!id) return json(400, { error: 'id query param required' });
      const ok = removeAnnotation(deckRoot, id);
      return json(ok ? 200 : 404, { ok });
    }
    res.writeHead(405, { Allow: 'GET, POST, PATCH, DELETE' });
    res.end();
  } catch (err) {
    json(500, { error: err instanceof Error ? err.message : String(err) });
  }
}

interface HandlerDeps {
  deckRoot: string;
  entry: string;
  getServed: () => Map<string, WalkedFile>;
  reloadEnabled: boolean;
  /** When true, serve the overlay client + annotation API and inject the tag. */
  annotateEnabled: boolean;
  /** Author stamped on locally-created annotations (API key name, or override). */
  author?: string | null;
  sseClients: Set<ServerResponse>;
  /** Called when a browser opens/closes the live-reload channel. */
  onClientsChanged?: (count: number) => void;
}

/** Build the HTTP request handler: static serving + SSE reload channel. */
export function createRequestHandler(deps: HandlerDeps) {
  const { deckRoot, entry, getServed, reloadEnabled, annotateEnabled, sseClients } =
    deps;
  const author = deps.author ?? null;
  const notifyClients = () => deps.onClientsChanged?.(sseClients.size);

  return (req: IncomingMessage, res: ServerResponse): void => {
    const method = req.method ?? 'GET';

    // Strip query/hash before resolving to a path.
    const rawPath = (req.url ?? '/').split('?')[0].split('#')[0];

    // --- Annotation overlay (handled for any HTTP method, before the
    // GET/HEAD-only guard below). ---
    if (annotateEnabled && rawPath === ANNOTATE_CLIENT_PATH) {
      const buf = Buffer.from(ANNOTATION_CLIENT_JS, 'utf-8');
      res.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Content-Length': buf.length,
        'Cache-Control': 'no-store',
      });
      res.end(method === 'HEAD' ? undefined : buf);
      return;
    }
    if (annotateEnabled && rawPath === ANNOTATIONS_API_PATH) {
      void handleAnnotationsApi(req, res, method, deckRoot, entry, author);
      return;
    }

    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }

    if (reloadEnabled && rawPath === RELOAD_PATH) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write(': connected\n\n');
      sseClients.add(res);
      notifyClients();
      req.on('close', () => {
        sseClients.delete(res);
        notifyClients();
      });
      return;
    }

    let decoded: string;
    try {
      decoded = decodeURIComponent(rawPath);
    } catch {
      res.writeHead(400).end('Bad request');
      return;
    }
    let relPath = decoded.replace(/^\/+/, '');
    if (relPath === '' || relPath.endsWith('/')) relPath += entry;

    const file = getServed().get(relPath);
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`404 Not Found: ${relPath}`);
      return;
    }

    // Defense in depth: served map only holds in-root files, but re-verify.
    const abs = file.absolute;
    if (abs !== deckRoot && !abs.startsWith(deckRoot + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const contentType = detectContentType(relPath);
    const isHtml = contentType.startsWith('text/html');

    let body: Buffer | string;
    try {
      if (isHtml && (reloadEnabled || annotateEnabled)) {
        let html = readFileSync(abs, 'utf-8');
        if (reloadEnabled) html = injectReload(html);
        if (annotateEnabled) html = injectAnnotator(html, entry);
        body = html;
      } else {
        body = readFileSync(abs);
      }
    } catch {
      res.writeHead(404).end('Not found');
      return;
    }

    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf-8');
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': buf.length,
      'Cache-Control': 'no-store',
    });
    res.end(method === 'HEAD' ? undefined : buf);
  };
}

/** Listen on `port`, bumping to the next free port on EADDRINUSE. */
function listenWithRetry(
  server: Server,
  host: string,
  startPort: number,
): Promise<number> {
  return new Promise((resolvePort, reject) => {
    let port = startPort;
    let tries = 0;
    const attempt = () => {
      const onError = (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && tries < MAX_PORT_TRIES) {
          tries += 1;
          port += 1;
          setImmediate(attempt);
        } else {
          reject(err);
        }
      };
      server.once('error', onError);
      server.listen(port, host, () => {
        server.removeListener('error', onError);
        resolvePort(port);
      });
    };
    attempt();
  });
}

/** Open a URL in the default browser (best effort, never throws). */
function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'cmd'
        : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // ignore — the URL is printed anyway.
  }
}

export const devCommand = new Command('dev')
  .description('Serve a deck locally with file-watching + live-reload (no upload)')
  .argument('[path]', 'Deck folder to serve (default: current directory)')
  .option('--port <n>', 'Port to bind (auto-bumps if taken)', '5173')
  .option('--host <addr>', 'Address to bind', '127.0.0.1')
  .option('--entry <file>', 'Entry HTML file (overrides auto-detection)')
  .option('--no-open', "Don't open the browser on start")
  .option('--no-reload', 'Serve static files only (disable live-reload)')
  .option('--no-annotate', 'Disable the in-browser annotation overlay')
  .option('--author <name>', 'Attribute local annotations to this name (default: your API key name)')
  .action((pathArg: string | undefined, options: DevOptions) => {
    const deckRoot = resolve(pathArg ?? '.');
    if (!existsSync(deckRoot) || !statSync(deckRoot).isDirectory()) {
      exitWithError(`Not a directory: ${deckRoot}`, 1);
    }

    const host = options.host ?? '127.0.0.1';
    const startPort = Number(options.port ?? '5173');
    if (!Number.isInteger(startPort) || startPort < 1 || startPort > 65535) {
      exitWithError('--port must be an integer between 1 and 65535', 1);
    }
    const reloadEnabled = options.reload !== false;
    const annotateEnabled = options.annotate !== false;
    const author = resolveAuthor(options.author);

    let served = buildServedMap(deckRoot);
    let entry: string;
    try {
      entry = resolveEntry(deckRoot, served, options.entry);
    } catch (err) {
      return exitWithError(err instanceof Error ? err.message : String(err), 1);
    }
    const ig = createDeckIgnore(deckRoot);
    const sseClients = new Set<ServerResponse>();

    let lastClientCount = 0;
    const server = createServer(
      createRequestHandler({
        deckRoot,
        entry,
        getServed: () => served,
        reloadEnabled,
        annotateEnabled,
        author,
        sseClients,
        onClientsChanged: (count) => {
          if (count > lastClientCount) {
            console.log(`${CHECK} browser connected (${count} tab${count === 1 ? '' : 's'})`);
          }
          lastClientCount = count;
        },
      }),
    );

    // --- File watcher -----------------------------------------------------
    const watcher: FSWatcher = chokidar.watch(deckRoot, {
      ignoreInitial: true,
      ignored: (p: string) => {
        const rel = toPosixPath(relative(deckRoot, p));
        if (rel === '' || rel.startsWith('..')) return false;
        return ig.ignores(rel) || ig.ignores(rel + '/');
      },
    });

    let debounce: NodeJS.Timeout | null = null;
    let needsRescan = false;
    const pending = new Set<string>();
    const onChange = (rescan: boolean, changedPath: string) => {
      if (rescan) needsRescan = true;
      pending.add(toPosixPath(relative(deckRoot, changedPath)) || changedPath);
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        if (needsRescan) {
          served = buildServedMap(deckRoot);
          needsRescan = false;
        }
        for (const client of sseClients) client.write('data: reload\n\n');
        const files = [...pending].join(', ');
        pending.clear();
        const n = sseClients.size;
        if (!reloadEnabled) {
          console.log(`${cyan('↻')} changed: ${files} (live-reload disabled)`);
        } else if (n === 0) {
          console.log(
            yellow(
              `↻ changed: ${files} — but no browser is connected. Open the URL above (not the hosted share link).`,
            ),
          );
        } else {
          console.log(
            `${cyan('↻')} reload: ${files} → ${n} tab${n === 1 ? '' : 's'}`,
          );
        }
      }, 100);
    };
    watcher.on('change', (p: string) => onChange(false, p));
    watcher.on('add', (p: string) => onChange(true, p));
    watcher.on('unlink', (p: string) => onChange(true, p));

    // --- Boot -------------------------------------------------------------
    listenWithRetry(server, host, startPort)
      .then((port) => {
        const url = `http://${host}:${port}/`;
        console.log('');
        console.log(`${CHECK} ${green('Slideless dev server running')}`);
        console.log('');
        console.log(`  URL:     ${cyan(url)}`);
        console.log(`  Folder:  ${deckRoot}`);
        console.log(`  Entry:   ${entry}`);
        console.log(
          `  Reload:  ${reloadEnabled ? 'on (auto-reload on save)' : 'off'}`,
        );
        console.log(
          `  Annotate: ${annotateEnabled ? 'on (select text to leave a note)' : 'off'}`,
        );
        if (annotateEnabled) {
          console.log(
            `  Author:  ${author ?? '(none — run slideless login, or pass --author)'}`,
          );
        }
        console.log('');
        console.log('  Press Ctrl+C to stop.');
        console.log('');
        if (options.open !== false) openBrowser(url);
      })
      .catch((err: Error) => {
        exitWithError(`Failed to start dev server: ${err.message}`, 1);
      });

    const shutdown = () => {
      watcher.close();
      for (const client of sseClients) client.end();
      server.close(() => process.exit(0));
      // Hard exit if close hangs on lingering SSE sockets.
      setTimeout(() => process.exit(0), 500).unref();
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
