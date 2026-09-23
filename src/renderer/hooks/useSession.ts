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
  type AnswerRequest,
} from '../../shared/contracts';
import { SpeechQueue } from '../speech-queue';
import { buildHistory, compactSpeechRequest } from '../../shared/history';
import type { ImageAttachment } from '../../shared/images';
import { SessionSaver } from '../session-saver';
import { AudioCapture } from '../audio/capture';
import { DeltaBuffer } from '../delta-buffer';
export interface Turn {
  images?: ImageAttachment[];
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
  const [navigationRequest, setNavigationRequest] = useState(0);
  const [question, setQuestion] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [transcript, setTranscript] = useState<{ id: string; text: string }[]>([]);
  const [partial, setPartial] = useState('');
  const [speechStatus, setSpeechStatus] = useState('');
  const captureStarting = useRef(false);
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
  const pausedAudio = useRef(false);
  const pausing = useRef<Promise<void> | null>(null);
  const speechQueue = useRef<SpeechQueue | null>(null);
  const prepared = useRef<AnswerRequest | null>(null);
  const deltas = useRef(
    new DeltaBuffer((id, text) => {
      if (active.current?.id !== id) return;
      setTurns((items) =>
        items.map((turn) => (turn.id === id ? { ...turn, answer: turn.answer + text } : turn)),
      );
    }),
  );
  const current = useRef({ settings, context, doc, turns, demo, proposal, images });
  current.current = { settings, context, doc, turns, demo, proposal, images };
  const api = () => (current.current.demo ? demoAPI : desktopAPI);
  const makeRequest = (
    id: string,
    text: string,
    recentSpeech?: string[],
    attached: ImageAttachment[] = [],
  ): AnswerRequest => {
    const state = current.current;
    const useProposal = !!state.proposal && state.proposal.baseVersion === state.doc.version;
    return {
      id,
      question: text,
      images: attached,
      context: state.context,
      speechContext: recentSpeech,
      code: useProposal ? state.proposal!.code : state.doc.code,
      codeSource: useProposal ? 'proposal' : 'working',
      codeVersion: state.doc.version,
      language: state.settings.language,
      history: buildHistory(state.turns),
    };
  };
  const refreshSettings = useCallback(async () => {
    try {
      const result = await desktopAPI.getSettings();
      setSettings(settingsSchema.parse(result.settings));
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
    deltas.current.flush();
    pausedAudio.current = false;
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
      overrides?: {
        demo?: boolean;
        speech?: boolean;
        recentSpeech?: string[];
        images?: ImageAttachment[];
      },
    ) => {
      const attached = overrides?.images ?? [];
      if (!text.trim() && !attached.length) return;
      text = text.trim() || 'Read the question in the attached image and help me work through it.';
      if (!overrides?.speech) {
        speechQueue.current?.stop();
        void desktopAPI.cancelSpeech();
      }
      const state = current.current;
      const useDemo = overrides?.demo ?? state.demo;
      if (useDemo && attached.length) {
        setError(
          'Image questions need the desktop app and your API key. Leave the sample session first.',
        );
        return false;
      }
      if (!useDemo && !desktopAPI.isDesktop) {
        setError('Open the Windows app for live answers, or try the sample session.');
        return;
      }
      const id = overrides?.speech && prepared.current ? prepared.current.id : crypto.randomUUID();
      deltas.current.flush();
      prepared.current = null;
      if (active.current) {
        const old = active.current.id;
        setTurns((items) => items.map((t) => (t.id === old ? { ...t, status: 'cancelled' } : t)));
      }
      const request = makeRequest(id, text, overrides?.recentSpeech, attached);
      const baseCode = request.code;
      const source = request.codeSource!;
      active.current = { id, version: state.doc.version, code: baseCode, source };
      setBusy(true);
      setError('');
      setNotice('');
      setSelected(id);
      setTurns((items) => [
        ...(items.length >= 30 ? [items[0], ...items.slice(-28)] : items),
        { id, question: text.trim(), images: attached, answer: '', status: 'streaming' as const },
      ]);
      try {
        await (useDemo ? demoAPI : desktopAPI).answer(request);
        return true;
      } catch (e) {
        if (active.current?.id === id) {
          setBusy(false);
          active.current = null;
          setError(message(e));
          setTurns((items) => items.map((t) => (t.id === id ? { ...t, status: 'error' } : t)));
        }
        return false;
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
        return desktopAPI.routeSpeech(
          compactSpeechRequest({
            text,
            recentSpeech,
            finalize,
            answerId: prepared.current?.id,
            context: state.context,
            history: buildHistory(state.turns),
            currentResponse: state.turns.at(-1)?.answer.slice(-6000) ?? '',
          }),
        );
      },
      (text, recentSpeech) => {
        setQuestion(text);
        void askRef.current(text, { speech: true, recentSpeech });
      },
      setSpeechStatus,
      (error) => setError(message(error)),
      {
        settleMs: 0, // Provider-final text is already endpointed; do not stack another silence timer.
        prepare: (text, recent) => {
          if (current.current.demo || !desktopAPI.isDesktop) return;
          const request = makeRequest(crypto.randomUUID(), text, recent);
          prepared.current = request;
          if (!current.current.settings.earlyPreparation) return;
          void desktopAPI.prepareAnswer(request).catch(() => {
            // Preparation is optional; routing still commits a normal request on failure.
            if (prepared.current?.id === request.id) prepared.current = null;
          });
        },
        cancel: () => {
          const draft = prepared.current;
          prepared.current = null;
          if (draft) void desktopAPI.discardAnswer(draft.id).catch(() => {});
          void desktopAPI.cancelSpeech().catch(() => {});
        },
      },
    );
    const received = new Set<string>();
    const heartbeat = setInterval(
      () => desktopAPI.diagnostic?.({ event: 'renderer.heartbeat' }),
      5000,
    );
    const reportError = () =>
      desktopAPI.diagnostic?.({ event: 'renderer.error', value: 'uncaught error or rejection' });
    window.addEventListener('error', reportError);
    window.addEventListener('unhandledrejection', reportError);
    const event = (event: AppEvent) => {
      if (event.type === 'answer.delta' && !received.has(event.id)) {
        received.add(event.id);
        if (received.size > 100) received.delete(received.values().next().value!);
        desktopAPI.diagnostic?.({
          event: 'renderer.answer.received',
          id: event.id,
          value: event.id === active.current?.id ? 'active' : 'stale',
        });
      }
      if (event.type.startsWith('answer.')) {
        if (!('id' in event) || event.id !== active.current?.id) return;
        if (event.type === 'answer.delta') deltas.current.push(event.id, event.text);
        if (event.type === 'answer.done') {
          deltas.current.clear();
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
          deltas.current.flush();
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
        if (!pausing.current) pausedAudio.current = false;
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
        if (event.status !== 'ready' || !captureStarting.current) setAudioStatus(event.status);
        if (event.message)
          event.status === 'error' ? setError(event.message) : setNotice(event.message);
        if (event.status === 'stopped' && pausedAudio.current) {
          speechQueue.current?.finish();
        } else if (['stopped', 'error', 'reconnecting'].includes(event.status)) {
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
      deltas.current.clear();
      clearInterval(heartbeat);
      window.removeEventListener('error', reportError);
      window.removeEventListener('unhandledrejection', reportError);
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
    setImages([]);
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
    navigationRequest,
    setSelected: (id: string | null) => {
      setSelected(id);
      setNavigationRequest((value) => value + 1);
    },
    question,
    setQuestion,
    images,
    setImages,
    removeTurnImage: (turnId: string, imageId: string) => {
      setTurns((items) =>
        items.map((turn) =>
          turn.id === turnId
            ? { ...turn, images: turn.images?.filter((image) => image.id !== imageId) }
            : turn,
        ),
      );
    },
    sessionId: sessionId.current,
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
      await pausing.current;
      setError('');
      setNotice('');
      setAudioStatus('connecting');
      captureStarting.current = true;
      try {
        if (await audio.current?.start(source)) setAudioStatus('ready');
      } catch (e) {
        setError(message(e));
        setAudioStatus('stopped');
      } finally {
        captureStarting.current = false;
      }
    },
    stopAudio: () => {
      if (pausing.current) return pausing.current;
      pausedAudio.current = true;
      speechQueue.current?.hold();
      setSpeechStatus('Finishing captured question');
      const task = (audio.current?.pause() ?? Promise.resolve())
        .catch(async (error) => {
          pausedAudio.current = false;
          speechQueue.current?.stop();
          setError(message(error));
          await audio.current?.stop();
        })
        .finally(() => {
          pausing.current = null;
        });
      pausing.current = task;
      return task;
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
