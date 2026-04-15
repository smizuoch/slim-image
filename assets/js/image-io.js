const SUPPORTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_FILE_BYTES = 500 * 1024 * 1024;

export function normalizeMimeType(file) {
  if (file.type === 'image/jpg') {
    return 'image/jpeg';
  }
  if (SUPPORTED_TYPES.has(file.type)) {
    return file.type;
  }
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (lower.endsWith('.png')) {
    return 'image/png';
  }
  if (lower.endsWith('.webp')) {
    return 'image/webp';
  }
  return file.type;
}

export function validateFile(file) {
  const type = normalizeMimeType(file);
  if (!SUPPORTED_TYPES.has(type)) {
    return { ok: false, message: 'PNG / JPEG / WebP のみ対応しています。' };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, message: '500 MB を超えるファイルは読み込めません。' };
  }
  return { ok: true, type };
}

export async function loadImagePreviewData(file) {
  const previewUrl = URL.createObjectURL(file);
  const bitmap = await createImageBitmap(file);
  const hasAlpha = await detectAlpha(bitmap);
  const result = {
    width: bitmap.width,
    height: bitmap.height,
    hasAlpha,
    previewUrl,
  };
  bitmap.close();
  return result;
}

export async function readFileBytes(file) {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

export function revokeObjectUrl(url) {
  if (url) {
    URL.revokeObjectURL(url);
  }
}

export function extensionFromMime(type) {
  if (type === 'image/jpeg') {
    return 'jpg';
  }
  if (type === 'image/webp') {
    return 'webp';
  }
  return 'png';
}

export function detectHugeImage(width, height) {
  const pixels = width * height;
  return pixels >= 40_000_000;
}

async function detectAlpha(bitmap) {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const step = Math.max(4, Math.floor((imageData.length / 4) / 250_000)) * 4;
  for (let index = 3; index < imageData.length; index += step) {
    if (imageData[index] < 255) {
      return true;
    }
  }
  return false;
}
