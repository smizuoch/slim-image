import { formatBytes, formatRatio, formatScore } from './bytes.js';

export function summarizeBefore(source) {
  if (!source) {
    return '画像を読み込むと元画像の情報を表示します。';
  }
  return `${source.width} × ${source.height} / ${formatBytes(source.size)} / ${source.hasAlpha ? '透過あり' : '透過なし'}`;
}

export function summarizeAfter(source, result) {
  if (!result) {
    return 'まだ最適化は実行されていません。';
  }
  if (!result.metTarget) {
    return result.message || '目標サイズ以下の候補が見つかりませんでした。';
  }
  return `${formatBytes(result.outputSize)} / ${formatRatio(source.size, result.outputSize)} / score ${formatScore(result.metrics.score)}`;
}

export function formatResultMeta(source, result) {
  if (!result) {
    return {
      outputSize: '--',
      ratio: '--',
      format: '--',
      score: '--',
      params: '--',
    };
  }
  return {
    outputSize: formatBytes(result.outputSize),
    ratio: formatRatio(source.size, result.outputSize),
    format: result.outputTypeLabel,
    score: formatScore(result.metrics.score),
    params: stringifyParams(result.params),
  };
}

function stringifyParams(params) {
  if (!params || Object.keys(params).length === 0) {
    return '--';
  }
  return Object.entries(params)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
}
