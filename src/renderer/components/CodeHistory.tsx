import { useEffect, useState } from 'react';
import { extractProposal } from '../../shared/revision';
import type { Workspace } from '../hooks/useSession';
import { CodeDiff, CodeEditor } from './MonacoSurface';

export default function CodeHistory({ work }: { work: Workspace }) {
  const [selected, setSelected] = useState('');
  const [compare, setCompare] = useState(false);
  const generated = work.turns
    .flatMap((turn, index) => {
      const proposal = turn.status === 'done' ? extractProposal(turn.answer, 0) : undefined;
      return proposal
        ? [{ id: turn.id, label: `Generated · Q${index + 1}: ${turn.question}`, ...proposal }]
        : [];
    })
    .reverse();
  const snapshots = work.doc.previous
    .map((code, index) => ({
      id: `working-${index}`,
      code,
      language: work.settings.language,
      label: `Working snapshot ${index + 1} · before acceptance`,
    }))
    .reverse();
  const versions = [...generated, ...snapshots];
  const version = versions.find((item) => item.id === selected) ?? versions[0];
  const versionId = version?.id;
  useEffect(() => {
    if (versionId) setSelected(versionId);
  }, [versionId]);
  if (!version)
    return (
      <div className="history-empty">
        No code versions yet. Completed code proposals will appear here.
      </div>
    );
  return (
    <div className="code-history">
      <div className="history-controls">
        <label>
          Code version
          <select
            aria-label="Code version"
            value={version.id}
            onChange={(event) => setSelected(event.target.value)}
          >
            {versions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="history-compare">
          <input
            type="checkbox"
            checked={compare}
            onChange={(event) => setCompare(event.target.checked)}
          />
          Compare with working code
        </label>
      </div>
      <p className="history-caption">
        {compare ? 'Selected version → working code. ' : 'Read-only. '}Generated versions may not
        have been accepted.
      </p>
      <div className="editor-wrap">
        {compare ? (
          <CodeDiff
            original={version.code}
            modified={work.doc.code}
            language={version.language}
            originalLabel="Selected history version"
            modifiedLabel="Working code"
          />
        ) : (
          <CodeEditor key={version.id} value={version.code} language={version.language} readOnly />
        )}
      </div>
    </div>
  );
}
