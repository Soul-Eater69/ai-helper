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
  stages,
  type AppEvent,
  type Mode,
  type Settings,
  type SavedSession,
} from '../../shared/contracts';
import { shouldAnswer } from '../../shared/transcript';
import { SessionSaver } from '../session-saver';
import { AudioCapture } from '../audio/capture';
export interface Turn {
  id: string;
  question: string;
  answer: string;
  status: 'streaming' | 'done' | 'cancelled' | 'error';
}
export function useSession() {
  const [settings, setSettings] = useState<Settings>(settingsSchema.parse({}));
  const [hasKey, setHasKey] = useState(false);
  const [mode, setMode] = useState<Mode>('lld');
  const [stage, setStage] = useState('scope');
  const [doc, setDoc] = useState(
    createDocument(
      '# Your working code goes here.\n# AI changes appear as proposals for you to review.\n',
    ),
  );
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
  const active = useRef<{ id: string; version: number; code: string } | null>(null);
  const audio = useRef<AudioCapture | null>(null);
  const answerTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingSpeech = useRef('');
  const current = useRef({ settings, mode, stage, doc, turns, demo });
  current.current = { settings, mode, stage, doc, turns, demo };
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
    setBusy(false);
    if (previous)
      setTurns((items) =>
        items.map((t) => (t.id === previous.id ? { ...t, status: 'cancelled' } : t)),
      );
    await api().cancel();
  }, []);
  const ask = useCallback(
    async (text: string, overrides?: { demo?: boolean; stage?: string; mode?: Mode }) => {
      if (!text.trim()) return;
      const state = current.current;
      const useDemo = overrides?.demo ?? state.demo;
      if (!useDemo && !desktopAPI.isDesktop) {
        setError('Open the Windows app for live answers, or try the sample session.');
        return;
      }
      const id = crypto.randomUUID();
      if (active.current) {
        const old = active.current.id;
        setTurns((items) => items.map((t) => (t.id === old ? { ...t, status: 'cancelled' } : t)));
      }
      active.current = { id, version: state.doc.version, code: state.doc.code };
      setBusy(true);
      setError('');
      setNotice('');
      setProposal(null);
      setSelected(id);
      setTurns((items) =>
        [...items, { id, question: text.trim(), answer: '', status: 'streaming' as const }].slice(
          -30,
        ),
      );
      const history = state.turns
        .slice(-6)
        .flatMap((t) => [
          { role: 'user' as const, content: t.question.slice(0, 20000) },
          ...(t.status === 'done'
            ? [{ role: 'assistant' as const, content: t.answer.slice(0, 20000) }]
            : []),
        ]);
      try {
        await (useDemo ? demoAPI : desktopAPI).answer({
          id,
          question: text,
          mode: overrides?.mode ?? state.mode,
          stage: overrides?.stage ?? state.stage,
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
          setTurns((items) => items.map((t) => (t.id === id ? { ...t, status: 'error' } : t)));
        }
      }
    },
    [],
  );
  const askRef = useRef(ask);
  askRef.current = ask;
  useEffect(() => {
    const event = (event: AppEvent) => {
      if (event.type.startsWith('answer.')) {
        if (!('id' in event) || event.id !== active.current?.id) return;
        if (event.type === 'answer.delta')
          setTurns((items) =>
            items.map((t) => (t.id === event.id ? { ...t, answer: t.answer + event.text } : t)),
          );
        if (event.type === 'answer.done') {
          const captured = active.current!;
          setTurns((items) =>
            items.map((t) =>
              t.id === event.id ? { ...t, answer: event.text, status: 'done' } : t,
            ),
          );
          setProposal(extractProposal(event.text, captured.version));
          setProposalBase(captured.code);
          active.current = null;
          setBusy(false);
        }
        if (event.type === 'answer.error' || event.type === 'answer.cancelled') {
          if (event.type === 'answer.error') setError(event.message);
          setTurns((items) =>
            items.map((t) =>
              t.id === event.id
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
        if (current.current.settings.autoAnswer) {
          pendingSpeech.current = `${pendingSpeech.current} ${event.text}`.trim().slice(-20000);
          clearTimeout(answerTimer.current);
          answerTimer.current = setTimeout(() => {
            const text = pendingSpeech.current;
            pendingSpeech.current = '';
            const last = current.current.turns.at(-1);
            const awaiting = !!last && /\?\s*$/.test(last.answer.trim());
            if (shouldAnswer(text, awaiting)) {
              setQuestion(text);
              void askRef.current(text);
            }
          }, 1100);
        } else setQuestion((previous) => `${previous} ${event.text}`.trim().slice(-20000));
      } else if (event.type === 'audio.status') {
        setAudioStatus(event.status);
        if (event.message)
          event.status === 'error' ? setError(event.message) : setNotice(event.message);
        if (event.status === 'stopped' || event.status === 'error') {
          clearTimeout(answerTimer.current);
          pendingSpeech.current = '';
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
    if (!settings.saveHistory || demo || !turns.length) return;
    const complete = turns.filter((t) => t.status === 'done');
    if (!complete.length) return;
    saver.current.schedule({
      id: sessionId.current,
      title: turns[0].question.slice(0, 160),
      mode,
      language: settings.language,
      updatedAt: new Date().toISOString(),
      code: doc.code,
      turns: complete.map(({ id, question, answer }) => ({ id, question, answer })),
    });
  }, [turns, doc.code, settings.saveHistory, settings.language, mode, demo]);
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
  const reset = async (nextMode = mode) => {
    try {
      await saver.current.flush();
    } catch (e) {
      setError(message(e));
      return false;
    }
    await stopAnswer();
    await audio.current?.stop();
    clearTimeout(answerTimer.current);
    pendingSpeech.current = '';
    sessionId.current = crypto.randomUUID();
    setMode(nextMode);
    setStage(stages[nextMode][0].id);
    setTurns([]);
    setSelected(null);
    setProposal(null);
    setTranscript([]);
    setPartial('');
    setQuestion('');
    setError('');
    setNotice('');
    setDemo(false);
    setDoc(
      createDocument(
        '# Your working code goes here.\n# AI changes appear as proposals for you to review.\n',
      ),
    );
    return true;
  };
  const sample = async () => {
    await stopAnswer();
    await audio.current?.stop();
    setDemo(true);
    setStage(mode === 'behavioral' ? 'story' : 'code');
    const text =
      mode === 'behavioral'
        ? 'Tell me about a time you disagreed with a teammate.'
        : mode === 'dsa'
          ? 'Solve Two Sum and explain the trade-offs.'
          : 'Implement a single-level parking lot with spot allocation and release.';
    setQuestion(text);
    await ask(text, { demo: true, stage: mode === 'behavioral' ? 'story' : 'code' });
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
    if (!(await reset(saved.mode))) return;
    sessionId.current = saved.id;
    setDoc(createDocument(saved.code));
    setTurns(saved.turns.map((t) => ({ ...t, status: 'done' })));
    setSelected(saved.turns.at(-1)?.id ?? null);
    setSettings((s) => ({ ...s, language: saved.language }));
  };
  return {
    settings,
    setSettings,
    hasKey,
    refreshSettings,
    mode,
    stage,
    setStage,
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
