import { Children, isValidElement, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
      remarkPlugins={[remarkGfm, removeEmptyHeadings]}
      components={{
        a: ({ children }) => <span>{children}</span>,
        img: () => null,
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
        blockquote: ({ children }) => (
          <aside className="spoken-guidance" data-testid="spoken-guidance" aria-label="Say this">
            <span className="spoken-label">Say this</span>
            <div>{children}</div>
          </aside>
        ),
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
