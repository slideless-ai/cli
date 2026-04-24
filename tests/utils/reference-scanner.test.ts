import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { scanReferences } from '../../src/utils/reference-scanner.js';

function setup(files: Record<string, string>): { root: string; files: Array<{ path: string; absolute: string }> } {
  const root = mkdtempSync(join(tmpdir(), 'slideless-scan-'));
  const list: Array<{ path: string; absolute: string }> = [];
  for (const [p, content] of Object.entries(files)) {
    const abs = join(root, p);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
    list.push({ path: p, absolute: abs });
  }
  return { root, files: list };
}

describe('scanReferences', () => {
  let cleanup: Array<() => void> = [];
  afterEach(() => {
    cleanup.forEach((fn) => fn());
    cleanup = [];
  });

  function useSetup(files: Record<string, string>) {
    const s = setup(files);
    cleanup.push(() => rmSync(s.root, { recursive: true, force: true }));
    return s;
  }

  it('ignores external URLs (http, https, protocol-relative, data:, fragment)', () => {
    const s = useSetup({
      'index.html': `
        <link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">
        <script src="//cdn.example.com/lib.js"></script>
        <img src="data:image/png;base64,AAAA">
        <a href="#section">jump</a>
      `,
    });
    const r = scanReferences({ deckRoot: s.root, files: s.files });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('errors on parent-directory escape (../)', () => {
    const s = useSetup({
      'index.html': `<img src="../outside/foo.jpg">`,
    });
    const r = scanReferences({ deckRoot: s.root, files: s.files });
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].kind).toBe('parent-escape');
    expect(r.errors[0].reference).toBe('../outside/foo.jpg');
    expect(r.errors[0].file).toBe('index.html');
    expect(r.warnings).toEqual([]);
  });

  it('warns on missing relative references', () => {
    const s = useSetup({
      'index.html': `<img src="./images/missing.jpg">`,
    });
    const r = scanReferences({ deckRoot: s.root, files: s.files });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].kind).toBe('missing');
    expect(r.warnings[0].message).toMatch(/images\/missing\.jpg/);
  });

  it('does NOT warn when the referenced file exists', () => {
    const s = useSetup({
      'index.html': `<img src="./images/hero.svg"><link rel="stylesheet" href="./styles.css">`,
      'images/hero.svg': '<svg/>',
      'styles.css': 'body {}',
    });
    const r = scanReferences({ deckRoot: s.root, files: s.files });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('resolves root-absolute (/foo) as deck-root-relative', () => {
    const s = useSetup({
      'sub/page.html': `<img src="/assets/hero.jpg">`,
      'assets/hero.jpg': 'x',
    });
    const r = scanReferences({ deckRoot: s.root, files: s.files });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('scans CSS url() and @import', () => {
    const s = useSetup({
      'index.html': `<link rel="stylesheet" href="./styles.css">`,
      'styles.css': `
        @import "./reset.css";
        body { background: url(../escape.png); }
        .x { background: url("./bg.png"); }
      `,
      'bg.png': 'x',
    });
    const r = scanReferences({ deckRoot: s.root, files: s.files });
    // ../escape.png is a parent escape (from styles.css)
    const errors = r.errors.filter((e) => e.file === 'styles.css');
    expect(errors.some((e) => e.reference === '../escape.png')).toBe(true);
    // ./reset.css is missing (warning from styles.css)
    const warns = r.warnings.filter((w) => w.file === 'styles.css');
    expect(warns.some((w) => w.reference.includes('reset.css'))).toBe(true);
  });

  it('strips ?query and #fragment before resolving', () => {
    const s = useSetup({
      'index.html': `<img src="./hero.jpg?v=2"><a href="./page.html#section">x</a>`,
      'hero.jpg': 'x',
      'page.html': '<html/>',
    });
    const r = scanReferences({ deckRoot: s.root, files: s.files });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('reports line numbers', () => {
    const s = useSetup({
      'index.html': [
        '<!doctype html>',
        '<html>',
        '<body>',
        '  <img src="./missing.jpg">',
        '</body>',
      ].join('\n'),
    });
    const r = scanReferences({ deckRoot: s.root, files: s.files });
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].line).toBe(4);
  });
});
