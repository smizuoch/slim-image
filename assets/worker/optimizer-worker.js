import initWasm, * as wasm from '../wasm/optimizer.js';

const FORMAT_KIND = {
  'image/png': 1,
  'image/jpeg': 2,
  'image/webp': 3,
};

let wasmReady;

self.addEventListener('message', (event) => {
  const { id, type, payload } = event.data || {};
  if (type !== 'optimize') {
    return;
  }
  optimize(id, payload).catch((error) => {
    emit(id, 'error', { message: error instanceof Error ? error.message : String(error) });
  });
});

async function optimize(id, payload) {
  await ensureWasm();
  const inputBytes = new Uint8Array(payload.inputBuffer);
  const source = await decodeImageBytes(inputBytes, payload.mimeType);
  const context = {
    id,
    mimeType: payload.mimeType,
    targetBytes: payload.targetBytes,
    source,
    attempts: 0,
    planned: 24,
    paretoCount: 0,
    branch: '準備中',
    summaries: [],
    bestAccepted: null,
    smallestCandidateSize: Number.POSITIVE_INFINITY,
  };

  log(id, `入力画像をデコードしました: ${source.width} × ${source.height} / ${formatBytes(inputBytes.byteLength)}`);
  if (source.hasAlpha) {
    log(id, '透過ありの画像として評価します。背景合成込みの alpha-aware score を使います。');
  }
  if (source.width * source.height >= 40_000_000) {
    log(id, '大きな画像です。候補評価に時間がかかる可能性があります。', 'warn');
  }

  let result;
  if (payload.mimeType === 'image/jpeg') {
    result = await optimizeJpeg(context);
  } else if (payload.mimeType === 'image/webp') {
    result = await optimizeWebp(context);
  } else {
    result = await optimizePng(context);
  }

  if (!result.success) {
    emit(id, 'result', {
      success: false,
      message: result.message,
      params: result.params || {},
      metrics: result.metrics || null,
    });
    return;
  }

  emit(id, 'progress', {
    ratio: 1,
    label: '完了',
    attempts: context.attempts,
    branch: context.branch,
    paretoCount: context.paretoCount,
  });
  const outputBuffer = result.outputBytes.buffer.slice(0);
  emit(id, 'result', {
    success: true,
    metTarget: true,
    message: result.message,
    outputType: payload.mimeType,
    params: result.params,
    metrics: result.metrics,
    outputBuffer,
  }, [outputBuffer]);
}

async function optimizeJpeg(context) {
  context.branch = 'JPEG / 二分探索';
  context.planned = 48;
  const modes = [
    { subsampling: '444', progressive: false },
    { subsampling: '444', progressive: true },
    { subsampling: '420', progressive: false },
    { subsampling: '420', progressive: true },
  ];

  for (const mode of modes) {
    log(
      context.id,
      `JPEG 分岐: subsampling=${mode.subsampling}, progressive=${mode.progressive ? 'on' : 'off'}`
    );
    let low = 6;
    let high = 100;
    let bestQuality = 6;
    let previousBestScore = context.bestAccepted?.score ?? Number.NEGATIVE_INFINITY;
    while (high - low > 4) {
      const quality = Math.max(1, Math.floor((low + high) / 2));
      const encoded = wasm.encode_jpeg_rgba(
        context.source.rgba,
        context.source.width,
        context.source.height,
        quality,
        mode.subsampling,
        mode.progressive,
      );
      const candidate = await evaluateCandidate(context, encoded, {
        quality,
        subsampling: mode.subsampling,
        progressive: mode.progressive,
      });
      if (candidate.size <= context.targetBytes) {
        low = quality;
        bestQuality = quality;
      } else {
        high = quality;
      }
      if (
        context.bestAccepted &&
        wasm.should_early_stop(
          context.targetBytes,
          context.bestAccepted.size,
          previousBestScore,
          context.bestAccepted.score,
        )
      ) {
        log(context.id, 'JPEG 探索を早期終了します。目標に近く、品質改善も頭打ちです。');
        return succeed(context, 'JPEG の制約内で最も高い品質スコアの候補を採用しました。');
      }
      previousBestScore = context.bestAccepted?.score ?? previousBestScore;
    }

    const [windowStart, windowEnd] = wasm.local_quality_window(bestQuality || low, 6);
    for (let quality = windowStart; quality <= windowEnd; quality += 1) {
      const encoded = wasm.encode_jpeg_rgba(
        context.source.rgba,
        context.source.width,
        context.source.height,
        quality,
        mode.subsampling,
        mode.progressive,
      );
      await evaluateCandidate(context, encoded, {
        quality,
        subsampling: mode.subsampling,
        progressive: mode.progressive,
      });
    }
  }

  return succeedOrFail(
    context,
    'JPEG の制約内で最も高い品質スコアの候補を採用しました。',
    `この目標サイズでは JPEG の制約内候補が見つかりませんでした。最小候補でも ${formatBytes(context.smallestCandidateSize)} です。`,
  );
}

