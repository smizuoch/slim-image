import { formatBytes } from './bytes.js';
import { summarizeBefore, summarizeAfter, formatResultMeta } from './score-preview.js';

const THEME_STORAGE_KEY = 'slim-image-theme';

export function createUI(actions) {
  const elements = collectElements();
  bindEvents(elements, actions);
  syncThemeToggle(elements.themeToggle);
  return {
    render(state) {
      render(elements, state);
    },
    openFilePicker() {
      elements.fileInput.click();
    },
  };
}

function collectElements() {
  return {
    dropzone: document.getElementById('dropzone'),
    dropzoneContent: document.getElementById('dropzoneContent'),
    fileInput: document.getElementById('fileInput'),
    editorLayout: document.getElementById('editorLayout'),
    beforePreview: document.getElementById('beforePreview'),
    afterPreview: document.getElementById('afterPreview'),
    afterPlaceholder: document.getElementById('afterPlaceholder'),
    beforeCaption: document.getElementById('beforeCaption'),
    afterCaption: document.getElementById('afterCaption'),
    inputFormatChip: document.getElementById('inputFormatChip'),
    outputFormatChip: document.getElementById('outputFormatChip'),
    progressLabel: document.getElementById('progressLabel'),
    progressBarFill: document.getElementById('progressBarFill'),
    attemptCount: document.getElementById('attemptCount'),
    branchLabel: document.getElementById('branchLabel'),
    paretoCount: document.getElementById('paretoCount'),
    logList: document.getElementById('logList'),
    replaceButton: document.getElementById('replaceButton'),
    optimizeButton: document.getElementById('optimizeButton'),
    downloadButton: document.getElementById('downloadButton'),
    targetSizeInput: document.getElementById('targetSizeInput'),
    targetSizeUnit: document.getElementById('targetSizeUnit'),
    statusNote: document.getElementById('statusNote'),
    errorNote: document.getElementById('errorNote'),
    sourceMeta: document.getElementById('sourceMeta'),
    resultMeta: document.getElementById('resultMeta'),
    themeToggle: document.getElementById('themeToggle'),
  };
}

function bindEvents(elements, actions) {
  if (!elements.dropzone || !elements.fileInput) {
    return;
  }

  elements.dropzone.addEventListener('click', () => elements.fileInput.click());
  elements.dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      elements.fileInput.click();
    }
  });
  elements.fileInput.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) {
      actions.onFileSelected(file);
    }
  });

  ['dragenter', 'dragover'].forEach((type) => {
    elements.dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      elements.dropzone.classList.add('dragover');
    });
  });
  ['dragleave', 'dragend', 'drop'].forEach((type) => {
    elements.dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      if (type !== 'drop' || !elements.dropzone.contains(event.relatedTarget)) {
        elements.dropzone.classList.remove('dragover');
      }
    });
  });
  elements.dropzone.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      actions.onFileSelected(file);
    }
  });

  elements.replaceButton?.addEventListener('click', () => elements.fileInput.click());
  elements.optimizeButton?.addEventListener('click', actions.onOptimizeRequested);
  elements.downloadButton?.addEventListener('click', actions.onDownloadRequested);
  elements.targetSizeInput?.addEventListener('input', (event) => {
    actions.onTargetChanged({ value: event.target.value });
  });
  elements.targetSizeUnit?.addEventListener('change', (event) => {
    actions.onTargetChanged({ unit: event.target.value });
  });
  elements.themeToggle?.addEventListener('click', () => toggleTheme(elements.themeToggle));
}

