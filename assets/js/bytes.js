export const SIZE_UNITS = {
  KB: 1024,
  MB: 1024 * 1024,
};

export function parseTargetBytes(value, unit) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  const multiplier = SIZE_UNITS[unit];
  if (!multiplier) {
    return null;
  }
  return Math.round(amount * multiplier);
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '--';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const decimals = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

export function formatRatio(originalBytes, outputBytes) {
  if (!Number.isFinite(originalBytes) || !Number.isFinite(outputBytes) || originalBytes <= 0) {
    return '--';
  }
  const reduced = (1 - outputBytes / originalBytes) * 100;
  const prefix = reduced >= 0 ? '-' : '+';
  return `${prefix}${Math.abs(reduced).toFixed(1)}%`;
}

export function formatScore(score) {
  if (!Number.isFinite(score)) {
    return '--';
  }
  return score.toFixed(4);
}
