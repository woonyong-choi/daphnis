// 진단 JSON 한 줄의 모양과 둘째 판에 없는 문장·옛 필드가 이름 붙은 경우로 남지 않는 것(docs/design/figure-check.md 명령 절, figure-syntax.md 오류와 경고).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { toJson } from '../src/diagnostics.js';
import { makeDiagnostic } from '../src/source/problems.js';
import { runCli, withFolder } from './helpers.js';

const FIELDS = ['file', 'line', 'message', 'severity', 'code', 'column'];
const BODY = 'box a "A"\nbox b "B"\na -> b\n';

const jsonLines = (stdout) => stdout.trim().split('\n').map((line) => JSON.parse(line));

test('toJson writes the six current fields and nothing derived from them', () => {
  const diagnostic = makeDiagnostic({ severity: 'warning', line: 4, message: '[check 7] a label is hidden (line 9)' }, { column: 3 });
  const json = toJson('a.dap', diagnostic);
  assert.deepEqual(Object.keys(json), FIELDS);
  assert.deepEqual(json, { file: 'a.dap', line: 4, message: 'a label is hidden (line 9)', severity: 'warning', code: 'check-7', column: 3 });
});

test('a syntax error prints the six fields from the command line and nothing on the error stream', () =>
  withFolder((folder) => {
    writeFileSync(join(folder, 'bad.dap'), `daphnis 2\n${BODY}step "s"\n`);
    const bad = runCli(['check', 'bad.dap', '--json'], folder);
    assert.equal(bad.status, 1);
    const [error, ...rest] = jsonLines(bad.stdout);
    assert.equal(rest.length, 0);
    assert.deepEqual(Object.keys(error), FIELDS);
    assert.deepEqual([error.severity, error.code, error.line, error.column, error.message], ['error', 'syntax', 5, 1, 'unknown statement "step"']);
    assert.equal('lines' in error || 'check' in error || 'level' in error || 'fix' in error, false);
    assert.equal(bad.stderr, '');
  }));

test('an unknown statement inside a scene fails with severity error and writes no file', () =>
  withFolder((folder) => {
    writeFileSync(join(folder, 'unknown.dap'), `daphnis 2\n${BODY}scene "s"\n  a -> b\n  say "x"\n`);
    const run = runCli(['render', 'unknown.dap', '--json'], folder);
    assert.equal(run.status, 1);
    const entries = jsonLines(run.stdout);
    assert.deepEqual(entries.map((entry) => [entry.severity, entry.code, entry.line, entry.column]), [['error', 'syntax', 7, 3]]);
    assert.deepEqual(readdirSync(folder), ['unknown.dap']);
  }));

test('the source has no dedicated hint code for words and shapes the second version does not have', () => {
  const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  for (const path of ['source/parse.js', 'source/steps.js', 'source/version.js', 'diagnostics.js', 'build-reported.js']) {
    const text = read(path);
    for (const code of ['removed-statement', 'removed-caption', 'removed-name', 'removed-kind', 'deprecated']) assert.equal(text.includes(code), false, `${path}: ${code}`);
  }
});