function render(elements, state) {
  const hasSource = Boolean(state.source);
  elements.dropzone?.classList.toggle('hidden', hasSource);
  elements.editorLayout?.classList.toggle('hidden', !hasSource);

  if (elements.targetSizeInput) {
    elements.targetSizeInput.value = state.target.value;
  }
  if (elements.targetSizeUnit) {
    elements.targetSizeUnit.value = state.target.unit;
  }
  if (elements.optimizeButton) {
    elements.optimizeButton.disabled = !hasSource || state.isBusy;
  }
  if (elements.replaceButton) {
    elements.replaceButton.disabled = state.isBusy;
  }
  if (elements.downloadButton) {
    elements.downloadButton.disabled = !state.result?.downloadable;
  }

  if (elements.progressLabel) {
    elements.progressLabel.textContent = state.progress.label;
  }
  if (elements.progressBarFill) {
    elements.progressBarFill.style.width = `${Math.round((state.progress.ratio || 0) * 100)}%`;
  }
  if (elements.attemptCount) {
    elements.attemptCount.textContent = String(state.progress.attempts || 0);
  }
  if (elements.branchLabel) {
    elements.branchLabel.textContent = state.progress.branch || '--';
  }
  if (elements.paretoCount) {
    elements.paretoCount.textContent = String(state.progress.paretoCount || 0);
  }

  if (state.source) {
    if (elements.beforePreview) {
      elements.beforePreview.src = state.source.previewUrl;
      elements.beforePreview.alt = `${state.source.name} の元画像プレビュー`;
    }
    if (elements.beforeCaption) {
      elements.beforeCaption.textContent = summarizeBefore(state.source);
    }
    if (elements.inputFormatChip) {
      elements.inputFormatChip.textContent = state.source.typeLabel;
    }
    fillDefinitionList(elements.sourceMeta, [
      state.source.extension,
      `${state.source.width}px`,
      `${state.source.height}px`,
      formatBytes(state.source.size),
      state.source.hasAlpha ? 'あり' : 'なし',
    ]);
  } else {
    elements.beforePreview?.removeAttribute('src');
    if (elements.beforeCaption) {
      elements.beforeCaption.textContent = summarizeBefore(null);
    }
    if (elements.inputFormatChip) {
      elements.inputFormatChip.textContent = '--';
    }
    fillDefinitionList(elements.sourceMeta, ['--', '--', '--', '--', '--']);
  }

  const resultMeta = formatResultMeta(state.source || { size: 0 }, state.result);
  fillDefinitionList(elements.resultMeta, [
    resultMeta.outputSize,
    resultMeta.ratio,
    resultMeta.format,
    resultMeta.score,
    resultMeta.params,
  ]);

  if (state.result?.previewUrl) {
    if (elements.afterPreview) {
      elements.afterPreview.src = state.result.previewUrl;
      elements.afterPreview.alt = `${state.result.outputTypeLabel} 形式の最適化結果プレビュー`;
    }
    elements.afterPlaceholder?.classList.add('hidden');
    if (elements.outputFormatChip) {
      elements.outputFormatChip.textContent = state.result.outputTypeLabel;
    }
  } else {
    elements.afterPreview?.removeAttribute('src');
    elements.afterPlaceholder?.classList.remove('hidden');
    if (elements.outputFormatChip) {
      elements.outputFormatChip.textContent = '--';
    }
  }
  if (elements.afterCaption) {
    elements.afterCaption.textContent = summarizeAfter(state.source, state.result);
  }

  if (elements.logList) {
    elements.logList.innerHTML = state.logs
      .map((entry) => `<li data-level="${entry.level}">${escapeHtml(entry.message)}</li>`)
      .join('');
  }

  if (elements.statusNote) {
    elements.statusNote.textContent = state.status;
  }
  if (elements.errorNote) {
    if (state.error) {
      elements.errorNote.textContent = state.error;
      elements.errorNote.classList.remove('hidden');
    } else {
      elements.errorNote.textContent = '';
      elements.errorNote.classList.add('hidden');
    }
  }
}

function fillDefinitionList(container, values) {
  if (!container) {
    return;
  }
  const items = container.querySelectorAll('dd');
  values.forEach((value, index) => {
    if (items[index]) {
      items[index].textContent = value;
    }
  });
}

function syncThemeToggle(toggle) {
  if (!toggle) {
    return;
  }
  const themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');

  const applySavedTheme = () => {
    const saved = readStoredTheme() || (themeMedia.matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = saved;
    if (themeColorMeta) {
      themeColorMeta.content = saved === 'dark' ? '#101725' : '#2563ff';
    }
    const nextTheme = saved === 'dark' ? '通常' : 'ダーク';
    const label = `${nextTheme}モードに切り替え`;
    toggle.setAttribute('aria-label', label);
    toggle.setAttribute('title', label);
  };

  if (typeof themeMedia.addEventListener === 'function') {
    themeMedia.addEventListener('change', () => {
      if (!readStoredTheme()) {
        applySavedTheme();
      }
    });
  }

  applySavedTheme();
}

function toggleTheme(toggle) {
  const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Ignore storage errors.
  }
  document.documentElement.dataset.theme = next;
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.content = next === 'dark' ? '#101725' : '#2563ff';
  }
  const nextLabel = next === 'dark' ? '通常' : 'ダーク';
  const label = `${nextLabel}モードに切り替え`;
  toggle.setAttribute('aria-label', label);
  toggle.setAttribute('title', label);
}

function readStoredTheme() {
  try {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    return savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : null;
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
