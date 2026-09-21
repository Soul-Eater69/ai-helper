import { useCallback, useEffect, useRef, useState } from 'react';
import { desktopAPI, demoAPI } from '../bridge';
import {
  createDocument,
  editDocument,
  acceptRevision,
  undoRevision,
  splitAnswer,
  type Proposal,
} from '../../shared/revision';
import {
  settingsSchema,
  type AppEvent,
  type Settings,
  type SavedSession,
} from '../../shared/contracts';
import { SpeechQueue } from '../speech-queue';
import { buildHistory } from '../../shared/history';
import { buildResumePrompt, classifyInterruption } from '../../shared/turn-taking';
import { SessionSaver } from '../session-saver';
import { AudioCapture } from '../audio/capture';
export interface Turn {
  id: string;
  question: string;
  answer: string;
  status: 'streaming' | 'done' | 'cancelled' | 'error';
  /** Cut off by a change of subject and not resumed. */
  interrupted?: boolean;
  /** A brief aside answered without abandoning the answer above it. */
  detour?: boolean;
}
export const INITIAL_CODE =
  '# Your working code goes here.\n# AI changes appear as proposals for you to review.\n';
export function useSession() {
  const [settings, setSettings] = useState<Settings>(settingsSchema.parse({}));
  const [hasKey, setHasKey] = useState(false);
  const [context, setContext] = useState('');
  const [doc, setDoc] = useState(createDocument(INITIAL_CODE));
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [proposalBase, setProposalBase] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [transcript, setTranscript] = useState<{ id: string; text: string }[]>([]);
  const [partial, setPartial] = useState('');
  const [speechStatus, setSpeechStatus] = useState('');
  const [audioStatus, setAudioStatus] = useState('stopped');
  const [level, setLevel] = useState(0);
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const sessionId = useRef<string>(crypto.randomUUID());
  const saver = useRef(
    new SessionSaver(
      async (snapshot) => {
        await desktopAPI.saveSession(snapshot);
        setSessions(await desktopAPI.listSessions());
      },
      (e) => setError(message(e)),
    ),
  );
  const active = useRef<{
    id: string;
    /** The turn this request writes into; differs from `id` when resuming. */
    turnId: string;
    version: number;
    code: string;
    /** Text already on screen for that turn, which a resumed answer continues. */
    prefix: string;
  } | null>(null);
  /** Set while a detour is answered, so the interrupted answer can resume after it. */
  const pendingResume = useRef<{ turnId: string; question: string; prefix: string } | null>(null);
  const audio = useRef<AudioCapture | null>(null);
  const speechQueue = useRef<SpeechQueue | null>(null);
  const current = useRef({ settings, context, doc, turns, demo });
  current.current = { settings, context, doc, turns, demo };
  const api = () => (current.current.demo ? demoAPI : desktopAPI);
  const refreshSettings = useCallback(async () => {
    try {
      const result = await desktopAPI.getSettings();
      setSettings(result.settings);
      setHasKey(result.hasKey);
      setSessions(await desktopAPI.listSessions());
    } catch (e) {
      setError(message(e));
    }
  }, []);
  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);
  const stopAnswer = useCallback(async () => {
    speechQueue.current?.stop();
    void desktopAPI.cancelSpeech();
    const previous = active.current;
    active.current = null;
    pendingResume.current = null;
    setBusy(false);
    if (previous)
      setTurns((items) =>
        items.map((t) => (t.id === previous.turnId ? { ...t, status: 'cancelled' } : t)),
      );
    await api().cancel();
  }, []);
  const ask = useCallback(
    async (
      text: string,
      overrides?: {
        demo?: boolean;
        speech?: boolean;
        recentSpeech?: string[];
        /** Rewrite this existing turn rather than opening another, for a correction. */
        reviseTurnId?: string;
        /** Continue this turn's text rather than replacing it, after a detour. */
        resume?: { turnId: string; question: string; prefix: string };
        /** Render as a short aside beneath the answer it interrupted. */
        detour?: boolean;
      },
    ) => {
      // A resume carries no new question; its prompt is built from the saved prefix.
      if (!text.trim() && !overrides?.resume) return;
      if (!overrides?.speech) {
        speechQueue.current?.stop();
        void desktopAPI.cancelSpeech();
      }
      const state = current.current;
      const useDemo = overrides?.demo ?? state.demo;
      if (!useDemo && !desktopAPI.isDesktop) {
        setError('Open the Windows app for live answers, or try the sample session.');
        return;
      }
      const id = crypto.randomUUID();
      const resume = overrides?.resume;
      const revise = overrides?.reviseTurnId;
      // A resumed answer continues the turn it was cut off from; a correction rewrites
      // that turn in place. Only a genuinely new question opens another entry.
      const turnId = resume?.turnId ?? revise ?? id;
      const prefix = resume ? resume.prefix : '';
      if (active.current && active.current.turnId !== turnId) {
        const cut = active.current.turnId;
        setTurns((items) =>
          items.map((t) => (t.id === cut ? { ...t, status: 'cancelled', interrupted: true } : t)),
        );
      }
      active.current = { id, turnId, version: state.doc.version, code: state.doc.code, prefix };
      setBusy(true);
      setError('');
      setNotice('');
      setSelected(turnId);
      setTurns((items) => {
        if (items.some((t) => t.id === turnId))
          return items.map((t) =>
            t.id === turnId
              ? {
                  ...t,
                  // A revision restarts the text; a resume keeps what was already read.
                  answer: resume ? t.answer : '',
                  question: revise ? `${t.question} — ${text.trim()}` : t.question,
                  status: 'streaming' as const,
                  interrupted: false,
                }
              : t,
          );
        return [
          ...(items.length >= 30 ? [items[0], ...items.slice(-28)] : items),
          {
            id: turnId,
            question: text.trim(),
            answer: '',
            status: 'streaming' as const,
            detour: overrides?.detour,
          },
        ];
      });
      const history = buildHistory(state.turns);
      try {
        await (useDemo ? demoAPI : desktopAPI).answer({
          id,
          question: resume ? buildResumePrompt(resume.question, resume.prefix) : text,
          context: state.context,
          speechContext: overrides?.recentSpeech,
          code: state.doc.code,
          codeVersion: state.doc.version,
          language: state.settings.language,
          history,
        });
      } catch (e) {
        if (active.current?.id === id) {
          setBusy(false);
          active.current = null;
          pendingResume.current = null;
          setError(message(e));
          setTurns((items) => items.map((t) => (t.id === turnId ? { ...t, status: 'error' } : t)));
        }
      }
    },
    [],
  );
  const askRef = useRef(ask);
  askRef.current = ask;
  useEffect(() => {
    speechQueue.current = new SpeechQueue(
      (text, recentSpeech) => {
        const state = current.current;
        return desktopAPI.routeSpeech({
          text,
          recentSpeech,
          context: state.context,
          history: buildHistory(state.turns),
          currentResponse: state.turns.at(-1)?.answer.slice(-6000) ?? '',
        });
      },
      (text, recentSpeech) => {
        setQuestion(text);
        // The router already decided this deserves a response. What it does not decide
        // is what an approved utterance means for an answer already in flight.
        const live = active.current;
        if (!live) {
          void askRef.current(text, { speech: true, recentSpeech });
          return;
        }
        const openTurn = current.current.turns.find((t) => t.id === live.turnId);
        const answeredSoFar = openTurn?.answer ?? '';
        const kind = classifyInterruption(text, { answeredSoFar });
        if (kind === 'revision') {
          setNotice('Updated — rewriting that answer with the new requirement.');
          void askRef.current(text, { speech: true, recentSpeech, reviseTurnId: live.turnId });
          return;
        }
        if (kind === 'side_question') {
          pendingResume.current = {
            turnId: live.turnId,
            question: openTurn?.question ?? '',
            prefix: answeredSoFar,
          };
          void askRef.current(text, { speech: true, recentSpeech, detour: true });
          return;
        }
        void askRef.current(text, { speech: true, recentSpeech });
      },
      setSpeechStatus,
      (error) => setError(message(error)),
    );
    const event = (event: AppEvent) => {
      if (event.type.startsWith('answer.')) {
        if (!('id' in event) || event.id !== active.current?.id) return;
        // A resumed answer renders into the turn it was cut off from, so events are
        // addressed by turnId rather than the request id that produced them.
        const captured = active.current;
        const target = captured.turnId;
        if (event.type === 'answer.delta')
          setTurns((items) =>
            items.map((t) => (t.id === target ? { ...t, answer: t.answer + event.text } : t)),
          );
        if (event.type === 'answer.done') {
          const whole = captured.prefix + event.text;
          setTurns((items) =>
            items.map((t) => (t.id === target ? { ...t, answer: whole, status: 'done' } : t)),
          );
          // `whole` includes the prefix a resumed answer continued from, so a
          // proposal made across a resume sees the complete code block.
          const { proposal: nextProposal } = splitAnswer(whole, captured.version);
          if (nextProposal) {
            setProposal(nextProposal);
            setProposalBase(captured.code);
          }
          active.current = null;
          setBusy(false);
          setSpeechStatus('');
          const waiting = pendingResume.current;
          if (waiting && waiting.turnId !== target) {
            pendingResume.current = null;
            setNotice('Picking your answer back up where it stopped.');
            void askRef.current('', { speech: true, resume: waiting });
          }
        }
        if (event.type === 'answer.error' || event.type === 'answer.cancelled') {
          if (event.type === 'answer.error') setError(event.message);
          pendingResume.current = null;
          setTurns((items) =>
            items.map((t) =>
              t.id === target
                ? { ...t, status: event.type === 'answer.error' ? 'error' : 'cancelled' }
                : t,
            ),
          );
          active.current = null;
          setBusy(false);
          setSpeechStatus('');
        }
      } else if (event.type === 'speech.started') {
        if (current.current.settings.autoAnswer) speechQueue.current?.started(event.id);
      } else if (event.type === 'speech.skipped') {
        if (current.current.settings.autoAnswer) speechQueue.current?.final('', event.id);
      } else if (event.type === 'transcript.partial') {
        setPartial(event.text);
        if (current.current.settings.autoAnswer) speechQueue.current?.partial();
      } else if (event.type === 'transcript.final') {
        setPartial('');
        setTranscript((items) => [...items, { id: event.id, text: event.text }].slice(-100));
        if (current.current.settings.autoAnswer) speechQueue.current?.final(event.text, event.id);
        else setQuestion((previous) => `${previous} ${event.text}`.trim().slice(-20000));
      } else if (event.type === 'audio.status') {
        setAudioStatus(event.status);
        if (event.message)
          event.status === 'error' ? setError(event.message) : setNotice(event.message);
        if (['stopped', 'error', 'reconnecting', 'connecting'].includes(event.status)) {
          speechQueue.current?.stop();
          void desktopAPI.cancelSpeech();
        }
        if (event.status === 'stopped' || event.status === 'error') void audio.current?.release();
      }
    };
    const removeDesktop = desktopAPI.onEvent(event);
    const removeDemo = desktopAPI === demoAPI ? () => undefined : demoAPI.onEvent(event);
    audio.current = new AudioCapture(desktopAPI, setLevel, () => {
      setAudioStatus('stopped');
      setNotice('Audio sharing ended.');
    });
    return () => {
      removeDesktop();
      removeDemo();
      speechQueue.current?.stop(true);
      void desktopAPI.cancelSpeech();
      void audio.current?.stop();
    };
  }, []);
  useEffect(() => {
    if (!settings.saveHistory || demo) return;
    const complete = turns.filter((t) => t.status === 'done');
    if (!complete.length && !context.trim() && doc.code === INITIAL_CODE) return;
    saver.current.schedule({
      id: sessionId.current,
      title: (turns[0]?.question || context.trim() || 'Working code').slice(0, 160),
      context,
      language: settings.language,
      updatedAt: new Date().toISOString(),
      code: doc.code,
      turns: complete.map(({ id, question, answer }) => ({ id, question, answer })),
    });
  }, [turns, doc.code, settings.saveHistory, settings.language, context, demo]);
  useEffect(() => {
    let closing = false;
    const flushOnClose = (event: BeforeUnloadEvent) => {
      if (closing || !saver.current.hasPending) return;
      event.preventDefault();
      event.returnValue = '';
      void saver.current
        .flush()
        .then(() => {
          closing = true;
          window.close();
        })
        .catch((e) => setError(message(e)));
    };
    window.addEventListener('beforeunload', flushOnClose);
    return () => window.removeEventListener('beforeunload', flushOnClose);
  }, []);
  useEffect(() => {
    if (!settings.autoAnswer) {
      speechQueue.current?.stop();
      void desktopAPI.cancelSpeech();
    }
  }, [settings.autoAnswer]);
  const reset = async () => {
    try {
      await saver.current.flush();
    } catch (e) {
      setError(message(e));
      return false;
    }
    await stopAnswer();
    await audio.current?.stop();
    speechQueue.current?.stop(true);
    void desktopAPI.cancelSpeech();
    sessionId.current = crypto.randomUUID();
    setContext('');
    setTurns([]);
    setSelected(null);
    setProposal(null);
    setTranscript([]);
    setPartial('');
    setQuestion('');
    setError('');
    setNotice('');
    setDemo(false);
    setDoc(createDocument(INITIAL_CODE));
    return true;
  };
  const sample = async () => {
    await stopAnswer();
    await audio.current?.stop();
    setDemo(true);
    const text = 'Implement a single-level parking lot with spot allocation and release.';
    setQuestion(text);
    await ask(text, { demo: true });
  };
  const accept = () => {
    try {
      if (proposal) {
        setDoc(acceptRevision(doc, proposal));
        setProposal(null);
        setNotice('Revision accepted');
      }
    } catch (e) {
      setError(message(e));
    }
  };
  const load = async (saved: SavedSession) => {
    if (!(await reset())) return;
    sessionId.current = saved.id;
    setDoc(createDocument(saved.code));
    setContext(saved.context);
    setTurns(saved.turns.map((t) => ({ ...t, status: 'done' })));
    setSelected(saved.turns.at(-1)?.id ?? null);
    setSettings((s) => ({ ...s, language: saved.language }));
  };
  return {
    settings,
    setSettings,
    hasKey,
    refreshSettings,
    context,
    setContext,
    doc,
    proposal,
    proposalBase,
    turns,
    selected,
    setSelected,
    question,
    setQuestion,
    busy,
    demo,
    error,
    setError,
    notice,
    setNotice,
    transcript,
    partial,
    audioStatus,
    speechStatus,
    level,
    sessions,
    ask,
    stopAnswer,
    reset,
    sample,
    accept,
    load,
    setCode: (code: string) => setDoc((value) => editDocument(value, code)),
    reject: () => {
      setProposal(null);
      setNotice('Proposal dismissed. Your code is unchanged.');
    },
    undo: () => {
      setDoc((value) => undoRevision(value));
      setProposal(null);
      setNotice('Previous code restored');
    },
    startAudio: async (source: 'system' | 'microphone') => {
      setError('');
      setNotice('');
      setAudioStatus('connecting');
      try {
        await audio.current?.start(source);
      } catch (e) {
        setError(message(e));
        setAudioStatus('stopped');
      }
    },
    stopAudio: () => {
      speechQueue.current?.stop();
      void desktopAPI.cancelSpeech();
      return audio.current?.stop();
    },
    deleteSession: async (id: string) => {
      await desktopAPI.deleteSession(id);
      setSessions(await desktopAPI.listSessions());
    },
  };
}
function message(error: unknown): string {
  return error instanceof Error
    ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
    : 'Something went wrong. Please retry.';
}
export type Workspace = ReturnType<typeof useSession>;
