import { Children, isValidElement, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { repairDryRunHeader } from '../answer-markdown';

function visibleText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) =>
      typeof child === 'string' || typeof child === 'number'
        ? String(child)
        : isValidElement<{ children?: ReactNode }>(child)
          ? visibleText(child.props.children)
          : '',
    )
    .join('');
}

const sectionActions: Record<string, string> = {
  'brute force': 'Explain',
  'better approach': 'Explain',
  'optimal approach': 'Explain',
  algorithm: 'Write',
  'while coding': 'Explain as you code',
  'dry run': 'Walk through',
  'edge cases': 'Check',
  complexity: 'Reference',
};
function SectionHeading({ children }: { children?: ReactNode }) {
  const action = sectionActions[visibleText(children).trim().toLowerCase()];
  return (
    <h2>
      {children}
      {action && <span className="section-action">{action}</span>}
    </h2>
  );
}

// Hide dangling model-generated headings, including headings still awaiting streamed content.
function removeEmptyHeadings() {
  return (tree: { children: Array<{ type: string; depth?: number }> }) => {
    tree.children = tree.children.filter(
      (node, index, nodes) =>
        node.type !== 'heading' ||
        (!!nodes[index + 1] &&
          (nodes[index + 1].type !== 'heading' ||
            (nodes[index + 1].depth ?? 0) > (node.depth ?? 0))),
    );
  };
}

export default function AnswerContent({ text }: { text: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm, repairDryRunHeader, removeEmptyHeadings]}
      components={{
        a: ({ children }) => <span>{children}</span>,
        img: () => null,
        h2: SectionHeading,
        p: ({ children }) => {
          const metric = /^(?:Time|Space|Auxiliary space|Extra space)(?: complexity)?\s*:/i.test(
            visibleText(children),
          );
          return <p className={metric ? 'complexity-metric' : undefined}>{children}</p>;
        },
        pre: ({ children }) => {
          const code = Children.toArray(children)[0];
          const pseudocode =
            isValidElement<{ className?: string }>(code) &&
            code.props.className === 'language-pseudocode';
          return pseudocode ? (
            <section
              className="pseudocode-panel"
              data-testid="pseudocode"
              aria-label="Algorithm pseudocode"
            >
              <div className="pseudocode-label">Pseudocode · planning only</div>
              <pre>{children}</pre>
            </section>
          ) : (
            <pre>{children}</pre>
          );
        },
        blockquote: ({ children }) => {
          const text = visibleText(children).trim();
          if (
            text.startsWith('[Context needed]') ||
            (text.startsWith('[C') && '[Context needed]'.startsWith(text))
          ) {
            return (
              <aside className="context-needed" aria-label="Personal context needed">
                <span className="spoken-label">Personal context needed · not spoken</span>
                <p>{text.slice('[Context needed]'.length).trim()}</p>
              </aside>
            );
          }
          return (
            <aside className="spoken-guidance" data-testid="spoken-guidance" aria-label="Say this">
              <span className="spoken-label">Say this</span>
              <div>{children}</div>
            </aside>
          );
        },
        table: ({ children }) => (
          <div
            className="answer-table"
            role="region"
            aria-label="Step-by-step explanation"
            tabIndex={0}
          >
            <table>{children}</table>
          </div>
        ),
      }}
    >
      {text}
    </Markdown>
  );
}
