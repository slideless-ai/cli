/**
 * Interactive prompt helpers.
 */

import { createInterface } from 'readline';

/**
 * Prompt for a value with masked input (characters replaced with *).
 */
export function promptMasked(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const originalWrite = (rl as any)._writeToOutput;
    (rl as any)._writeToOutput = function (str: string) {
      if (str === prompt || str === '\r\n' || str === '\n') {
        originalWrite.call(rl, str);
      } else {
        originalWrite.call(rl, '*'.repeat(str.length));
      }
    };

    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