async function optimizeWebp(context) {
  context.branch = 'WebP / lossless pass';
  context.planned = context.source.hasAlpha ? 42 : 36;

  for (const effort of [2, 5, 8]) {
    log(context.id, `WebP lossless pass: effort=${effort}`);
    const encoded = wasm.encode_webp_rgba(
      context.source.rgba,
      context.source.width,
      context.source.height,
      100,
      effort,
      true,
    );
    await evaluateCandidate(context, encoded, {
      mode: 'lossless',
      effort,
    });
    if (context.bestAccepted) {
      return succeed(context, 'lossless WebP が目標サイズ以下に収まったため、そのまま採用しました。');
    }
  }

  if (context.source.hasAlpha) {
    context.branch = 'WebP / alpha-safe quantized lossless';
    log(context.id, 'alpha 付き WebP は lossless を維持しつつ、事前量子化した RGBA を探索します。');
    const coarseConfigs = [
      { paletteSize: 256, posterizeBits: 8, ditherAmount: 0, alphaProtection: 1.8, effort: 4 },
      { paletteSize: 192, posterizeBits: 7, ditherAmount: 0.2, alphaProtection: 2.2, effort: 4 },
      { paletteSize: 128, posterizeBits: 6, ditherAmount: 0.35, alphaProtection: 2.4, effort: 5 },
      { paletteSize: 96, posterizeBits: 5, ditherAmount: 0.2, alphaProtection: 2.8, effort: 6 },
      { paletteSize: 64, posterizeBits: 5, ditherAmount: 0.4, alphaProtection: 3, effort: 6 },
    ];
    for (const config of coarseConfigs) {
      const quantizedPng = wasm.encode_png_lossy_candidate(
        context.source.rgba,
        context.source.width,
        context.source.height,
        config.paletteSize,
        config.posterizeBits,
        config.ditherAmount,
        config.alphaProtection,
        config.effort,
      );
      const quantized = await decodeImageBytes(quantizedPng, 'image/png');
      const encoded = wasm.encode_webp_rgba(
        quantized.rgba,
        quantized.width,
        quantized.height,
        100,
        Math.min(config.effort + 1, 9),
        true,
      );
      await evaluateCandidate(context, encoded, {
        mode: 'alpha-safe-lossless',
        palette: config.paletteSize,
        bits: config.posterizeBits,
        dither: config.ditherAmount,
        alphaProtection: config.alphaProtection.toFixed(2),
      });
    }

    return succeedOrFail(
      context,
      'alpha-safe な lossless WebP 候補の中から最も高い品質スコアを採用しました。',
      `この目標サイズでは WebP 透過を保った候補が見つかりませんでした。最小候補でも ${formatBytes(context.smallestCandidateSize)} です。`,
    );
  }

  context.branch = 'WebP / lossy search';
  for (const effort of [2, 5, 8]) {
    log(context.id, `WebP lossy pass: effort=${effort}`);
    let low = 1;
    let high = 100;
    let bestQuality = 1;
    while (high - low > 4) {
      const quality = Math.floor((low + high) / 2);
      const encoded = wasm.encode_webp_rgba(
        context.source.rgba,
        context.source.width,
        context.source.height,
        quality,
        effort,
        false,
      );
      const candidate = await evaluateCandidate(context, encoded, {
        mode: 'lossy',
        quality,
        effort,
      });
      if (candidate.size <= context.targetBytes) {
        low = quality;
        bestQuality = quality;
      } else {
        high = quality;
      }
    }
    const [windowStart, windowEnd] = wasm.local_quality_window(bestQuality || low, 6);
    for (let quality = windowStart; quality <= windowEnd; quality += 1) {
      const encoded = wasm.encode_webp_rgba(
        context.source.rgba,
        context.source.width,
        context.source.height,
        quality,
        effort,
        false,
      );
      await evaluateCandidate(context, encoded, {
        mode: 'lossy',
        quality,
        effort,
      });
    }
  }

  return succeedOrFail(
    context,
    'WebP の制約内で最も高い品質スコアの候補を採用しました。',
    `この目標サイズでは WebP の候補が見つかりませんでした。最小候補でも ${formatBytes(context.smallestCandidateSize)} です。`,
  );
}

