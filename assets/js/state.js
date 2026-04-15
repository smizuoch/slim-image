const MAX_LOGS = 80;

export function createInitialState() {
  return {
    source: null,
    target: {
      value: '10',
      unit: 'MB',
    },
    isBusy: false,
    progress: {
      ratio: 0,
      label: '待機中',
      attempts: 0,
      branch: '--',
      paretoCount: 0,
    },
    logs: [],
    result: null,
    status: '画像を読み込むと、ここに最適化状況を表示します。',
    error: '',
  };
}

export function setSource(state, source) {
  return {
    ...state,
    source,
    result: null,
    error: '',
    status: '目標サイズを確認して「最適化を開始」を押してください。',
    progress: {
      ratio: 0,
      label: '待機中',
      attempts: 0,
      branch: '--',
      paretoCount: 0,
    },
    logs: [],
  };
}

export function setTarget(state, patch) {
  return {
    ...state,
    target: {
      ...state.target,
      ...patch,
    },
  };
}

export function setBusy(state, isBusy, label) {
  return {
    ...state,
    isBusy,
    status: label || state.status,
    error: '',
  };
}

export function appendLog(state, entry) {
  const log = {
    level: entry.level || 'info',
    message: entry.message,
  };
  return {
    ...state,
    logs: [...state.logs, log].slice(-MAX_LOGS),
  };
}

export function clearLogs(state) {
  return {
    ...state,
    logs: [],
  };
}

export function setError(state, message) {
  return {
    ...state,
    isBusy: false,
    error: message,
    status: message,
  };
}

export function setResult(state, result, status) {
  return {
    ...state,
    isBusy: false,
    result,
    error: '',
    status,
  };
}

export function applyWorkerMessage(state, message) {
  if (message.type === 'progress') {
    return {
      ...state,
      progress: {
        ...state.progress,
        ...message.payload,
      },
    };
  }
  if (message.type === 'log') {
    return appendLog(state, message.payload);
  }
  if (message.type === 'error') {
    return setError(state, message.payload.message);
  }
  return state;
}
