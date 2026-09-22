import { z } from 'zod';

export const MAX_IMAGES = 3;
export const imageAttachmentSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(160),
    dataUrl: z
      .string()
      .max(4_000_000)
      .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
export type ImageAttachment = z.infer<typeof imageAttachmentSchema>;
export type CaptureSource = { id: string; name: string; preview: string };
