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
import { exitWithError, green, cyan, yellow, CHECK } from '../utils/output.js';

interface DevOptions {
  port?: string;
  host?: string;
  entry?: string;
  open?: boolean; // commander sets `open: false` for --no-open
  reload?: boolean; // commander sets `reload: false` for --no-reload
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

interface HandlerDeps {
  deckRoot: string;
  entry: string;
  getServed: () => Map<string, WalkedFile>;
  reloadEnabled: boolean;
  sseClients: Set<ServerResponse>;
  /** Called when a browser opens/closes the live-reload channel. */
  onClientsChanged?: (count: number) => void;
}

/** Build the HTTP request handler: static serving + SSE reload channel. */
export function createRequestHandler(deps: HandlerDeps) {
  const { deckRoot, entry, getServed, reloadEnabled, sseClients } = deps;
  const notifyClients = () => deps.onClientsChanged?.(sseClients.size);

  return (req: IncomingMessage, res: ServerResponse): void => {
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }

    // Strip query/hash before resolving to a path.
    const rawPath = (req.url ?? '/').split('?')[0].split('#')[0];

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
      body =
        isHtml && reloadEnabled
          ? injectReload(readFileSync(abs, 'utf-8'))
          : readFileSync(abs);
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
