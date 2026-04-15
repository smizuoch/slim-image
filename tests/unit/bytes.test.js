import { formatBytes, formatRatio, parseTargetBytes } from '../../assets/js/bytes.js';
import { assertEqual, runSuite } from './test-helpers.js';

export function bytesSuite() {
  return runSuite('bytes', () => {
    assertEqual(parseTargetBytes('10', 'MB'), 10 * 1024 * 1024, 'MB conversion should use binary megabytes');
    assertEqual(parseTargetBytes('256', 'KB'), 256 * 1024, 'KB conversion should use binary kilobytes');
    assertEqual(parseTargetBytes('-1', 'MB'), null, 'negative target size should be rejected');
    assertEqual(formatBytes(1536), '1.50 KB', 'formatBytes should format kilobytes');
    assertEqual(formatRatio(1000, 250), '-75.0%', 'formatRatio should show reduction rate');
  });
}
