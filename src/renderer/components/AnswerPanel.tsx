import { useState } from 'react';
import Markdown from 'react-markdown';
import { ArrowUpRight, Check, Copy, MessageSquare, Sparkles, Square } from 'lucide-react';
import type { Workspace } from '../hooks/useSession';
export default function AnswerPanel({
  work,
  openSettings,
}: {
  work: Workspace;
  openSettings: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const turn = work.turns.find((t) => t.id === work.selected) ?? work.turns.at(-1);
  const text =
    turn?.answer.replace(
      /^```(?:python|java|typescript|javascript|cpp|c\+\+)[^\n]*\n[\s\S]*?^```\s*$/gm,
      '\n*Code is available in the workspace for review.*\n',
    ) ?? '';
  return (
    <section className="answer-panel" aria-label="Answer workspace">
      <div className={`answer-scroll ${turn ? '' : 'is-empty'}`}>
        {!turn ? (
          <div className="empty-state">
            <h1>Let’s work through it.</h1>
            <p>Bring a question. We’ll take it from there.</p>
            <div className="empty-actions">
              <button className="primary" onClick={openSettings}>
                Personalize your answers
              </button>
              <button className="text-button" onClick={() => void work.sample()}>
                Try a sample session
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="question-card">
              <span className="eyebrow">
                <MessageSquare size={12} /> CURRENT QUESTION
              </span>
              <h2>{turn.question}</h2>
            </div>
            <div className="response-label">
              <span className="assistant-avatar">
                <Sparkles size={13} />
              </span>
              <strong>{turn.detour ? 'Quick aside' : 'Suggested response'}</strong>
              <span className={`response-status ${turn.status}`}>
                {turn.status === 'streaming'
                  ? turn.answer
                    ? 'Picking up where it stopped…'
                    : 'Writing…'
                  : turn.status === 'done'
                    ? 'Ready'
                    : turn.status === 'cancelled'
                      ? turn.interrupted
                        ? 'Interrupted — they moved on'
                        : 'Interrupted'
                      : 'Incomplete'}
              </span>
            </div>
            <article className="markdown">
              <Markdown
                components={{ a: ({ children }) => <span>{children}</span>, img: () => null }}
              >
                {text ||
                  (turn.status === 'streaming'
                    ? 'Thinking through the question…'
                    : 'No response completed. Try the question again.')}
              </Markdown>
              {turn.status === 'streaming' && <span className="stream-cursor" />}
            </article>
            {turn.status === 'done' && (
              <div className="answer-actions">
                <button
                  className="subtle"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(text)
                      .then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      })
                      .catch(() =>
                        work.setError('Could not copy. Select the response and copy it manually.'),
                      );
                  }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}{' '}
                  {copied ? 'Copied' : 'Copy response'}
                </button>
                <span>Review for accuracy before using.</span>
              </div>
            )}
          </>
        )}
      </div>
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          void work.ask(work.question);
        }}
      >
        <label className="sr-only" htmlFor="question">
          {work.turns.length
            ? 'Ask a follow-up or change the requirements'
            : 'What would you like to work through?'}
        </label>
        <textarea
          id="question"
          value={work.question}
          maxLength={20000}
          onChange={(event) => work.setQuestion(event.target.value)}
          placeholder="Ask anything, or add a follow-up…"
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault();
              void work.ask(work.question);
            }
          }}
        />
        <div className="composer-bottom">
          <span>Ctrl + Enter to send</span>
          {work.busy && (
            <button className="subtle" type="button" onClick={() => void work.stopAnswer()}>
              <Square size={12} /> Stop
            </button>
          )}
          <button className="primary small" type="submit" disabled={!work.question.trim()}>
            {work.busy ? 'Send follow-up' : 'Generate answer'}
            <ArrowUpRight size={15} />
          </button>
        </div>
      </form>
    </section>
  );
}
