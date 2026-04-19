import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  signupRequest,
  signupComplete,
  loginRequest,
  loginComplete,
} from '../../src/utils/auth-flow-client.js';

describe('auth-flow-client', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    delete (process.env as any).SLIDELESS_API_BASE_URL;
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('signupRequest POSTs { email } to /cliRequestSignupOtp', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { email: 'a@b.co', expiresInSeconds: 600 } }), { status: 200 }),
    );
    global.fetch = fetchMock as any;

    const res = await signupRequest({ email: 'a@b.co', baseUrl: 'https://api.example' });

    expect(res.success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example/cliRequestSignupOtp');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ email: 'a@b.co' });
  });

  it('signupComplete includes company + logo + apiKey in the body when set', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            organizationId: 'org1',
            organizationName: 'Acme',
            apiKey: { keyId: 'k1', raw: 'cko_abc', keyPrefix: 'cko_abcd', name: 'CLI', scopes: ['presentations:read'], createdAt: '2026-01-01T00:00:00Z' },
            isNewUser: true,
          },
        }),
        { status: 200 },
      ),
    );
    global.fetch = fetchMock as any;

    const res = await signupComplete({
      email: 'a@b.co',
      code: '123456',
      company: { name: 'Acme', brandPrimary: '#0a0a0a' },
      logo: { data: 'AAAA', contentType: 'image/png' },
      apiKey: { name: 'ci', expiresInDays: 30 },
      baseUrl: 'https://api.example',
    });

    expect(res.success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example/cliCompleteSignup');
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      email: 'a@b.co',
      code: '123456',
      company: { name: 'Acme', brandPrimary: '#0a0a0a' },
      logo: { data: 'AAAA', contentType: 'image/png' },
      apiKey: { name: 'ci', expiresInDays: 30 },
    });
  });

  it('loginRequest + loginComplete target the login endpoints', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { email: 'a@b.co', expiresInSeconds: 600 } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              organizationId: 'org1',
              organizationName: 'Acme',
              apiKey: { keyId: 'k1', raw: 'cko_xyz', keyPrefix: 'cko_xyz', name: 'CLI', scopes: [], createdAt: '2026-01-01T00:00:00Z' },
            },
          }),
          { status: 200 },
        ),
      );
    global.fetch = fetchMock as any;

    await loginRequest({ email: 'a@b.co', baseUrl: 'https://api.example' });
    await loginComplete({ email: 'a@b.co', code: '123456', baseUrl: 'https://api.example' });

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example/cliRequestLoginOtp');
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.example/cliCompleteLogin');
  });

  it('propagates server error payload with nextAction/details', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'USER_ALREADY_HAS_ORGANIZATION',
            message: 'You already have an org.',
            nextAction: 'Run `slideless auth login-request --email a@b.co`.',
            details: { orgCount: 1 },
          },
        }),
        { status: 409 },
      ),
    ) as any;

    const res = await signupRequest({ email: 'a@b.co', baseUrl: 'https://api.example' });

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('USER_ALREADY_HAS_ORGANIZATION');
      expect(res.error.nextAction).toContain('login-request');
      expect(res.error.details).toEqual({ orgCount: 1 });
      expect(res.status).toBe(409);
    }
  });
});
