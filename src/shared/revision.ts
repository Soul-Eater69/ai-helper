export interface CodeDocument {
  code: string;
  version: number;
  previous: string[];
}
export interface Proposal {
  code: string;
  language: string;
  baseVersion: number;
}
export const createDocument = (code = ''): CodeDocument => ({ code, version: 0, previous: [] });
export function editDocument(doc: CodeDocument, code: string): CodeDocument {
  return code === doc.code ? doc : { ...doc, code, version: doc.version + 1 };
}
export function acceptRevision(doc: CodeDocument, proposal: Proposal): CodeDocument {
  if (proposal.baseVersion !== doc.version)
    throw new Error(
      'Your code changed. Ask again using the current version before applying this proposal.',
    );
  return {
    code: proposal.code,
    version: doc.version + 1,
    previous: [...doc.previous, doc.code].slice(-20),
  };
}
export function undoRevision(doc: CodeDocument): CodeDocument {
  if (!doc.previous.length) return doc;
  return {
    code: doc.previous.at(-1)!,
    version: doc.version + 1,
    previous: doc.previous.slice(0, -1),
  };
}
const CODE_LANGUAGES = new Set([
  'python',
  'py',
  'java',
  'typescript',
  'ts',
  'javascript',
  'js',
  'cpp',
  'c++',
  'cxx',
  'c',
  'csharp',
  'cs',
  'go',
  'rust',
  'rs',
  'kotlin',
  'swift',
  'ruby',
  'rb',
  'scala',
  'php',
  'sql',
]);

/**
 * Fence tags that are explicitly not source: a dry-run trace, sample output, a table.
 * These must never reach the editor, even when the answer contains no real code -- the
 * untagged fallback below would otherwise replace the working file with a trace table.
 */
const NOT_CODE = new Set([
  'text',
  'plain',
  'plaintext',
  'txt',
  'trace',
  'table',
  'output',
  'console',
  'log',
  'diff',
  'markdown',
  'md',
]);

const CODE_BLOCK = /^```([a-z+#]*)[^\n]*\n([\s\S]*?)^```[ \t]*$/gm;

/** Every fenced block in an answer, in the order the model wrote them. */
function codeBlocks(answer: string): { language: string; code: string; whole: string }[] {
  return [...answer.matchAll(CODE_BLOCK)].map((match) => ({
    language: match[1] || '',
    code: match[2].replace(/\r?\n$/, ''),
    whole: match[0],
  }));
}

/**
 * Splits an answer into the part that is spoken aloud and the code proposed for the
 * workspace.
 *
 * The workspace holds one file, so only one block can be the proposal. When a model
 * walks through a brute force before the real solution -- which the guidance explicitly
 * asks for -- the *last* block is the one it is proposing, and the earlier ones are part
 * of the explanation and stay inline where they were said.
 *
 * Returning both halves from one place is deliberate: they were previously derived by
 * two separate regexes that disagreed, so a two-block answer had its code stripped from
 * the transcript and never reached the workspace either.
 */
export function splitAnswer(
  answer: string,
  baseVersion: number,
): { spoken: string; proposal: Proposal | null } {
  const blocks = codeBlocks(answer)
    .filter((block) => block.code.trim())
    // A fence tagged `text` or `trace` is something to read, never something to run.
    .filter((block) => !NOT_CODE.has(block.language));
  // A bare ``` fence is usually sample output or a console transcript, not the file.
  // Prefer the last block that names a programming language; only fall back to an
  // untagged block when the answer contains no tagged block at all.
  const tagged = blocks.filter((block) => CODE_LANGUAGES.has(block.language));
  const last = (tagged.length ? tagged : blocks).at(-1);
  if (!last) return { spoken: answer, proposal: null };

  // Only the final block leaves the transcript; earlier ones illustrate the reasoning.
  const at = answer.lastIndexOf(last.whole);
  const spoken =
    answer.slice(0, at) +
    '\n*The full version is in the code workspace for review.*\n' +
    answer.slice(at + last.whole.length);

  return {
    spoken,
    proposal: { code: last.code, language: last.language || 'plaintext', baseVersion },
  };
}

/** @deprecated Use {@link splitAnswer}; kept so callers migrate in one place. */
export function extractProposal(answer: string, baseVersion: number): Proposal | null {
  return splitAnswer(answer, baseVersion).proposal;
}
