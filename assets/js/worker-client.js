export function createWorkerClient() {
  const worker = new Worker(new URL('../worker/optimizer-worker.js', import.meta.url), {
    type: 'module',
  });
  const pending = new Map();
  let nextId = 1;

  worker.addEventListener('message', (event) => {
    const { id, type, payload } = event.data || {};
    const entry = pending.get(id);
    if (!entry) {
      return;
    }
    if (type === 'progress' || type === 'log') {
      entry.onUpdate?.({ type, payload });
      return;
    }
    if (type === 'result') {
      pending.delete(id);
      entry.resolve(payload);
      return;
    }
    if (type === 'error') {
      pending.delete(id);
      entry.reject(new Error(payload.message));
    }
  });

  return {
    optimize(payload, onUpdate) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject, onUpdate });
        worker.postMessage({ id, type: 'optimize', payload }, [payload.inputBuffer]);
      });
    },
    terminate() {
      worker.terminate();
      pending.clear();
    },
  };
}
