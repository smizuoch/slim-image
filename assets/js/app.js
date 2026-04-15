import { formatBytes, parseTargetBytes } from './bytes.js';
import { buildOutputName, downloadBlob } from './download.js';
import {
  detectHugeImage,
  extensionFromMime,
  loadImagePreviewData,
  normalizeMimeType,
  readFileBytes,
  revokeObjectUrl,
  validateFile,
} from './image-io.js';
import {
  appendLog,
  applyWorkerMessage,
  clearLogs,
  createInitialState,
  setBusy,
  setError,
  setResult,
  setSource,
  setTarget,
} from './state.js';
import { createUI } from './ui.js';
import { createWorkerClient } from './worker-client.js';

let state = createInitialState();
const workerClient = createWorkerClient();
const ui = createUI({
  onFileSelected: handleFileSelected,
  onTargetChanged: handleTargetChanged,
  onOptimizeRequested: handleOptimizeRequested,
  onDownloadRequested: handleDownloadRequested,
});

render();

async function handleFileSelected(file) {
  clearUrls();
  const validation = validateFile(file);
  if (!validation.ok) {
    updateState(setError(state, validation.message));
    return;
  }

  try {
    const previewData = await loadImagePreviewData(file);
    const type = validation.type;
    const source = {
      file,
      name: file.name,
      size: file.size,
      type,
      typeLabel: typeToLabel(type),
      extension: extensionFromMime(type).toUpperCase(),
      previewUrl: previewData.previewUrl,
      width: previewData.width,
      height: previewData.height,
      hasAlpha: type === 'image/jpeg' ? false : previewData.hasAlpha,
    };
    let nextState = setSource(state, source);
    if (detectHugeImage(source.width, source.height)) {
      nextState = appendLog(nextState, {
        level: 'warn',
        message: `大きな画像です (${source.width} × ${source.height})。メモリ使用量が増えるため、ブラウザによっては時間がかかります。`,
      });
    }
    updateState(nextState);
  } catch (error) {
    updateState(setError(state, `画像の読み込みに失敗しました: ${error.message}`));
  }
}

function handleTargetChanged(patch) {
  updateState(setTarget(state, patch));
}

async function handleOptimizeRequested() {
  if (!state.source) {
    updateState(setError(state, '先に画像を読み込んでください。'));
    return;
  }
  const targetBytes = parseTargetBytes(state.target.value, state.target.unit);
  if (!targetBytes) {
    updateState(setError(state, '目標サイズは 0 より大きい値にしてください。'));
    return;
  }

  if (targetBytes >= state.source.size) {
    const result = makePassthroughResult(state.source);
    updateState(setResult(clearLogs(state), result, 'すでに条件を満たしているため、元画像をそのまま保持します。'));
    return;
  }

  if (state.result?.previewUrl && state.result.previewUrl !== state.source.previewUrl) {
    revokeObjectUrl(state.result.previewUrl);
  }

  let nextState = clearLogs(state);
  nextState = setBusy(nextState, true, '最適化探索を開始しました。');
  nextState = {
    ...nextState,
    result: null,
  };
  nextState = appendLog(nextState, {
    level: 'info',
    message: `探索開始: ${state.source.typeLabel} / 目標 ${formatBytes(targetBytes)} / 元サイズ ${formatBytes(state.source.size)}`,
  });
  updateState(nextState);

  try {
    const inputBytes = await readFileBytes(state.source.file);
    const payload = {
      inputBuffer: inputBytes.buffer,
      fileName: state.source.name,
      mimeType: state.source.type,
      targetBytes,
      sourceSize: state.source.size,
    };
    const resultPayload = await workerClient.optimize(payload, (message) => {
      updateState(applyWorkerMessage(state, message));
    });
    const result = buildWorkerResult(resultPayload, state.source);
    updateState(setResult(state, result, result.message));
  } catch (error) {
    updateState(setError(state, error.message));
  }
}

function handleDownloadRequested() {
  if (!state.result?.downloadable) {
    return;
  }
  downloadBlob(state.result.blob, buildOutputName(state.source.name, state.result.outputType));
}

function updateState(nextState) {
  state = nextState;
  render();
}

function render() {
  ui.render(state);
}

function clearUrls() {
  if (state.source?.previewUrl) {
    revokeObjectUrl(state.source.previewUrl);
  }
  if (state.result?.previewUrl && state.result.previewUrl !== state.source?.previewUrl) {
    revokeObjectUrl(state.result.previewUrl);
  }
}

function makePassthroughResult(source) {
  return {
    outputType: source.type,
    outputTypeLabel: source.typeLabel,
    outputSize: source.size,
    previewUrl: source.previewUrl,
    blob: source.file,
    params: { mode: 'passthrough' },
    metrics: {
      score: 1,
      mse: 0,
      psnr: 99,
      ssim: 1,
      alpha_delta: 0,
    },
    metTarget: true,
    downloadable: true,
    message: 'すでに条件を満たしているため、元画像をそのままダウンロードできます。',
  };
}

function buildWorkerResult(payload, source) {
  if (!payload.success) {
    return {
      outputType: source.type,
      outputTypeLabel: source.typeLabel,
      outputSize: 0,
      previewUrl: '',
      blob: null,
      params: payload.params || {},
      metrics: payload.metrics || {
        score: Number.NaN,
        mse: Number.NaN,
        psnr: Number.NaN,
        ssim: Number.NaN,
        alpha_delta: Number.NaN,
      },
      metTarget: false,
      downloadable: false,
      message: payload.message || '目標サイズ以下の候補が見つかりませんでした。',
    };
  }

  if (state.result?.previewUrl && state.result.previewUrl !== state.source?.previewUrl) {
    revokeObjectUrl(state.result.previewUrl);
  }

  const outputBytes = new Uint8Array(payload.outputBuffer);
  const blob = new Blob([outputBytes], { type: payload.outputType });
  const previewUrl = URL.createObjectURL(blob);

  return {
    outputType: payload.outputType,
    outputTypeLabel: typeToLabel(payload.outputType),
    outputSize: outputBytes.byteLength,
    previewUrl,
    blob,
    params: payload.params,
    metrics: payload.metrics,
    metTarget: payload.metTarget,
    downloadable: true,
    message: payload.message,
  };
}

function typeToLabel(type) {
  if (type === 'image/jpeg') {
    return 'JPEG';
  }
  if (type === 'image/webp') {
    return 'WebP';
  }
  return 'PNG';
}

window.addEventListener('beforeunload', () => {
  clearUrls();
  workerClient.terminate();
});
