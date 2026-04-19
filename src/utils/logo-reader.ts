/**
 * Read a logo from disk, validate it, and base64-encode it for the
 * cliCompleteSignup HTTP body.
 */

import { readFile, stat } from 'fs/promises';
import { extname } from 'path';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const EXT_TO_CONTENT_TYPE: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

export interface LogoLoadSuccess {
  success: true;
  data: { data: string; contentType: string };
}

export interface LogoLoadError {
  success: false;
  error: { code: string; message: string; nextAction: string };
}

export type LogoLoadResult = LogoLoadSuccess | LogoLoadError;

export async function loadLogoFile(path: string): Promise<LogoLoadResult> {
  const ext = extname(path).toLowerCase();
  const contentType = EXT_TO_CONTENT_TYPE[ext];
  if (!contentType) {
    return {
      success: false,
      error: {
        code: 'LOGO_INVALID_FORMAT',
        message: `Unsupported logo extension "${ext || '(none)'}".`,
        nextAction: 'Use a .png, .jpg, .jpeg, .webp, or .svg file.',
      },
    };
  }

  let info;
  try {
    info = await stat(path);
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'LOGO_READ_FAILED',
        message: `Could not read "${path}": ${err instanceof Error ? err.message : String(err)}`,
        nextAction: 'Check the path and try again.',
      },
    };
  }

  if (info.size > MAX_LOGO_BYTES) {
    return {
      success: false,
      error: {
        code: 'LOGO_TOO_LARGE',
        message: `Logo is ${info.size} bytes; max allowed is ${MAX_LOGO_BYTES} bytes (2 MB).`,
        nextAction: 'Reduce the logo to under 2 MB and retry.',
      },
    };
  }

  const buffer = await readFile(path);
  return {
    success: true,
    data: { data: buffer.toString('base64'), contentType },
  };
}
