import { imageAttachmentSchema, type ImageAttachment } from '../shared/images';

export async function readQuestionImage(file: File): Promise<ImageAttachment> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error('Use a PNG, JPEG or WebP image.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose an image smaller than 10 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40_000_000)
      throw new Error('This image is too large. Crop it to the question first.');
    const ratio = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not read this image.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return imageAttachmentSchema.parse({
      id: crypto.randomUUID(),
      name: (file.name || 'Pasted image').slice(0, 160),
      dataUrl: canvas.toDataURL('image/jpeg', 0.9),
    });
  } finally {
    bitmap.close();
  }
}
