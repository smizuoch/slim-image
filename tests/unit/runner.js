import { bytesSuite } from './bytes.test.js';
import { scorePreviewSuite } from './score-preview.test.js';
import { stateSuite } from './state.test.js';

const suites = [bytesSuite, stateSuite, scorePreviewSuite];

const results = [];
for (const suite of suites) {
  results.push(await suite());
}

if (typeof document !== 'undefined') {
  const container = document.getElementById('results');
  container.innerHTML = results
    .map((result) => {
      if (result.ok) {
        return `<li data-status="ok">${result.name}: ok</li>`;
      }
      return `<li data-status="fail">${result.name}: fail<br>${escapeHtml(result.error)}</li>`;
    })
    .join('');
}

const failed = results.filter((result) => !result.ok);
if (typeof process !== 'undefined' && failed.length > 0) {
  console.error(failed);
  process.exitCode = 1;
}

if (typeof process !== 'undefined' && failed.length === 0) {
  console.log(results.map((result) => `${result.name}: ok`).join('\n'));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
