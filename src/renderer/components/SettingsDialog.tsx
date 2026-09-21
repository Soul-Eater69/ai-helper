import { useEffect, useRef, useState } from 'react';
import { KeyRound, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import { desktopAPI } from '../bridge';
import type { Workspace } from '../hooks/useSession';
import { leadershipPrinciples, settingsSchema, type ExperienceStory } from '../../shared/contracts';
export default function SettingsDialog({ work, close }: { work: Workspace; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(structuredClone(work.settings));
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hasKey, setHasKey] = useState(work.hasKey);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const editStory = (index: number, patch: Partial<ExperienceStory>) =>
    setDraft({
      ...draft,
      stories: draft.stories.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  const save = async () => {
    setError('');
    setBusy(true);
    try {
      const validated = settingsSchema.parse(draft);
      if (key.trim()) {
        await desktopAPI.setKey(key.trim());
        setKey('');
      }
      await desktopAPI.saveSettings(validated);
      await work.refreshSettings();
      close();
    } catch {
      setError(
        'Settings could not be saved. Check field lengths, model names and desktop storage availability.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={ref}
      className="settings-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
      aria-labelledby="settings-title"
    >
      <div className="dialog-heading">
        <div>
          <div className="eyebrow">YOUR WORKSPACE</div>
          <h2 id="settings-title">
            <SlidersHorizontal size={21} /> Settings
          </h2>
        </div>
        <button className="icon-button" aria-label="Close settings" disabled={busy} onClick={close}>
          <X size={20} />
        </button>
      </div>
      <div className="dialog-body">
        <section>
          <h3>
            <KeyRound size={16} /> Model connection
          </h3>
          <p>Use your own OpenAI API account. API usage is billed separately from ChatGPT.</p>
          <label htmlFor="api-key">
            OpenAI API key {hasKey && <span className="pill">Stored securely</span>}
          </label>
          <div className="input-action">
            <input
              id="api-key"
              type="password"
              autoComplete="off"
              disabled={!desktopAPI.isDesktop || busy}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={
                hasKey
                  ? 'Leave blank to keep your saved key'
                  : desktopAPI.isDesktop
                    ? 'Paste your API key'
                    : 'Available in the Windows desktop app'
              }
            />
            {hasKey && (
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await desktopAPI.deleteKey();
                    setHasKey(false);
                    await work.refreshSettings();
                  } catch {
                    setError('Could not delete the key.');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Remove key
              </button>
            )}
          </div>
          <div className="field-grid">
            <div>
              <label htmlFor="answer-model">Answer model</label>
              <input
                id="answer-model"
                value={draft.model}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="transcription-model">Transcription model</label>
              <input
                id="transcription-model"
                value={draft.transcriptionModel}
                onChange={(e) => setDraft({ ...draft, transcriptionModel: e.target.value })}
              />
            </div>
          </div>
          <p className="field-help">
            Use model IDs available to your API account. Changes to transcription apply the next
            time you start listening.
          </p>
        </section>
        <section>
          <h3>Sound like yourself</h3>
          <label htmlFor="candidate-name">Your name</label>
          <input
            id="candidate-name"
            value={draft.candidateName}
            maxLength={120}
            placeholder="Spoken as your own name when you introduce yourself"
            onChange={(e) => setDraft({ ...draft, candidateName: e.target.value })}
          />
          <p className="field-help">
            Stays on this device. Leave blank and the answers avoid using a name at all.
          </p>
          <label htmlFor="style">Speaking style</label>
          <textarea
            id="style"
            value={draft.style}
            maxLength={6000}
            rows={3}
            onChange={(e) => setDraft({ ...draft, style: e.target.value })}
          />
          <label htmlFor="profile">Your real experience and story bank</label>
          <textarea
            id="profile"
            value={draft.profile}
            maxLength={20000}
            rows={5}
            onChange={(e) => setDraft({ ...draft, profile: e.target.value })}
            placeholder="Add project facts, your role, decisions, results, and verified metrics. These details stay out of the source repository."
          />
          <p className="field-help">
            These facts are sent to OpenAI with your questions. Behavioral answers ask for missing
            facts instead of inventing a story.
          </p>
        </section>
        <section>
          <h3>Story bank</h3>
          <p>
            Behavioral answers use only what is here. Each question pulls the two closest stories,
            and one already told is passed over when another fits.
          </p>
          {draft.stories.map((item, index) => (
            <div className="story-card" key={item.id}>
              <div className="story-head">
                <input
                  aria-label={`Story ${index + 1} title`}
                  placeholder="Short title, e.g. Payments migration"
                  value={item.title}
                  maxLength={160}
                  onChange={(e) => editStory(index, { title: e.target.value })}
                />
                <button
                  aria-label={`Remove story ${index + 1}`}
                  className="icon-button"
                  onClick={() =>
                    setDraft({ ...draft, stories: draft.stories.filter((_, i) => i !== index) })
                  }
                >
                  <X size={16} />
                </button>
              </div>
              <div className="story-flags">
                <label>
                  <input
                    type="checkbox"
                    checked={item.isFailure}
                    onChange={(e) => editStory(index, { isFailure: e.target.checked })}
                  />
                  <span>A genuine failure</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={item.isConflict}
                    onChange={(e) => editStory(index, { isConflict: e.target.checked })}
                  />
                  <span>A disagreement</span>
                </label>
              </div>
              <select
                aria-label={`Leadership principles for story ${index + 1}`}
                multiple
                size={4}
                value={item.principles}
                onChange={(e) =>
                  editStory(index, {
                    principles: [...e.target.selectedOptions]
                      .map((option) => option.value)
                      .slice(0, 6) as ExperienceStory['principles'],
                  })
                }
              >
                {leadershipPrinciples.map((principle) => (
                  <option key={principle} value={principle}>
                    {principle}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Keywords for story ${index + 1}`}
                placeholder="Words the question might use: latency, on-call, rollback"
                value={item.keywords}
                maxLength={400}
                onChange={(e) => editStory(index, { keywords: e.target.value })}
              />
              {(
                [
                  ['situation', 'Situation - the context and the stakes'],
                  ['task', 'Task - what you personally owned'],
                  ['action', 'Action - the decisions you made, and why'],
                  ['result', 'Result - measured outcomes only'],
                  ['learning', 'Learning - what you would do differently'],
                ] as const
              ).map(([field, label]) => (
                <textarea
                  key={field}
                  aria-label={`${field} for story ${index + 1}`}
                  placeholder={label}
                  rows={field === 'action' ? 4 : 2}
                  value={item[field]}
                  onChange={(e) => editStory(index, { [field]: e.target.value })}
                />
              ))}
            </div>
          ))}
          <button
            className="subtle"
            disabled={draft.stories.length >= 20}
            onClick={() =>
              setDraft({
                ...draft,
                stories: [
                  ...draft.stories,
                  {
                    id: crypto.randomUUID(),
                    title: '',
                    principles: [],
                    keywords: '',
                    situation: '',
                    task: '',
                    action: '',
                    result: '',
                    learning: '',
                    isFailure: false,
                    isConflict: false,
                  },
                ],
              })
            }
          >
            Add a story
          </button>
          <p className="field-help">
            Aim for eight to ten, including two real failures and a disagreement. Keep them
            accurate: a missing fact produces a question, never an invented story.
          </p>
        </section>
        <section>
          <h3>Response guidance</h3>
          <p>Guidance applies automatically when relevant, including mixed questions.</p>
          {(['lld', 'dsa', 'behavioral'] as const).map((mode) => (
            <div key={mode}>
              <label htmlFor={`prompt-${mode}`}>
                {mode === 'lld' ? 'Low-level design' : mode === 'dsa' ? 'DSA' : 'Amazon behavioral'}
              </label>
              <textarea
                id={`prompt-${mode}`}
                rows={3}
                maxLength={8000}
                value={draft.prompts[mode]}
                onChange={(e) =>
                  setDraft({ ...draft, prompts: { ...draft.prompts, [mode]: e.target.value } })
                }
              />
            </div>
          ))}
        </section>
        <section>
          <h3>
            <ShieldCheck size={16} /> Session preferences
          </h3>
          <label className="check-row">
            <input
              type="checkbox"
              checked={draft.autoAnswer}
              onChange={(e) => setDraft({ ...draft, autoAnswer: e.target.checked })}
            />
            <span>
              <strong>Respond to conversation automatically</strong>
              <small>
                Uses the model to recognize questions, clarification replies and follow-ups after a
                pause. Adds an API request per interpreted turn. Turn off for manual sending.
              </small>
            </span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={draft.saveHistory}
              onChange={(e) => setDraft({ ...draft, saveHistory: e.target.checked })}
            />
            <span>
              <strong>Remember sessions on this device</strong>
              <small>
                Stores up to 50 encrypted sessions. Delete saved sessions from the sidebar. Raw
                audio is never saved.
              </small>
            </span>
          </label>
        </section>
      </div>
      <div className="dialog-footer">
        {error && (
          <span role="alert" className="error-text">
            {error}
          </span>
        )}
        <button className="subtle" onClick={close} disabled={busy}>
          Cancel
        </button>
        <button className="primary" onClick={() => void save()} disabled={busy}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </dialog>
  );
}
