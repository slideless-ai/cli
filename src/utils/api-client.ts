/**
 * Shared HTTP client for the Slideless API.
 *
 * - Sends `Authorization: Bearer <key>` for all authenticated calls.
 * - Returns a discriminated union { success, data | error } — never throws across the boundary.
 */

export interface ApiSuccess<T> {
  success: true;
  data: T;
  status: number;
}

export interface ApiError {
  success: false;
  status: number;
  error: {
    code: string;
    message: string;
    nextAction?: string;
    details?: Record<string, unknown>;
  };
}

export type ApiResult<T> = ApiSuccess<T> | ApiError;

export interface ApiCallOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  apiKey?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export async function apiCall<T = unknown>(options: ApiCallOptions): Promise<ApiResult<T>> {
  const method = options.method ?? 'POST';
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers ?? {}),
  };
  if (options.apiKey) {
    headers['Authorization'] = `Bearer ${options.apiKey}`;
  }
  if (options.body !== undefined && method !== 'GET') {
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(options.url, {
      method,
      headers,
      body: options.body !== undefined && method !== 'GET' ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    return {
      success: false,
      status: 0,
      error: {
        code: 'network-error',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }

  const text = await response.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  if (!response.ok) {
    return {
      success: false,
      status: response.status,
      error: {
        code: body?.code || body?.error?.code || mapStatusToCode(response.status),
        message:
          body?.error?.message ||
          (typeof body?.error === 'string' ? body.error : undefined) ||
          body?.message ||
          `HTTP ${response.status}: ${response.statusText}`,
        ...(body?.error?.nextAction && { nextAction: body.error.nextAction }),
        ...(body?.error?.details && { details: body.error.details }),
      },
    };
  }

  // Some Slideless endpoints return the payload at the root, others wrap in { success, data }.
  // Normalize: if the body explicitly says { success: false, ... }, treat as error.
  if (body && typeof body === 'object' && body.success === false) {
    return {
      success: false,
      status: response.status,
      error: {
        code: body.error?.code || 'api-error',
        message: body.error?.message || 'Unknown API error',
        ...(body.error?.nextAction && { nextAction: body.error.nextAction }),
        ...(body.error?.details && { details: body.error.details }),
      },
    };
  }

  // If the body is wrapped as { success: true, data: ... } (verifyApiKey shape), unwrap it.
  if (body && typeof body === 'object' && body.success === true && 'data' in body) {
    return { success: true, data: body.data as T, status: response.status };
  }

  return { success: true, data: body as T, status: response.status };
}

function mapStatusToCode(status: number): string {
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'permission-denied';
  if (status === 404) return 'not-found';
  if (status === 405) return 'method-not-allowed';
  if (status === 410) return 'archived';
  if (status === 413) return 'payload-too-large';
  if (status >= 500) return 'internal';
  return 'http-error';
}
