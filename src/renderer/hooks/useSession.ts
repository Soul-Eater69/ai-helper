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
import { SpeechQueue } from '../speech-queue';
import { buildHistory } from '../../shared/history';
import { SessionSaver } from '../session-saver';
import { AudioCapture } from '../audio/capture';
export interface Turn {
  id: string;
  question: string;
  answer: string;
  status: 'streaming' | 'done' | 'cancelled' | 'error';
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
  const [proposalBaseSource, setProposalBaseSource] = useState<'working' | 'proposal'>('working');
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
    version: number;
    code: string;
    source: 'working' | 'proposal';
  } | null>(null);
  const audio = useRef<AudioCapture | null>(null);
  const speechQueue = useRef<SpeechQueue | null>(null);
  const current = useRef({ settings, context, doc, turns, demo, proposal });
  current.current = { settings, context, doc, turns, demo, proposal };
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
    setBusy(false);
    if (previous)
      setTurns((items) =>
        items.map((t) => (t.id === previous.id ? { ...t, status: 'cancelled' } : t)),
      );
    await api().cancel();
  }, []);
  const ask = useCallback(
    async (
      text: string,
      overrides?: { demo?: boolean; speech?: boolean; recentSpeech?: string[] },
    ) => {
      if (!text.trim()) return;
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
      if (active.current) {
        const old = active.current.id;
        setTurns((items) => items.map((t) => (t.id === old ? { ...t, status: 'cancelled' } : t)));
      }
      const useProposal = !!state.proposal && state.proposal.baseVersion === state.doc.version;
      const baseCode = useProposal ? state.proposal!.code : state.doc.code;
      const source = useProposal ? ('proposal' as const) : ('working' as const);
      active.current = { id, version: state.doc.version, code: baseCode, source };
      setBusy(true);
      setError('');
      setNotice('');
      setSelected(id);
      setTurns((items) => [
        ...(items.length >= 30 ? [items[0], ...items.slice(-28)] : items),
        { id, question: text.trim(), answer: '', status: 'streaming' as const },
      ]);
      const history = buildHistory(state.turns);
      try {
        await (useDemo ? demoAPI : desktopAPI).answer({
          id,
          question: text,
          context: state.context,
          speechContext: overrides?.recentSpeech,
          code: baseCode,
          codeSource: source,
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
    speechQueue.current = new SpeechQueue(
      (text, recentSpeech, finalize) => {
        const state = current.current;
        return desktopAPI.routeSpeech({
          text,
          recentSpeech,
          finalize,
          context: state.context,
          history: buildHistory(state.turns),
          currentResponse: state.turns.at(-1)?.answer.slice(-6000) ?? '',
        });
      },
      (text, recentSpeech) => {
        setQuestion(text);
        void askRef.current(text, { speech: true, recentSpeech });
      },
      setSpeechStatus,
      (error) => setError(message(error)),
    );
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
          const nextProposal = extractProposal(event.text, captured.version);
          if (nextProposal) {
            setProposal(nextProposal);
            setProposalBase(captured.code);
            setProposalBaseSource(captured.source);
          }
          active.current = null;
          setBusy(false);
          setSpeechStatus('');
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
    proposalBaseSource,
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
      if (active.current?.source === 'proposal') void stopAnswer();
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
