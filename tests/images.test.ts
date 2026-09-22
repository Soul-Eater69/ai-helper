import { expect, it } from 'vitest';
import { imageAttachmentSchema } from '../src/shared/images';
import { answerRequestSchema } from '../src/shared/contracts';
import { buildHistory, compactSpeechRequest } from '../src/shared/history';
const image = { id: 'image', name: 'Question', dataUrl: 'data:image/png;base64,aGVsbG8=' };
it('accepts bounded image data and rejects remote URLs, SVG and oversize payloads', () => {
  expect(imageAttachmentSchema.safeParse(image).success).toBe(true);
  for (const dataUrl of [
    'https://example.com/a.png',
    'data:image/svg+xml;base64,aGVsbG8=',
    'data:image/png;base64,' + 'a'.repeat(4_000_001),
  ]) {
    expect(imageAttachmentSchema.safeParse({ ...image, dataUrl }).success).toBe(false);
  }
});
it('limits attached images and retains only the latest image question in follow-up context', () => {
  const turns = [1, 2].map((i) => ({
    question: `Question ${i}`,
    answer: 'Recognized question',
    status: 'done',
    images: [{ ...image, id: String(i) }],
  }));
  const history = buildHistory(turns);
  expect(history.filter((item) => item.images?.length)).toEqual([
    expect.objectContaining({ content: 'Question 2', images: [{ ...image, id: '2' }] }),
  ]);
  const request = {
    id: 'r',
    question: 'Explain',
    code: '',
    codeVersion: 0,
    language: 'python',
    history,
  };
  expect(answerRequestSchema.safeParse({ ...request, images: [image] }).success).toBe(true);
  expect(answerRequestSchema.safeParse({ ...request, images: Array(4).fill(image) }).success).toBe(
    false,
  );
  const speech = compactSpeechRequest({
    text: 'Why?',
    context: '',
    recentSpeech: [],
    history,
    currentResponse: '',
  });
  expect(JSON.stringify(speech)).not.toContain('data:image');
});

it('keeps an image on its original turn when later questions repeat the same wording', () => {
  const history = buildHistory([
    { question: 'Explain this', answer: 'Image explanation', status: 'done', images: [image] },
    { question: 'Explain this', answer: 'Text follow-up', status: 'done' },
  ]);
  expect(history[0].images).toEqual([image]);
  expect(history[2].images).toBeUndefined();
});
