export interface CodingBeat {
  label: string;
  speech: string;
  line?: number;
}
/** Only link a uniquely named declaration. Never infer ranges from a prose label. */
export function codingBeats(script: string, code: string): CodingBeat[] {
  const chunks = script.split(/\n(?=\s*[-*]\s+\*\*)/).filter((part) => part.trim());
  return chunks.map((chunk, index) => {
    const match = /^\s*[-*]\s+\*\*([^*]+)\*\*\s*:?[ \t]*([\s\S]*)/.exec(chunk);
    const label = match ? match[1].replace(/:$/, '').replace(/`/g, '').trim() : `Step ${index + 1}`;
    const speech = match ? match[2].trim() : chunk.trim();
    const name = /^(?:\w+\.)?([A-Za-z_]\w*)(?:\([^)]*\))?$/.exec(label)?.[1];
    const lines = name
      ? code.split('\n').flatMap((line, i) => {
          const trimmed = line.trim();
          const declaration = new RegExp(
            `^(?:(?:async )?def |(?:export )?(?:async )?function |(?:(?:public|private|protected|static|final|async|override)\\s+)*(?:[\\w<>\\[\\],?]+\\s+)?)${name}\\s*\\(`,
          );
          return declaration.test(trimmed) && !/^\w+\s*\([^)]*\)\s*;?$/.test(trimmed)
            ? [i + 1]
            : [];
        })
      : [];
    return { label, speech, line: lines.length === 1 ? lines[0] : undefined };
  });
}
