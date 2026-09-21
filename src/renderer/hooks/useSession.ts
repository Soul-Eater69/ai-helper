import { useCallback, useEffect, useRef, useState } from 'react';
import { desktopAPI, demoAPI } from '../bridge';
import {
  createDocument,
  editDocument,
  acceptRevision,
  undoRevision,
  extractProposal,
  type Proposal,
} from '../../shared/revision';
import {
  settingsSchema,
  type AppEvent,
  type Settings,
  type SavedSession,
} from '../../shared/contracts';
import { shouldAnswer } from '../../shared/transcript';
import {
  END_OF_TURN_MS,
  UtteranceAssembler,
  buildResumePrompt,
  classifyInterruption,
} from '../../shared/turn-taking';
import { buildHistory } from '../../shared/history';
import { SessionSaver } from '../session-saver';
import { AudioCapture } from '../audio/capture';
export interface Turn {
  id: string;
  question: string;
  answer: string;
  status: 'streaming' | 'done' | 'cancelled' | 'error';
  /** Set when the interviewer cut this answer off and it was not resumed. */
  interrupted?: boolean;
  /** A short detour answered without abandoning the turn above it. */
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
    /** The turn this request renders into; differs from `id` when resuming. */
    turnId: string;
    version: number;
    code: string;
    /** Text already shown for this turn, which a resumed answer continues from. */
    prefix: string;
  } | null>(null);
  const audio = useRef<AudioCapture | null>(null);
  const answerTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const utterance = useRef(new UtteranceAssembler());
  /** Set while a detour is answered, so the interrupted answer can be resumed after it. */
  const pendingResume = useRef<{ turnId: string; question: string; prefix: string } | null>(null);
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
  interface AskOptions {
    demo?: boolean;
    /** Rewrite this existing turn instead of opening a new one, for a correction. */
    reviseTurnId?: string;
    /** Continue this turn's existing text instead of replacing it, after a detour. */
    resume?: { turnId: string; question: string; prefix: string };
    /** Render as a short aside beneath the answer it interrupted. */
    detour?: boolean;
  }
  const ask = useCallback(async (text: string, overrides?: AskOptions) => {
    // A resume carries no new question of its own; its prompt is built from the prefix.
    if (!text.trim() && !overrides?.resume) return;
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
      const existing = items.some((t) => t.id === turnId);
      if (existing)
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
        code: state.doc.code,
        codeVersion: state.doc.version,
        language: state.settings.language,
        history,
      });
    } catch (e) {
      if (active.current?.id === id) {
        setBusy(false);
        active.current = null;
        setError(message(e));
        setTurns((items) => items.map((t) => (t.id === turnId ? { ...t, status: 'error' } : t)));
      }
    }
  }, []);
  const askRef = useRef(ask);
  askRef.current = ask;
  const closeUtterance = useCallback(() => {
    const text = utterance.current.take();
    if (!text.trim()) return;

    const state = current.current;
    const live = active.current;
    const openTurn = live ? state.turns.find((t) => t.id === live.turnId) : undefined;
    const streaming = !!live;
    const answeredSoFar = openTurn?.answer ?? '';
    const kind = classifyInterruption(text, { streaming, answeredSoFar });

    if (kind === 'backchannel') return; // "mm-hmm" must not stop the answer.

    if (!streaming) {
      const last = state.turns.at(-1);
      const awaiting = !!last && /\?\s*$/.test(last.answer.trim());
      if (!shouldAnswer(text, awaiting)) return;
      setQuestion(text);
      void askRef.current(text);
      return;
    }

    setQuestion(text);
    if (kind === 'revision') {
      // The premise changed, so the streamed text is void: rewrite this turn.
      setNotice('Updated — rewriting that answer with the new requirement.');
      void askRef.current(text, { reviseTurnId: live!.turnId });
      return;
    }
    if (kind === 'side_question') {
      // Remember where to pick up, answer the aside, then resume automatically.
      pendingResume.current = {
        turnId: live!.turnId,
        question: openTurn?.question ?? '',
        prefix: answeredSoFar,
      };
      void askRef.current(text, { detour: true });
      return;
    }
    void askRef.current(text); // A new subject: the open turn is marked interrupted.
  }, []);
  const closeRef = useRef(closeUtterance);
  closeRef.current = closeUtterance;
  const scheduleUtterance = useCallback(() => {
    clearTimeout(answerTimer.current);
    const tick = () => {
      const reason = utterance.current.closeReason(Date.now());
      if (reason) {
        closeRef.current();
        return;
      }
      const waited = Date.now() - utterance.current.idleSince;
      answerTimer.current = setTimeout(tick, Math.max(50, END_OF_TURN_MS - waited));
    };
    tick();
  }, []);
  useEffect(() => {
    const event = (event: AppEvent) => {
      if (event.type.startsWith('answer.')) {
        if (!('id' in event) || event.id !== active.current?.id) return;
        // A resumed answer writes into the turn it was cut off from, so deltas are
        // addressed by turnId rather than by the request id that produced them.
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
          const nextProposal = extractProposal(whole, captured.version);
          if (nextProposal) {
            setProposal(nextProposal);
            setProposalBase(captured.code);
          }
          active.current = null;
          setBusy(false);
          // A detour just finished: pick the interrupted answer back up.
          const waiting = pendingResume.current;
          if (waiting && waiting.turnId !== target) {
            pendingResume.current = null;
            setNotice('Picking your answer back up where it stopped.');
            void askRef.current('', { resume: waiting });
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
        }
      } else if (event.type === 'transcript.partial') setPartial(event.text);
      else if (event.type === 'transcript.final') {
        setPartial('');
        setTranscript((items) => [...items, { id: event.id, text: event.text }].slice(-100));
        if (!current.current.settings.autoAnswer) {
          setQuestion((previous) => `${previous} ${event.text}`.trim().slice(-20000));
          return;
        }
        // One spoken sentence arrives as several segments. Accumulate them and only
        // act once the speaker has actually finished, otherwise every thinking pause
        // becomes its own question.
        utterance.current.push(event.text, Date.now());
        scheduleUtterance();
      } else if (event.type === 'audio.status') {
        setAudioStatus(event.status);
        if (event.message)
          event.status === 'error' ? setError(event.message) : setNotice(event.message);
        if (event.status === 'stopped' || event.status === 'error') {
          clearTimeout(answerTimer.current);
          utterance.current.reset();
          pendingResume.current = null;
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
      clearTimeout(answerTimer.current);
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
  const reset = async () => {
    try {
      await saver.current.flush();
    } catch (e) {
      setError(message(e));
      return false;
    }
    await stopAnswer();
    await audio.current?.stop();
    clearTimeout(answerTimer.current);
    utterance.current.reset();
    pendingResume.current = null;
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
    stopAudio: () => audio.current?.stop(),
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
