import { extensionFromMime } from './image-io.js';

export function buildOutputName(inputName, type) {
  const extension = extensionFromMime(type);
  const baseName = inputName.replace(/\.[^.]+$/, '') || 'optimized-image';
  return `${baseName}-optimized.${extension}`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
