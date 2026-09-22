import { Children, isValidElement } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function AnswerContent({ text }: { text: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ children }) => <span>{children}</span>,
        img: () => null,
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
