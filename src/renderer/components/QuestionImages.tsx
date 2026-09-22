import { useEffect, useRef, useState } from 'react';
import { desktopAPI } from '../bridge';
import { imageAttachmentSchema, MAX_IMAGES, type CaptureSource } from '../../shared/images';
import type { Workspace } from '../hooks/useSession';

export default function QuestionImages({
  work,
  addFiles,
  processing,
}: {
  work: Workspace;
  addFiles: (files: File[]) => Promise<void>;
  processing: boolean;
}) {
  const preview = useRef<HTMLDialogElement>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  useEffect(() => {
    if (previewId) preview.current?.showModal();
  }, [previewId]);
  const previewImage = work.images.find((image) => image.id === previewId);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [sources, setSources] = useState<CaptureSource[] | null>(null);
  const [capturing, setCapturing] = useState(false);
  const epoch = useRef(0);
  useEffect(
    () => () => {
      epoch.current++;
    },
    [],
  );
  const close = () => {
    epoch.current++;
    setSources(null);
    setCapturing(false);
  };
  useEffect(() => {
    if (sources) dialog.current?.showModal();
  }, [sources]);
  async function choose() {
    const ticket = ++epoch.current;
    setCapturing(true);
    try {
      const choices = await desktopAPI.listCaptureSources();
      if (ticket !== epoch.current) return;
      if (!choices.length)
        throw new Error(
          'No screen or window was available. Check screen-recording permission or paste a screenshot.',
        );
      setSources(choices);
    } catch (error) {
      if (ticket === epoch.current)
        work.setError(error instanceof Error ? error.message : 'Could not list screens.');
    } finally {
      if (ticket === epoch.current) setCapturing(false);
    }
  }
  async function capture(id: string) {
    const ticket = ++epoch.current;
    setCapturing(true);
    try {
      const image = imageAttachmentSchema.parse(await desktopAPI.captureImage(id));
      if (ticket !== epoch.current) return;
      work.setImages((items) => (items.length < MAX_IMAGES ? [...items, image] : items));
      close();
    } catch (error) {
      if (ticket === epoch.current) {
        close();
        work.setError(error instanceof Error ? error.message : 'Could not capture screen.');
      }
    } finally {
      if (ticket === epoch.current) setCapturing(false);
    }
  }
  return (
    <>
      <div className="question-image-actions">
        <button
          type="button"
          className="subtle"
          disabled={processing || capturing || work.images.length >= MAX_IMAGES}
          onClick={() => void choose()}
        >
          Capture question
        </button>
        <button
          type="button"
          className="subtle"
          disabled={processing || work.images.length >= MAX_IMAGES}
          onClick={() => input.current?.click()}
        >
          Add image
        </button>
        <span className="field-help">Or paste an image · up to 3</span>
        <input
          ref={input}
          type="file"
          hidden
          multiple
          accept="image/png,image/jpeg,image/webp"
          aria-label="Upload question images"
          onChange={(event) => {
            void addFiles(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
      </div>
      {work.images.length > 0 && (
        <div className="question-images" aria-label="Attached question images">
          {work.images.map((image) => (
            <figure key={image.id}>
              <button
                type="button"
                className="image-preview-button"
                aria-label={`Preview image ${image.name}`}
                onClick={() => setPreviewId(image.id)}
              >
                <img src={image.dataUrl} alt={image.name} />
              </button>
              <figcaption>{image.name}</figcaption>
              <button
                type="button"
                className="subtle"
                aria-label={`Remove image ${image.name}`}
                onClick={() =>
                  work.setImages((items) => items.filter((item) => item.id !== image.id))
                }
              >
                Remove
              </button>
            </figure>
          ))}
          <p className="field-help">
            Images are sent with your next question and kept in this session only.
          </p>
        </div>
      )}
      {previewImage && (
        <dialog
          ref={preview}
          className="capture-picker image-preview-dialog"
          onCancel={() => setPreviewId(null)}
        >
          <h2>{previewImage.name}</h2>
          <img src={previewImage.dataUrl} alt="Question image preview" />
          <button type="button" className="subtle" onClick={() => setPreviewId(null)}>
            Close preview
          </button>
        </dialog>
      )}
      {sources && (
        <dialog ref={dialog} className="capture-picker" onCancel={close}>
          <h2>Choose a screen or window</h2>
          <p>Capture the question, then check the image before sending.</p>
          <div className="capture-source-grid">
            {sources.map((source) => (
              <button
                key={source.id}
                type="button"
                disabled={capturing}
                onClick={() => void capture(source.id)}
              >
                <img src={source.preview} alt="" />
                <span>{source.name}</span>
              </button>
            ))}
          </div>
          <button type="button" className="subtle" onClick={close}>
            Cancel capture
          </button>
        </dialog>
      )}
    </>
  );
}
