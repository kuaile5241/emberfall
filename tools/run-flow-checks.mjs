import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, 'artifacts/flow-automation');
await mkdir(output, { recursive: true });
const files = [
  'tests/camp-expedition-flow.test.js', 'tests/expedition-flow-matrix.test.js',
  'tests/normal-run-v3.test.js', 'tests/profile-switch-fix.test.js',
  'tests/reward-input.test.js', 'tests/weapon-switch-animation.test.js',
  'tests/gear-appearance.test.js', 'tests/inventory-v6.test.js',
];
const started = Date.now();
let log = '';
const code = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['--test', '--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=junit', `--test-reporter-destination=${path.join(output, 'logic-junit.xml')}`, ...files], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => { log += chunk; process.stdout.write(chunk); });
  child.stderr.on('data', chunk => { log += chunk; process.stderr.write(chunk); });
  child.on('error', reject); child.on('close', resolve);
});
await writeFile(path.join(output, 'logic.log'), log);
const xml = await readFile(path.join(output, 'logic-junit.xml'), 'utf8');
// Node 22 emits flat <testcase> entries, without aggregate <testsuite> attributes.
const totals = {
  tests: [...xml.matchAll(/<testcase\b/g)].length,
  failures: [...xml.matchAll(/<failure\b/g)].length,
  errors: [...xml.matchAll(/<error\b/g)].length,
  skipped: [...xml.matchAll(/<skipped\b/g)].length,
};
if (!totals.tests) throw new Error('No test cases were recorded; the report cannot be marked passed');
const report = {
  status: code === 0 ? 'passed' : 'failed', exitCode: code, ...totals,
  startedAt: new Date(started).toISOString(), elapsedSeconds: (Date.now() - started) / 1000,
  scope: files,
  browser: { status: 'not_run_by_this_command', url: 'http://127.0.0.1:4173/?qa=1&flow=1&seed=913', englishUrl: 'http://127.0.0.1:4173/?qa=1&flow=1&seed=913&lang=en', note: 'Open against the current build to run the real browser/UI integration and read window.__emberfallFlow.' },
};
await writeFile(path.join(output, 'logic-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`\n流程回归 ${report.status}: ${totals.tests} tests, ${totals.failures} failures. 报告: ${output}`);
process.exitCode = code === 0 ? 0 : (code ?? 1);
