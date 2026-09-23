import { z } from 'zod';
import {
  imageAttachmentSchema,
  MAX_IMAGES,
  type ImageAttachment,
  type CaptureSource,
} from './images';

export const modeSchema = z.enum(['lld', 'dsa', 'behavioral']);
export type Mode = z.infer<typeof modeSchema>;
export const languages = ['python', 'java', 'typescript', 'cpp'] as const;
/** The sixteen principles, used to tag stories and to steer selection. */
export const leadershipPrinciples = [
  'Customer Obsession',
  'Ownership',
  'Invent and Simplify',
  'Are Right, A Lot',
  'Learn and Be Curious',
  'Hire and Develop the Best',
  'Insist on the Highest Standards',
  'Think Big',
  'Bias for Action',
  'Frugality',
  'Earn Trust',
  'Dive Deep',
  'Have Backbone; Disagree and Commit',
  'Deliver Results',
  "Strive to Be Earth's Best Employer",
  'Success and Scale Bring Broad Responsibility',
] as const;
export type LeadershipPrinciple = (typeof leadershipPrinciples)[number];

/**
 * One real experience, stored in STAR parts rather than as prose.
 *
 * Structure is what makes selection possible: a free-text profile has to be sent whole
 * on every turn, which dilutes the answer and costs tokens on questions that are not
 * behavioural at all.
 */
export const storySchema = z
  .object({
    id: z.string().min(1).max(100),
    title: z.string().trim().max(160),
    principles: z.array(z.enum(leadershipPrinciples)).max(6).default([]),
    /** Extra terms to match on, for vocabulary the STAR text does not contain. */
    keywords: z.string().max(400).default(''),
    situation: z.string().max(4000).default(''),
    task: z.string().max(2000).default(''),
    action: z.string().max(6000).default(''),
    result: z.string().max(3000).default(''),
    learning: z.string().max(2000).default(''),
    /** A genuine failure, so it can be offered when one is asked for. */
    isFailure: z.boolean().default(false),
    /** A disagreement handled professionally. */
    isConflict: z.boolean().default(false),
  })
  .strict();
export type ExperienceStory = z.infer<typeof storySchema>;

export const settingsSchema = z
  .object({
    model: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9_.:-]+$/)
      .default('gpt-5.6-sol'),
    answerReasoning: z.enum(['auto', 'none', 'medium']).default('auto'),
    /**
     * Model for the answer/wait/ignore routing call. It runs on every speech pause and
     * returns one enum value, so it does not need the answer model. Blank falls back to
     * the answer model, which is also what happens if this one is rejected.
     */
    routerModel: z
      .string()
      .trim()
      .max(100)
      .regex(/^[a-zA-Z0-9_.:-]*$/)
      .default('gpt-4o-mini'),
    transcriptionModel: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9_.:-]+$/)
      .default('gpt-4o-mini-transcribe'),
    language: z.enum(languages).default('python'),
    /** Spoken as the candidate's own name; blank falls back to a neutral phrase. */
    candidateName: z.string().trim().max(120).default(''),
    style: z
      .string()
      .max(6000)
      .default(
        'Use simple, natural spoken English. Be concise and confident. Explain decisions without sounding scripted. Use occasional conversational transitions, not filler in every sentence.',
      ),
    profile: z.string().max(20000).default(''),
    stories: z.array(storySchema).max(20).default([]),
    prompts: z
      .object({
        lld: z.string().max(8000).default(''),
        dsa: z.string().max(8000).default(''),
        behavioral: z.string().max(8000).default(''),
      })
      .default({ lld: '', dsa: '', behavioral: '' }),
    autoAnswer: z.boolean().default(true),
    earlyPreparation: z.boolean().default(true),
    saveHistory: z.boolean().default(false),
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
export const answerRequestSchema = z
  .object({
    id: z.string().min(1).max(100),
    question: z.string().trim().min(1).max(20000),
    images: z.array(imageAttachmentSchema).max(MAX_IMAGES).optional(),
    context: z.string().max(12000).default(''),
    speechContext: z.array(z.string().max(1600)).max(12).optional(),
    code: z.string().max(100000),
    codeVersion: z.number().int().nonnegative(),
    codeSource: z.enum(['working', 'proposal']).optional(),
    language: z.enum(languages),
    history: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string().max(20000),
          images: z.array(imageAttachmentSchema).max(MAX_IMAGES).optional(),
        }),
      )
      .max(60)
      .refine(
        (items) => items.reduce((n, item) => n + (item.images?.length ?? 0), 0) <= MAX_IMAGES,
        'Too many history images',
      )
      .refine(
        (items) => items.reduce((n, item) => n + item.content.length, 0) <= 80000,
        'History exceeds context budget',
      ),
  })
  .strict();
export type AnswerRequest = z.infer<typeof answerRequestSchema>;
export const speechRequestSchema = answerRequestSchema
  .pick({ context: true })
  .extend({
    text: z.string().trim().min(1).max(20000),
    recentSpeech: z.array(z.string().max(600)).max(6),
    history: z
      .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(1200) }))
      .max(2),
    currentResponse: z.string().max(1200),
    finalize: z.boolean().optional(),
    answerId: z.string().min(1).max(100).optional(),
  })
  .strict();
export type SpeechRequest = z.infer<typeof speechRequestSchema>;
export const speechDecisionSchema = z
  .object({ action: z.enum(['answer', 'wait', 'ignore']) })
  .strict();
export type SpeechDecision = z.infer<typeof speechDecisionSchema>;
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
  | { type: 'speech.started'; id: string }
  | { type: 'speech.skipped'; id: string }
  | { type: 'transcript.partial'; id: string; text: string }
  | { type: 'transcript.final'; id: string; text: string }
  | {
      type: 'audio.status';
      status: 'connecting' | 'ready' | 'reconnecting' | 'stopped' | 'error';
      message?: string;
    };
export const diagnosticSignalSchema = z
  .object({
    event: z.enum([
      'renderer.heartbeat',
      'renderer.answer.received',
      'renderer.answer.painted',
      'renderer.error',
      'capture.ready',
      'capture.ended',
      'capture.error',
      'capture.pausing',
      'capture.context',
    ]),
    id: z.string().max(100).optional(),
    value: z.string().max(120).optional(),
  })
  .strict();
export type DiagnosticSignal = z.infer<typeof diagnosticSignalSchema>;
export interface DesktopAPI {
  readonly isDesktop: boolean;
  diagnostic?(signal: DiagnosticSignal): void;
  exportDiagnostics?(): Promise<boolean>;
  getSettings(): Promise<{ settings: Settings; hasKey: boolean }>;
  saveSettings(settings: Settings): Promise<void>;
  setKey(key: string): Promise<void>;
  deleteKey(): Promise<void>;
  answer(request: AnswerRequest): Promise<void>;
  prepareAnswer(request: AnswerRequest): Promise<void>;
  discardAnswer(id: string): Promise<void>;
  listCaptureSources(): Promise<CaptureSource[]>;
  captureImage(sourceId: string): Promise<ImageAttachment>;
  cancel(): Promise<void>;
  routeSpeech(request: SpeechRequest): Promise<SpeechDecision>;
  cancelSpeech(): Promise<void>;
  startAudio(source: 'system' | 'microphone'): Promise<void>;
  stopAudio(finish?: boolean): Promise<void>;
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
