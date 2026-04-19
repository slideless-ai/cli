import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { apiCall } from '../../src/utils/api-client.js';

describe('apiCall', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sends Authorization: Bearer when apiKey is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    global.fetch = fetchMock as any;

    await apiCall({ url: 'https://example.com/x', apiKey: 'cko_test', method: 'POST', body: { a: 1 } });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer cko_test');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('does NOT send Content-Type for GET requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{}', { status: 200 }),
    );
    global.fetch = fetchMock as any;

    await apiCall({ url: 'https://example.com/x', apiKey: 'cko_test', method: 'GET' });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['Content-Type']).toBeUndefined();
  });

  it('returns success: true and unwraps { success, data } payloads', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { foo: 'bar' } }), { status: 200 }),
    ) as any;

    const result = await apiCall<{ foo: string }>({ url: 'https://example.com/x', apiKey: 'k' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ foo: 'bar' });
    }
  });

  it('returns success: true with raw payload when not wrapped', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ shareId: '1', shareUrl: 'https://x' }), { status: 200 }),
    ) as any;

    const result = await apiCall<{ shareId: string }>({ url: 'https://example.com/x', apiKey: 'k' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shareId).toBe('1');
    }
  });

  it('decodes 401 to unauthenticated', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid key', code: 'unauthenticated' }), { status: 401 }),
    ) as any;

    const result = await apiCall({ url: 'https://example.com/x', apiKey: 'k' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('unauthenticated');
      expect(result.status).toBe(401);
    }
  });

  it('decodes 413 to payload-too-large', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'too big', code: 'payload-too-large' }), { status: 413 }),
    ) as any;

    const result = await apiCall({ url: 'https://example.com/x', apiKey: 'k' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('payload-too-large');
    }
  });

  it('returns network-error when fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;

    const result = await apiCall({ url: 'https://example.com/x', apiKey: 'k' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('network-error');
      expect(result.status).toBe(0);
    }
  });
});
