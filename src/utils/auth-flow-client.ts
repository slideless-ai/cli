/**
 * Thin wrappers around `apiCall` for the CLI auth flows
 * (signup-request / signup-complete / login-request / login-complete).
 */

import { apiCall, type ApiResult } from './api-client.js';
import { ENDPOINTS, resolveBaseUrl } from './config.js';

export interface SignupRequestInput {
  email: string;
  baseUrl?: string;
}

export interface SignupRequestOutput {
  email: string;
  expiresInSeconds: number;
}

export async function signupRequest(
  input: SignupRequestInput,
): Promise<ApiResult<SignupRequestOutput>> {
  return apiCall<SignupRequestOutput>({
    url: resolveBaseUrl(input.baseUrl) + ENDPOINTS.cliRequestSignupOtp,
    method: 'POST',
    body: { email: input.email },
  });
}

export interface CompleteSignupInput {
  email: string;
  code: string;
  user: {
    firstName: string;
    lastName?: string;
  };
  company?: {
    name?: string;
    description?: string;
    brandPrimary?: string;
    brandSecondary?: string;
    brandAccent?: string;
    tone?: string;
  };
  logo?: { data: string; contentType: string };
  apiKey?: { name?: string; expiresInDays?: number };
  baseUrl?: string;
}

export interface CompleteSignupOutput {
  organizationId: string;
  organizationName: string;
  apiKey: {
    keyId: string;
    raw: string;
    keyPrefix: string;
    name: string;
    scopes: string[];
    createdAt: string;
    expiresAt?: string;
  };
  isNewUser: boolean;
}

export async function signupComplete(
  input: CompleteSignupInput,
): Promise<ApiResult<CompleteSignupOutput>> {
  const { baseUrl, ...body } = input;
  return apiCall<CompleteSignupOutput>({
    url: resolveBaseUrl(baseUrl) + ENDPOINTS.cliCompleteSignup,
    method: 'POST',
    body,
  });
}

export interface LoginRequestInput {
  email: string;
  baseUrl?: string;
}

export interface LoginRequestOutput {
  email: string;
  expiresInSeconds: number;
}

export async function loginRequest(
  input: LoginRequestInput,
): Promise<ApiResult<LoginRequestOutput>> {
  return apiCall<LoginRequestOutput>({
    url: resolveBaseUrl(input.baseUrl) + ENDPOINTS.cliRequestLoginOtp,
    method: 'POST',
    body: { email: input.email },
  });
}

export interface CompleteLoginInput {
  email: string;
  code: string;
  apiKey?: { name?: string; expiresInDays?: number };
  baseUrl?: string;
}

export interface CompleteLoginOutput {
  organizationId: string;
  organizationName: string;
  apiKey: {
    keyId: string;
    raw: string;
    keyPrefix: string;
    name: string;
    scopes: string[];
    createdAt: string;
    expiresAt?: string;
  };
}

export async function loginComplete(
  input: CompleteLoginInput,
): Promise<ApiResult<CompleteLoginOutput>> {
  const { baseUrl, ...body } = input;
  return apiCall<CompleteLoginOutput>({
    url: resolveBaseUrl(baseUrl) + ENDPOINTS.cliCompleteLogin,
    method: 'POST',
    body,
  });
}