async function optimizePng(context) {
  context.branch = 'PNG / lossless pass';
  context.planned = context.source.hasAlpha ? 42 : 34;
  let bestLossless = null;

  for (const effort of [2, 4, 7]) {
    log(context.id, `PNG lossless pass: effort=${effort}`);
    const encoded = wasm.encode_png_lossless_best(
      context.source.rgba,
      context.source.width,
      context.source.height,
      effort,
    );
    const candidate = await evaluateCandidate(context, encoded, {
      stage: 'lossless',
      effort,
    });
    if (candidate.size <= context.targetBytes && (!bestLossless || candidate.size < bestLossless.size)) {
      bestLossless = candidate;
    }
  }

  if (bestLossless) {
    context.bestAccepted = bestLossless;
    return succeed(context, 'lossless PNG が目標サイズ以下に収まったため、そのまま採用しました。');
  }

  context.branch = 'PNG / coarse search';
  const coarseConfigs = buildPngCoarseConfigs(context.source.hasAlpha);
  for (const config of coarseConfigs) {
    const encoded = wasm.encode_png_lossy_candidate(
      context.source.rgba,
      context.source.width,
      context.source.height,
      config.paletteSize,
      config.posterizeBits,
      config.ditherAmount,
      config.alphaProtection,
      config.effort,
    );
    await evaluateCandidate(context, encoded, {
      stage: 'coarse',
      palette: config.paletteSize,
      bits: config.posterizeBits,
      dither: config.ditherAmount,
      alphaProtection: config.alphaProtection.toFixed(2),
      effort: config.effort,
    });
  }

  const pareto = buildParetoFront(context);
  context.branch = 'PNG / local refinement';
  for (const summary of pareto.slice(0, 4)) {
    const palette = Number(summary.params.palette || summary.params.paletteSize || 128);
    const bits = Number(summary.params.bits || 6);
    const dither = Number(summary.params.dither || 0.2);
    const alphaProtection = Number(summary.params.alphaProtection || 2);
    const neighborhood = [
      { paletteSize: clamp(palette * 2, 16, 256), posterizeBits: clamp(bits + 1, 3, 8), ditherAmount: clamp(dither - 0.15, 0, 0.6), alphaProtection, effort: 6 },
      { paletteSize: clamp(palette, 16, 256), posterizeBits: clamp(bits, 3, 8), ditherAmount: clamp(dither, 0, 0.6), alphaProtection: clamp(alphaProtection + 0.25, 1, 3.5), effort: 6 },
      { paletteSize: clamp(Math.floor(palette / 2), 16, 256), posterizeBits: clamp(bits - 1, 3, 8), ditherAmount: clamp(dither + 0.15, 0, 0.6), alphaProtection: clamp(alphaProtection + 0.4, 1, 3.5), effort: 7 },
    ];

    for (const config of neighborhood) {
      const encoded = wasm.encode_png_lossy_candidate(
        context.source.rgba,
        context.source.width,
        context.source.height,
        config.paletteSize,
        config.posterizeBits,
        config.ditherAmount,
        config.alphaProtection,
        config.effort,
      );
      await evaluateCandidate(context, encoded, {
        stage: 'local',
        palette: config.paletteSize,
        bits: config.posterizeBits,
        dither: config.ditherAmount.toFixed(2),
        alphaProtection: config.alphaProtection.toFixed(2),
        effort: config.effort,
      });
    }
  }

  return succeedOrFail(
    context,
    'PNG の制約内で最も高い品質スコアの候補を採用しました。',
    `この目標サイズでは PNG の候補が見つかりませんでした。最小候補でも ${formatBytes(context.smallestCandidateSize)} です。`,
  );
}

