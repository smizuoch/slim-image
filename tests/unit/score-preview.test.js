import { formatResultMeta, summarizeAfter, summarizeBefore } from '../../assets/js/score-preview.js';
import { assert, assertEqual, runSuite } from './test-helpers.js';

export function scorePreviewSuite() {
  return runSuite('score-preview', () => {
    const source = {
      width: 1920,
      height: 1080,
      size: 5 * 1024 * 1024,
      hasAlpha: false,
    };
    assert(
      summarizeBefore(source).includes('1920 × 1080'),
      'before summary should include dimensions'
    );

    const result = {
      metTarget: true,
      outputSize: 1024 * 1024,
      outputTypeLabel: 'JPEG',
      metrics: {
        score: 0.9423,
      },
      params: {
        quality: 92,
      },
    };
    const meta = formatResultMeta(source, result);
    assertEqual(meta.format, 'JPEG', 'format label should be propagated');
    assert(meta.params.includes('quality=92'), 'params summary should include quality');
    assert(summarizeAfter(source, result).includes('score 0.9423'), 'after summary should include score');
  });
}
