import {
  appendLog,
  applyWorkerMessage,
  createInitialState,
  setError,
  setResult,
  setSource,
  setTarget,
} from '../../assets/js/state.js';
import { assert, assertEqual, runSuite } from './test-helpers.js';

export function stateSuite() {
  return runSuite('state', () => {
    const initial = createInitialState();
    const withTarget = setTarget(initial, { value: '12.5', unit: 'KB' });
    assertEqual(withTarget.target.value, '12.5', 'target value should update');
    assertEqual(withTarget.target.unit, 'KB', 'target unit should update');

    const withSource = setSource(initial, { name: 'sample.png' });
    assertEqual(withSource.source.name, 'sample.png', 'source should be stored');
    assertEqual(withSource.logs.length, 0, 'setSource should clear logs');

    const withLog = appendLog(initial, { message: 'hello' });
    assertEqual(withLog.logs.length, 1, 'appendLog should add a log entry');

    const withProgress = applyWorkerMessage(initial, {
      type: 'progress',
      payload: { ratio: 0.5, attempts: 12, branch: 'JPEG', paretoCount: 3 },
    });
    assertEqual(withProgress.progress.ratio, 0.5, 'progress ratio should update');
    assertEqual(withProgress.progress.branch, 'JPEG', 'progress branch should update');

    const errored = setError(initial, 'boom');
    assertEqual(errored.error, 'boom', 'error should be stored');

    const resultState = setResult(initial, { outputSize: 1234 }, 'done');
    assertEqual(resultState.result.outputSize, 1234, 'result payload should be stored');
    assert(resultState.status === 'done', 'status message should be updated');
  });
}
