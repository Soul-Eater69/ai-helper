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
      <div className="panel-heading">
        <span>
          <Sparkles size={16} /> Answer
        </span>
        <span className="muted">{work.demo ? 'Sample content' : 'In your words'}</span>
      </div>
      <div className="answer-scroll">
        {!turn ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Sparkles size={25} />
            </div>
            <div className="eyebrow">THINK CLEARLY. SPEAK NATURALLY.</div>
            <h1>Your next good answer starts here.</h1>
            <p>Work through the question, explain the choices, and make the code your own.</p>
            <div className="getting-started">
              <div>
                <span>01</span>
                <p>
                  <strong>Make it yours</strong>Add your experience and speaking style.
                </p>
              </div>
              <div>
                <span>02</span>
                <p>
                  <strong>Bring a question</strong>Type it below or start listening.
                </p>
              </div>
              <div>
                <span>03</span>
                <p>
                  <strong>Build on your answer</strong>Review follow-ups and code changes.
                </p>
              </div>
            </div>
            <button className="primary" onClick={openSettings}>
              Set up your workspace <ArrowUpRight size={16} />
            </button>
            <button className="text-button" onClick={() => void work.sample()}>
              Try a sample session <span>→</span>
            </button>
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
              <strong>Suggested response</strong>
              <span className={`response-status ${turn.status}`}>
                {turn.status === 'streaming'
                  ? 'Writing…'
                  : turn.status === 'done'
                    ? 'Ready'
                    : turn.status === 'cancelled'
                      ? 'Interrupted'
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
        <label htmlFor="question">
          {work.turns.length
            ? 'Ask a follow-up or change the requirements'
            : 'What would you like to work through?'}
        </label>
        <textarea
          id="question"
          value={work.question}
          maxLength={20000}
          onChange={(event) => work.setQuestion(event.target.value)}
          placeholder={
            work.mode === 'behavioral'
              ? 'Tell me about a time you handled a disagreement…'
              : 'Design a parking lot, solve a problem, or paste a follow-up…'
          }
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