async function evaluateCandidate(context, encodedBytes, params) {
  const decoded = await decodeImageBytes(encodedBytes, context.mimeType);
  const metrics = wasm.score_image(
    context.source.rgba,
    decoded.rgba,
    context.source.width,
    context.source.height,
    context.source.hasAlpha,
  );
  const candidate = {
    size: encodedBytes.byteLength,
    params,
    metrics,
    score: metrics.score,
    outputBytes: encodedBytes,
  };

  context.attempts += 1;
  context.smallestCandidateSize = Math.min(context.smallestCandidateSize, candidate.size);
  context.summaries.push({
    size: candidate.size,
    score: candidate.score,
    params,
  });
  if (candidate.size <= context.targetBytes && isBetterCandidate(candidate, context.bestAccepted)) {
    context.bestAccepted = candidate;
  }

  context.paretoCount = buildParetoFront(context).length;
  emit(context.id, 'progress', {
    ratio: Math.min(context.attempts / context.planned, 0.98),
    label: `探索中 (${context.attempts} 候補)`,
    attempts: context.attempts,
    branch: context.branch,
    paretoCount: context.paretoCount,
  });
  log(
    context.id,
    `${context.branch}: ${candidate.size <= context.targetBytes ? 'under' : 'over'} / ${formatBytes(candidate.size)} / score ${candidate.score.toFixed(4)} / ${stringifyParams(params)}`
  );
  return candidate;
}

function buildPngCoarseConfigs(hasAlpha) {
  const paletteSizes = hasAlpha ? [256, 192, 128, 96, 64] : [256, 128, 96, 64];
  const posterizeBits = hasAlpha ? [8, 6, 5] : [8, 6, 5];
  const ditherAmounts = hasAlpha ? [0, 0.2, 0.4] : [0, 0.25];
  const alphaProtection = hasAlpha ? [1.8, 2.4] : [1];
  const configs = [];
  for (const paletteSize of paletteSizes) {
    for (const bits of posterizeBits) {
      for (const ditherAmount of ditherAmounts) {
        for (const alpha of alphaProtection) {
          configs.push({
            paletteSize,
            posterizeBits: bits,
            ditherAmount,
            alphaProtection: alpha,
            effort: paletteSize >= 192 ? 4 : 5,
          });
        }
      }
    }
  }
  return configs;
}

function buildParetoFront(context) {
  if (context.summaries.length === 0) {
    return [];
  }
  const frontIndices = wasm.pareto_front_indices(
    context.summaries.map((candidate) => candidate.size),
    context.summaries.map((candidate) => candidate.score),
  );
  return frontIndices
    .map((index) => context.summaries[index])
    .sort((lhs, rhs) => rhs.score - lhs.score);
}

function succeed(context, message) {
  return {
    success: true,
    outputBytes: context.bestAccepted.outputBytes,
    params: context.bestAccepted.params,
    metrics: context.bestAccepted.metrics,
    message,
  };
}

function succeedOrFail(context, successMessage, failureMessage) {
  if (context.bestAccepted) {
    return succeed(context, successMessage);
  }
  return {
    success: false,
    message: failureMessage,
  };
}

function isBetterCandidate(lhs, rhs) {
  if (!rhs) {
    return true;
  }
  if (lhs.score > rhs.score + 0.000001) {
    return true;
  }
  return Math.abs(lhs.score - rhs.score) <= 0.000001 && lhs.size > rhs.size;
}

async function decodeImageBytes(bytes, mimeType) {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('このブラウザは Worker 内の画像デコードに対応していません。');
  }
  const blob = new Blob([bytes], { type: mimeType });
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  return {
    width: imageData.width,
    height: imageData.height,
    hasAlpha: mimeType !== 'image/jpeg' && hasAlpha(imageData.data),
    rgba: new Uint8ClampedArray(imageData.data),
  };
}

function hasAlpha(rgba) {
  const step = Math.max(4, Math.floor((rgba.length / 4) / 250_000)) * 4;
  for (let index = 3; index < rgba.length; index += step) {
    if (rgba[index] < 255) {
      return true;
    }
  }
  return false;
}

async function ensureWasm() {
  if (!wasmReady) {
    wasmReady = initWasm(new URL('../wasm/optimizer_bg.wasm', import.meta.url));
  }
  return wasmReady;
}

function emit(id, type, payload, transfer = []) {
  self.postMessage({ id, type, payload }, transfer);
}

function log(id, message, level = 'info') {
  emit(id, 'log', { message, level });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '--';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const decimals = value >= 100 || unit === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[unit]}`;
}

function stringifyParams(params) {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
}
