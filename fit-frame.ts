export const FIT_WIDTH = 1920;
export const FIT_HEIGHT = 1080;
export const FIT_BITS = 4_000_000;

export function fitFrame(width: number, height: number) {
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  if (w < 2 || h < 2) return { width: 0, height: 0, bits: FIT_BITS, skip: true };
  const scale = Math.min(1, 1920 / Math.max(w, h), 1080 / Math.min(w, h));
  const outW = Math.max(2, Math.round((w * scale) / 2) * 2);
  const outH = Math.max(2, Math.round((h * scale) / 2) * 2);
  return { width: outW, height: outH, bits: FIT_BITS, skip: scale >= 1 };
}
