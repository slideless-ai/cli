/**
 * CLI output utilities — colored text for humans, --json for machines.
 */

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';

export function red(s: string): string {
  return `${RED}${s}${RESET}`;
}
export function green(s: string): string {
  return `${GREEN}${s}${RESET}`;
}
export function yellow(s: string): string {
  return `${YELLOW}${s}${RESET}`;
}
export function cyan(s: string): string {
  return `${CYAN}${s}${RESET}`;
}
export function bold(s: string): string {
  return `${BOLD}${s}${RESET}`;
}

export const CHECK = green('\u2713');
export const CROSS = red('\u2717');
export const DOT = '\u25cf';

/**
 * Print a fatal error and exit with the given code.
 */
export function exitWithError(message: string, code: number = 1): never {
  console.error(`${red('Error:')} ${message}`);
  process.exit(code);
}

/**
 * Standard JSON output shape for success.
 */
export function emitJsonSuccess(data: unknown): void {
  console.log(JSON.stringify({ success: true, data }, null, 2));
}

/**
 * Standard JSON output shape for failure.
 */
export function emitJsonError(
  error: { code: string; message: string; nextAction?: string; details?: Record<string, unknown> },
  status?: number,
): void {
  console.log(JSON.stringify({ success: false, ...(status !== undefined && { status }), error }, null, 2));
}

/**
 * Format bytes as human-readable.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format an ISO date string as a short human-readable date+time, or '-' if null.
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
