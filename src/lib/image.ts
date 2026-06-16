'use client';

// Client-side image helpers. Heavy perspective correction (OpenCV) is out of
// scope; instead we downscale + lightly enhance so the multimodal model gets a
// clean, right-sized image. A perspective-correction step can be slotted in
// here later (e.g. jscanify / opencv.js) without changing the scan flow.

const MAX_EDGE = 1600;

export async function prepareCardImage(
  file: Blob,
  opts: { enhance?: boolean } = {}
): Promise<{ dataUrl: string; mimeType: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported on this device');

  if (opts.enhance) {
    // Mild contrast + brightness lift improves OCR on dull photos.
    ctx.filter = 'contrast(1.12) brightness(1.06) saturate(1.02)';
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { dataUrl, mimeType: 'image/jpeg' };
}
