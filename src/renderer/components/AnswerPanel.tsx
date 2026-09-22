import { splitAnswer } from '../../shared/revision';
import { answerAsNotes } from '../../shared/visual-trace';
import { useEffect, useRef, useState } from 'react';
import AnswerContent from './AnswerContent';
import { ArrowUpRight, Check, Copy, MessageSquare, Sparkles, Square } from 'lucide-react';
import type { Workspace } from '../hooks/useSession';
import PracticeTools from './PracticeTools';
import QuestionImages from './QuestionImages';
import { readQuestionImage } from '../images';
import { MAX_IMAGES } from '../../shared/images';
export default function AnswerPanel({
  work,
  openSettings,
}: {
  work: Workspace;
  openSettings: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [processingImage, setProcessingImage] = useState(false);
  const imageWork = useRef(0);
  const imageBusy = useRef(false);
  useEffect(() => {
    imageWork.current++;
    imageBusy.current = false;
    setProcessingImage(false);
    return () => {
      imageWork.current++;
    };
  }, [work.sessionId]);
  async function addFiles(files: File[]) {
    if (imageBusy.current) return;
    if (work.images.length + files.length > MAX_IMAGES) {
      work.setError('Attach up to three images per question.');
      return;
    }
    const ticket = ++imageWork.current;
    imageBusy.current = true;
    setProcessingImage(true);
    try {
      const images = await Promise.all(files.map(readQuestionImage));
      if (ticket === imageWork.current)
        work.setImages((items) => [...items, ...images].slice(0, MAX_IMAGES));
    } catch (error) {
      if (ticket === imageWork.current)
        work.setError(error instanceof Error ? error.message : 'Could not read the image.');
    } finally {
      if (ticket === imageWork.current) {
        imageBusy.current = false;
        setProcessingImage(false);
      }
    }
  }
  async function send() {
    if (imageBusy.current) return;
    const images = work.images;
    const ticket = imageWork.current;
    const sent = await work.ask(work.question, { images });
    if (sent && ticket === imageWork.current)
      work.setImages((items) =>
        items.filter((image) => !images.some((sentImage) => sentImage.id === image.id)),
      );
  }
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
                  {!!turn.images?.length && (
                    <div className="question-images sent-images">
                      {turn.images.map((image) => (
                        <img key={image.id} src={image.dataUrl} alt={image.name} />
                      ))}
                    </div>
                  )}
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
          send();
        }}
      >
        <QuestionImages
          key={work.sessionId}
          work={work}
          addFiles={addFiles}
          processing={processingImage}
        />
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
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.items)
              .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
              .map((item) => item.getAsFile())
              .filter((file): file is File => !!file);
            if (files.length) {
              event.preventDefault();
              void addFiles(files);
            }
          }}
          placeholder="Ask anything, or add a follow-up…"
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault();
              send();
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
          <button
            className="primary small"
            type="submit"
            disabled={processingImage || (!work.question.trim() && !work.images.length)}
          >
            {work.busy ? 'Send follow-up' : 'Generate answer'}
            <ArrowUpRight size={15} />
          </button>
        </div>
      </form>
    </section>
  );
}
