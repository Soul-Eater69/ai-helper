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
export function extractProposal(answer: string, baseVersion: number): Proposal | null {
  const blocks = [
    ...answer.matchAll(
      /^```(python|java|typescript|javascript|cpp|c\+\+)\s*\n([\s\S]*?)^```\s*$/gm,
    ),
  ];
  if (blocks.length !== 1) return null;
  return { code: blocks[0][2].replace(/\r?\n$/, ''), language: blocks[0][1], baseVersion };
}
