/**
 * Tests for `slideless dev`: entry resolution, reload injection, the served
 * map (ignore parity), and the static + SSE request handler.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createServer, type Server } from 'http';
import type { ServerResponse } from 'http';
import { AddressInfo } from 'net';

import { writeLocalManifest } from '../../src/utils/local-manifest.js';
import {
  buildServedMap,
  resolveEntry,
  injectReload,
  createRequestHandler,
  RELOAD_PATH,
  RELOAD_SNIPPET,
} from '../../src/cli/commands/dev.js';

describe('dev: buildServedMap', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'slideless-dev-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('includes deck files and excludes ignored ones', () => {
    writeFileSync(join(root, 'index.html'), '<html></html>');
    writeFileSync(join(root, 'styles.css'), 'body{}');
    writeLocalManifest(root, {
      presentationId: 'x',
      lastPulledVersion: 1,
      lastPulledAt: '2026-01-01T00:00:00Z',
      role: 'dev',
    });
    mkdirSync(join(root, 'node_modules'));
    writeFileSync(join(root, 'node_modules', 'pkg.json'), '{}');

    const served = buildServedMap(root);
    expect(served.has('index.html')).toBe(true);
    expect(served.has('styles.css')).toBe(true);
    expect(served.has('slideless.json')).toBe(false); // built-in ignore
    expect(served.has('node_modules/pkg.json')).toBe(false);
  });
});

describe('dev: resolveEntry', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'slideless-dev-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('honors an explicit flag', () => {
    writeFileSync(join(root, 'index.html'), 'x');
    writeFileSync(join(root, 'plan.html'), 'x');
    const served = buildServedMap(root);
    expect(resolveEntry(root, served, 'plan.html')).toBe('plan.html');
    expect(resolveEntry(root, served, './plan.html')).toBe('plan.html');
  });

  it('throws when the flagged entry is missing', () => {
    writeFileSync(join(root, 'index.html'), 'x');
    const served = buildServedMap(root);
    expect(() => resolveEntry(root, served, 'nope.html')).toThrow(/not found/);
  });

  it('prefers slideless.json entryPath over index.html', () => {
    writeFileSync(join(root, 'index.html'), 'x');
    writeFileSync(join(root, 'article.html'), 'x');
    writeLocalManifest(root, {
      presentationId: 'x',
      lastPulledVersion: 1,
      lastPulledAt: '2026-01-01T00:00:00Z',
      role: 'dev',
      entryPath: 'article.html',
    });
    const served = buildServedMap(root);
    expect(resolveEntry(root, served, undefined)).toBe('article.html');
  });

  it('falls back to index.html when no entry recorded', () => {
    writeFileSync(join(root, 'index.html'), 'x');
    writeFileSync(join(root, 'zzz.html'), 'x');
    const served = buildServedMap(root);
    expect(resolveEntry(root, served, undefined)).toBe('index.html');
  });

  it('uses the sole html file when there is exactly one', () => {
    writeFileSync(join(root, 'only.html'), 'x');
    writeFileSync(join(root, 'styles.css'), 'x');
    const served = buildServedMap(root);
    expect(resolveEntry(root, served, undefined)).toBe('only.html');
  });

  it('defaults to the first html alphabetically when ambiguous', () => {
    writeFileSync(join(root, 'beta.html'), 'x');
    writeFileSync(join(root, 'alpha.html'), 'x');
    const served = buildServedMap(root);
    expect(resolveEntry(root, served, undefined)).toBe('alpha.html');
  });

  it('throws when there is no html at all', () => {
    writeFileSync(join(root, 'styles.css'), 'x');
    const served = buildServedMap(root);
    expect(() => resolveEntry(root, served, undefined)).toThrow(/No HTML file/);
  });
});

describe('dev: injectReload', () => {
  it('inserts the snippet before </body>', () => {
    const out = injectReload('<html><body>hi</body></html>');
    expect(out).toContain(RELOAD_SNIPPET);
    expect(out.indexOf(RELOAD_SNIPPET)).toBeLessThan(out.indexOf('</body>'));
  });

  it('appends when there is no body tag', () => {
    const out = injectReload('<h1>no body</h1>');
    expect(out.endsWith(RELOAD_SNIPPET)).toBe(true);
  });
});

describe('dev: request handler', () => {
  let root: string;
  let server: Server;
  let base: string;
  const sseClients = new Set<ServerResponse>();

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'slideless-dev-'));
    writeFileSync(join(root, 'index.html'), '<html><body>hi</body></html>');
    writeFileSync(join(root, 'styles.css'), 'body{color:red}');
    writeLocalManifest(root, {
      presentationId: 'x',
      lastPulledVersion: 1,
      lastPulledAt: '2026-01-01T00:00:00Z',
      role: 'dev',
    });
    const served = buildServedMap(root);
    server = createServer(
      createRequestHandler({
        deckRoot: root,
        entry: 'index.html',
        getServed: () => served,
        reloadEnabled: true,
        sseClients,
      }),
    );
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  });
  afterEach(async () => {
    for (const c of sseClients) c.end();
    sseClients.clear();
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(root, { recursive: true, force: true });
  });

  it('serves the entry on / with the reload script injected', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toContain(RELOAD_PATH);
  });

  it('serves assets with the right content type and no injection', async () => {
    const res = await fetch(`${base}/styles.css`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/css/);
    const body = await res.text();
    expect(body).not.toContain(RELOAD_PATH);
  });

  it('404s ignored files (slideless.json)', async () => {
    const res = await fetch(`${base}/slideless.json`);
    expect(res.status).toBe(404);
  });

  it('404s unknown paths', async () => {
    const res = await fetch(`${base}/does-not-exist.png`);
    expect(res.status).toBe(404);
  });

  it('opens an SSE stream on the reload path', async () => {
    const res = await fetch(`${base}${RELOAD_PATH}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    // Don't drain the stream; cancel so the test can tear down.
    await res.body?.cancel();
  });
});
