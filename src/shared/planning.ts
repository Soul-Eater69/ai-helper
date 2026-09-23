/** Display-only planning notes must never become an executable code proposal. */
export function planningCode(answer: string): string {
  return [...answer.matchAll(/^```pseudocode\s*\r?\n([\s\S]*?)^```\s*$/gm)]
    .map((match) => match[1].trim())
    .filter(Boolean)
    .join('\n\n');
}
