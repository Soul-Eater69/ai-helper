import { z } from 'zod';

export const modeSchema = z.enum(['lld', 'dsa', 'behavioral']);
export type Mode = z.infer<typeof modeSchema>;
export const languages = ['python', 'java', 'typescript', 'cpp'] as const;
export const settingsSchema = z
  .object({
    model: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9_.:-]+$/)
      .default('gpt-5.4'),
    transcriptionModel: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9_.:-]+$/)
      .default('gpt-live-transcribe'),
    language: z.enum(languages).default('python'),
    style: z
      .string()
      .max(6000)
      .default(
        'Use simple, natural spoken English. Be concise and confident. Explain decisions without sounding scripted. Use occasional conversational transitions, not filler in every sentence.',
      ),
    profile: z.string().max(20000).default(''),
    prompts: z
      .object({
        lld: z.string().max(8000).default(''),
        dsa: z.string().max(8000).default(''),
        behavioral: z.string().max(8000).default(''),
      })
      .default({ lld: '', dsa: '', behavioral: '' }),
    autoAnswer: z.boolean().default(true),
    saveHistory: z.boolean().default(false),
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
export const answerRequestSchema = z
  .object({
    id: z.string().min(1).max(100),
    question: z.string().trim().min(1).max(20000),
    context: z.string().max(12000).default(''),
    code: z.string().max(100000),
    codeVersion: z.number().int().nonnegative(),
    language: z.enum(languages),
    history: z
      .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(20000) }))
      .max(60)
      .refine(
        (items) => items.reduce((n, item) => n + item.content.length, 0) <= 80000,
        'History exceeds context budget',
      ),
  })
  .strict();
export type AnswerRequest = z.infer<typeof answerRequestSchema>;
export const savedSessionSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().max(160),
  updatedAt: z.string().datetime(),
  mode: modeSchema.optional(), // Legacy vault compatibility; never used for routing.
  context: z.string().max(12000).default(''),
  code: z.string().max(100000),
  language: z.enum(languages),
  turns: z
    .array(
      z.object({
        id: z.string().max(100),
        question: z.string().max(20000),
        answer: z.string().max(40000),
      }),
    )
    .max(30),
});
export type SavedSession = z.infer<typeof savedSessionSchema>;
export type AppEvent =
  | { type: 'answer.delta'; id: string; text: string }
  | { type: 'answer.done'; id: string; text: string }
  | { type: 'answer.error'; id: string; message: string }
  | { type: 'answer.cancelled'; id: string }
  | { type: 'transcript.partial'; id: string; text: string }
  | { type: 'transcript.final'; id: string; text: string }
  | {
      type: 'audio.status';
      status: 'connecting' | 'ready' | 'reconnecting' | 'stopped' | 'error';
      message?: string;
    };
export interface DesktopAPI {
  readonly isDesktop: boolean;
  getSettings(): Promise<{ settings: Settings; hasKey: boolean }>;
  saveSettings(settings: Settings): Promise<void>;
  setKey(key: string): Promise<void>;
  deleteKey(): Promise<void>;
  answer(request: AnswerRequest): Promise<void>;
  cancel(): Promise<void>;
  startAudio(source: 'system' | 'microphone'): Promise<void>;
  stopAudio(): Promise<void>;
  sendAudio(data: ArrayBuffer): void;
  onEvent(callback: (event: AppEvent) => void): () => void;
  listSessions(): Promise<SavedSession[]>;
  saveSession(session: SavedSession): Promise<void>;
  deleteSession(id: string): Promise<void>;
}
declare global {
  interface Window {
    desktop?: DesktopAPI;
  }
}
