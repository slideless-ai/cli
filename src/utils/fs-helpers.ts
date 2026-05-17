/**
 * Small filesystem helpers shared by `pull` and `remix`.
 */

import { readdirSync, rmSync } from 'fs';
import { resolve } from 'path';

/** Recursively delete everything inside `dir`, leaving `dir` itself in place. */
export function wipeDirectoryContents(dir: string): void {
  for (const name of readdirSync(dir)) {
    rmSync(resolve(dir, name), { recursive: true, force: true });
  }
}

/** True if `dir` is empty or unreadable. */
export function isDirEmpty(dir: string): boolean {
  try {
    return readdirSync(dir).length === 0;
  } catch {
    return true;
  }
}
