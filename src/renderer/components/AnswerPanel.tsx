import { splitAnswer } from '../../shared/revision';
import { answerAsNotes } from '../../shared/visual-trace';
import { useEffect, useRef, useState } from 'react';
import AnswerContent from './AnswerContent';
import { ArrowUpRight, Check, Copy, MessageSquare, Sparkles, Square } from 'lucide-react';
import type { Workspace } from '../hooks/useSession';
import PracticeTools from './PracticeTools';
export default function AnswerPanel({
  work,
  openSettings,
}: {
  work: Workspace;
  openSettings: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const items = useRef(new Map<string, HTMLElement>());
  const latest = work.turns.at(-1);
  useEffect(() => {
    const item = items.current.get(work.selected ?? latest?.id ?? '');
    if (item && scroll.current) {
      const container = scroll.current;
      container.scrollTop +=
        item.getBoundingClientRect().top - container.getBoundingClientRect().top - 20;
    }
  }, [work.selected, work.navigationRequest, latest?.id]);
  return (
    <section className="answer-panel" aria-label="Answer workspace">
      {work.turns.length > 1 && (
        <div className="conversation-toolbar">
          <span>Conversation · {work.turns.length} exchanges</span>
          <button
            className="text-button"
            onClick={() => {
              if (latest) {
                work.setSelected(latest.id);
                const item = items.current.get(latest.id);
                if (item && scroll.current)
                  scroll.current.scrollTop +=
                    item.getBoundingClientRect().top -
                    scroll.current.getBoundingClientRect().top -
                    20;
              }
            }}
          >
            Latest response ↓
          </button>
        </div>
      )}
      <div ref={scroll} className={`answer-scroll ${latest ? '' : 'is-empty'}`}>
        {!latest ? (
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
          work.turns.map((turn, index) => {
            const text =
              turn.status === 'done' && turn.id === latest.id
                ? splitAnswer(turn.answer, 0).spoken
                : turn.answer;
            return (
              <section
                className="conversation-turn"
                aria-label={`Exchange ${index + 1}`}
                key={turn.id}
                ref={(node) => {
                  if (node) items.current.set(turn.id, node);
                  else items.current.delete(turn.id);
                }}
              >
                <div className="question-card">
                  <span className="eyebrow">
                    <MessageSquare size={12} /> QUESTION {index + 1}
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
                  <AnswerContent
                    streaming={turn.status === 'streaming'}
                    text={
                      text ||
                      (turn.status === 'streaming'
                        ? 'Thinking through the question…'
                        : 'No response completed. Try the question again.')
                    }
                  />
                  {turn.status === 'streaming' && <span className="stream-cursor" />}
                </article>
                {turn.status === 'done' && (
                  <div className="answer-actions">
                    <button
                      className="subtle"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(answerAsNotes(text))
                          .then(() => {
                            setCopied(turn.id);
                            setTimeout(() => setCopied(null), 2000);
                          })
                          .catch(() =>
                            work.setError(
                              'Could not copy. Select the response and copy it manually.',
                            ),
                          );
                      }}
                    >
                      {copied === turn.id ? <Check size={14} /> : <Copy size={14} />}{' '}
                      {copied === turn.id ? 'Copied' : 'Copy response'}
                    </button>
                    <span>Review for accuracy before using.</span>
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
      <PracticeTools work={work} />
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
