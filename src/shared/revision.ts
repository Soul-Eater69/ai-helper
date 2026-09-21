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
// Parse display and proposal together so multiple examples cannot disappear from both.
const sourceLanguages: Record<string, string> = {
  python: 'python',
  py: 'python',
  java: 'java',
  typescript: 'typescript',
  ts: 'typescript',
  javascript: 'javascript',
  js: 'javascript',
  cpp: 'cpp',
  'c++': 'cpp',
  cxx: 'cpp',
};
export function splitAnswer(
  answer: string,
  baseVersion: number,
): { spoken: string; proposal: Proposal | null } {
  const fences = [...answer.matchAll(/^(`{3,}|~{3,})([^\n]*)\r?$/gm)];
  let opened: { fence: string; language: string; start: number; body: number } | null = null;
  let last: { start: number; end: number; code: string; language: string } | null = null;
  for (const match of fences) {
    const fence = match[1];
    const tag = match[2].trim().toLowerCase();
    if (!opened) {
      opened = {
        fence,
        language: sourceLanguages[tag] ?? '',
        start: match.index!,
        body: match.index! + match[0].length + 1,
      };
    } else if (!tag && fence[0] === opened.fence[0] && fence.length >= opened.fence.length) {
      const code = answer.slice(opened.body, match.index).replace(/\r?\n$/, '');
      if (opened.language)
        last = code.trim()
          ? {
              start: opened.start,
              end: match.index! + match[0].length,
              code,
              language: opened.language,
            }
          : null;
      opened = null;
    }
  }
  // Never offer an earlier example as the final solution when the final fence is incomplete.
  if (opened || !last) return { spoken: answer, proposal: null };
  return {
    spoken:
      answer.slice(0, last.start) +
      '*The full version is in the code workspace for review.*' +
      answer.slice(last.end),
    proposal: { code: last.code, language: last.language, baseVersion },
  };
}
export function extractProposal(answer: string, baseVersion: number): Proposal | null {
  return splitAnswer(answer, baseVersion).proposal;
}
