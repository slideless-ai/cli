/**
 * Tests for the listAnnotations HTTP client wrapper: GET, Authorization header,
 * query-string construction (presentationId + optional version), and the
 * discriminated { success, data } result shape.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { listAnnotations } from '../../src/utils/presentations-client.js';

describe('listAnnotations', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('issues a GET with Bearer auth and presentationId in the query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { annotations: [] } }), { status: 200 }),
    );
    global.fetch = fetchMock as any;

    const result = await listAnnotations({
      apiKey: 'cko_test',
      apiUrl: 'https://api.example.com/listAnnotationsForOwner',
      presentationId: '01HXYZ',
    });

    expect(result.success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer cko_test');
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get('presentationId')).toBe('01HXYZ');
    expect(parsed.searchParams.has('version')).toBe(false);
  });

  it('includes version in the query when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { annotations: [] } }), { status: 200 }),
    );
    global.fetch = fetchMock as any;

    await listAnnotations({
      apiKey: 'k',
      apiUrl: 'https://api.example.com/listAnnotationsForOwner',
      presentationId: 'abc',
      version: 3,
    });

    const [url] = fetchMock.mock.calls[0];
    expect(new URL(url as string).searchParams.get('version')).toBe('3');
  });

  it('returns the unwrapped data on success', async () => {
    const annotations = [
      {
        id: 'h1',
        presentationId: 'abc',
        deckVersion: 2,
        author: 'Viewer',
        note: 'fix',
        selectedText: 's',
        context: { before: '', after: '' },
        anchor: { container: { kind: 'slide', index: 0, heading: null }, selector: null },
        entryFile: 'index.html',
        processed: false,
        createdAt: '2026-06-10T00:00:00.000Z',
        updatedAt: '2026-06-10T00:00:00.000Z',
      },
    ];
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { annotations } }), { status: 200 }),
    ) as any;

    const result = await listAnnotations({
      apiKey: 'k',
      apiUrl: 'https://api.example.com/listAnnotationsForOwner',
      presentationId: 'abc',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.annotations).toHaveLength(1);
      expect(result.data.annotations[0].id).toBe('h1');
    }
  });

  it('surfaces an error result on a non-2xx response', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: { code: 'permission-denied', message: 'owner only' } }), {
        status: 403,
      }),
    ) as any;

    const result = await listAnnotations({
      apiKey: 'k',
      apiUrl: 'https://api.example.com/listAnnotationsForOwner',
      presentationId: 'abc',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.status).toBe(403);
      expect(result.error.code).toBe('permission-denied');
    }
  });
});
