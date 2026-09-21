import { useState } from 'react';
import {
  AudioLines,
  Braces,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Code2,
  Mic,
  Pause,
  Plus,
  Radio,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useSession, INITIAL_CODE } from './hooks/useSession';
import { desktopAPI } from './bridge';
import CodeWorkspace from './components/CodeWorkspace';
import AnswerPanel from './components/AnswerPanel';
import SettingsDialog from './components/SettingsDialog';
export default function App() {
  const work = useSession();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [source, setSource] = useState<'system' | 'microphone'>('system');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [codePinned, setCodePinned] = useState(false);
  const showCode = codePinned || !!work.proposal || work.doc.code !== INITIAL_CODE;
  const listening = ['ready', 'connecting', 'reconnecting'].includes(work.audioStatus);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-symbol">
            <Braces size={23} />
          </span>
          <span>
            ai helper<span className="brand-caption">INTERVIEW WORKSPACE</span>
          </span>
        </div>
        <button className="new-session" onClick={() => void work.reset()}>
          <Plus size={17} /> New session <span>↗</span>
        </button>
        <details className="context-notes">
          <summary>Requirements &amp; context</summary>
          <p>Pin constraints to keep them available throughout this session.</p>
          <textarea
            aria-label="Pinned context"
            placeholder="Single level, two exits, no payments…"
            maxLength={12000}
            value={work.context}
            onChange={(event) => work.setContext(event.target.value)}
          />
        </details>
        <div className="sidebar-divider" />
        <div className="nav-label transcript-label">
          LIVE TRANSCRIPT <span className={listening ? 'green-dot' : 'neutral-dot'} />
        </div>
        <div className="transcript-list">
          {work.transcript.length === 0 && !work.partial ? (
            <div className="transcript-empty">
              <AudioLines size={24} />
              <p>A little context goes a long way.</p>
              <span>Your conversation will appear here when listening starts.</span>
            </div>
          ) : (
            <>
              {work.transcript.map((item, i) => (
                <button
                  key={item.id}
                  className="transcript-item"
                  onClick={() => work.setQuestion(item.text)}
                  title="Use this transcript as your question"
                >
                  <span>PHRASE {String(i + 1).padStart(2, '0')}</span>
                  <p>{item.text}</p>
                </button>
              ))}
              {work.partial && (
                <p className="partial">
                  {work.partial}
                  <span className="stream-cursor" />
                </p>
              )}
            </>
          )}
        </div>
        {work.turns.length > 1 && (
          <details className="recent-turns">
            <summary>
              Earlier questions <span>{work.turns.length}</span>
            </summary>
            {work.turns.map((turn, index) => (
              <button
                className={turn.id === work.selected ? 'selected-turn' : ''}
                key={turn.id}
                onClick={() => work.setSelected(turn.id)}
              >
                {String(index + 1).padStart(2, '0')} · {turn.question}
              </button>
            ))}
          </details>
        )}
        <div className="sidebar-bottom">
          <button className="sidebar-action" onClick={() => setHistoryOpen(!historyOpen)}>
            <BrainCircuit size={17} /> Saved sessions <span>{work.sessions.length}</span>
          </button>
          {historyOpen && (
            <div className="saved-sessions">
              {!work.sessions.length && (
                <p>Enable session history in Settings to keep your work.</p>
              )}
              {work.sessions.map((session) => (
                <div key={session.id}>
                  <button onClick={() => void work.load(session)}>{session.title}</button>
                  <button
                    aria-label={`Delete ${session.title}`}
                    onClick={() =>
                      void work
                        .deleteSession(session.id)
                        .catch(() => work.setError('Could not delete the saved session.'))
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button className="sidebar-action" onClick={() => setSettingsOpen(true)}>
            <Settings size={17} /> Settings
          </button>
          <div className="local-note">
            <ShieldCheck size={13} /> Your workspace. Your API key.
          </div>
        </div>
      </aside>
      <main className="main-workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <span>Interview session</span>
          </div>
          <div className="topbar-right">
            <span className="connection-pill">
              <span className={work.hasKey ? 'green-dot' : 'neutral-dot'} />
              {work.hasKey ? 'API key saved' : 'Not connected'}
            </span>
            <button
              className="avatar"
              aria-label="Open profile settings"
              onClick={() => setSettingsOpen(true)}
            >
              You
            </button>
          </div>
        </header>
        <div className="workspace-heading">
          <div className="workspace-title">
            <span className="mode-icon">
              <BrainCircuit size={24} />
            </span>
            <div>
              <h2>Interview session</h2>
              <p>Design, code and experience — one continuous conversation</p>
            </div>
          </div>
          <span className="session-badge">
            <span className="neutral-dot" /> {work.demo ? 'SAMPLE' : 'SESSION 01'}
          </span>
        </div>
        <div className="session-controls">
          <div className="adaptive-controls">
            <span>
              <Sparkles size={14} /> Follows your conversation
            </span>
            <button
              className="subtle"
              aria-pressed={codePinned}
              onClick={() => setCodePinned(!codePinned)}
            >
              <Code2 size={15} />
              {codePinned ? 'Unpin code' : 'Pin code'}
            </button>
          </div>
          <div className="audio-controls">
            <select
              aria-label="Audio source"
              disabled={listening || work.demo}
              value={source}
              onChange={(e) => setSource(e.target.value as typeof source)}
            >
              <option value="system">System audio</option>
              <option value="microphone">Microphone</option>
            </select>
            <button
              className={listening ? 'listen-button listening' : 'listen-button'}
              disabled={work.demo}
              onClick={() => {
                if (listening) void work.stopAudio();
                else if (!desktopAPI.isDesktop || !work.hasKey) setSettingsOpen(true);
                else void work.startAudio(source);
              }}
            >
              {listening ? <Pause size={14} /> : <Mic size={14} />}{' '}
              {listening ? 'Pause' : 'Start listening'}
            </button>
          </div>
        </div>
        {work.demo && (
          <div className="demo-banner">
            <Sparkles size={14} />
            <strong>Sample session · no API calls</strong>
            <span>Explore the answer and code review flow.</span>
            <button onClick={() => void work.reset()}>
              Exit sample <X size={13} />
            </button>
          </div>
        )}
        {(work.error || work.notice) && (
          <div
            className={`message-bar ${work.error ? 'error' : 'success'}`}
            role={work.error ? 'alert' : 'status'}
          >
            {work.error ? <CircleHelp size={16} /> : <CheckCircle2 size={16} />}
            <span>{work.error || work.notice}</span>
            <button
              aria-label="Dismiss message"
              onClick={() => {
                work.setError('');
                work.setNotice('');
              }}
            >
              <X size={15} />
            </button>
          </div>
        )}
        <div className={`workbench ${showCode ? '' : 'conversation-only'}`}>
          <AnswerPanel work={work} openSettings={() => setSettingsOpen(true)} />
          {showCode && <CodeWorkspace work={work} />}
        </div>
        <footer className="statusbar">
          <span>
            <Radio size={12} />
            {work.audioStatus === 'ready'
              ? 'Listening'
              : work.audioStatus === 'reconnecting'
                ? 'Reconnecting · audio gap'
                : work.audioStatus === 'connecting'
                  ? 'Connecting…'
                  : 'Listening paused'}
            <span className="level-track">
              <i style={{ width: `${work.level * 100}%` }} />
            </span>
          </span>
          <span>
            {source === 'system'
              ? 'System audio includes all computer playback'
              : 'Microphone input'}
            <span className="status-separator">·</span>Practice & permitted assistance
          </span>
        </footer>
      </main>
      {settingsOpen && <SettingsDialog work={work} close={() => setSettingsOpen(false)} />}
    </div>
  );
}
