// 둘째 판의 첫 문장과 읽지 않는 입력. 모든 오류는 code, 줄, 자리를 갖고 결과 파일을 쓰지 않는다. 읽는 어댑터와 옛 별칭은 없어서 둘째 판에 없는 문장은 모르는 문장 오류다.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseFigure } from '../src/source/parse.js';
import { runCli, withFolder } from './helpers.js';

const problemsOf = (source) => {
  try {
    parseFigure(source);
    return [];
  } catch (error) {
    if (!error.problems) throw error;
    return error.problems.map(({ code, line, column, message }) => ({ code, line, column, message }));
  }
};

const BODY = 'box a "A"\nbox b "B"\na -> b\n';

test('a source that does not start with daphnis 2 is refused with the location of its first statement', () => {
  const [missing] = problemsOf(`# note\n\n${BODY}`);
  assert.deepEqual([missing.code, missing.line, missing.column], ['missing-version', 3, 1]);
  assert.match(missing.message, /first line must be "daphnis 2"/);
  assert.equal(problemsOf('').at(0).code, 'missing-version');
});

test('daphnis 1 and later versions are refused at the number', () => {
  const [one] = problemsOf(`daphnis 1\n${BODY}`);
  assert.deepEqual([one.code, one.line, one.column], ['unsupported-version', 1, 9]);
  assert.match(one.message, /daphnis 1 sources are not read/);
  const [three] = problemsOf(`daphnis 3\n${BODY}`);
  assert.equal(three.code, 'unsupported-version');
  assert.match(three.message, /reads grammar version 2/);
  assert.equal(problemsOf('daphnis two\n').at(0).code, 'invalid-version');
});

test('another tool name or a kind line in place of the version line is a missing version, not a named case', () => {
  for (const first of ['mutoscope 1', 'mutoscope 2', 'flow right', 'sequence']) {
    const [problem, ...rest] = problemsOf(`${first}\n${BODY}`);
    assert.deepEqual([problem.code, problem.line, problem.column], ['missing-version', 1, 1], first);
    assert.match(problem.message, /first line must be "daphnis 2"/);
    assert.equal(rest.length, 0, first);
  }
});

test('kind lines, step, say and the speed header are unknown statements at their own position', () => {
  const cases = [
    ['flow', 'daphnis 2\nflow right\nbox a "A"\n', [2, 1]],
    ['sequence', 'daphnis 2\nsequence\nbox a "A"\n', [2, 1]],
    ['step', `daphnis 2\n${BODY}step "s"\n`, [5, 1]],
    ['say', `daphnis 2\n${BODY}scene "s"\n  a -> b\n  say "x"\n`, [7, 3]],
    ['speed', `daphnis 2\nspeed 1s\n${BODY}`, [2, 1]],
  ];
  for (const [word, source, position] of cases) {
    const found = problemsOf(source);
    assert.equal(found.length, 1, word);
    assert.deepEqual([found[0].code, found[0].line, found[0].column], ['syntax', ...position], word);
    assert.equal(found[0].message, `unknown statement "${word}"`);
  }
  assert.match(problemsOf('daphnis 2\nx "t"\nbox a "A"\n').at(0).message, /"x" belongs inside a chart block/);
  assert.match(problemsOf('daphnis 2\nchart bar\n').at(0).message, /write chart as: chart id/);
});

test('a scene with a second text is the ordinary scene arity error at the surplus text', () => {
  const scene = 'write a scene as: scene "name"';
  for (const [source, column] of [['scene "s" "caption"', 11], ['scene "s" "a" "b"', 11], ['scene "s" speed=2 "caption"', 19]]) {
    const found = problemsOf(`daphnis 2\n${BODY}${source}\n  a -> b\n`);
    assert.equal(found.length, 1, source);
    assert.deepEqual([found[0].code, found[0].line, found[0].column], ['syntax', 5, column], source);
    assert.ok(found[0].message.startsWith(scene), source);
  }
  const [bare] = problemsOf(`daphnis 2\n${BODY}scene\n`);
  assert.deepEqual([bare.code, bare.line, bare.column], ['syntax', 5, 1]);
  assert.ok(bare.message.startsWith(scene));
});

test('tone and paint names are the palette families and the neutral gray, and the old aliases are removed', () => {
  const names = 'blue, yellow, red, green, orange, purple, cyan, gray';
  for (const alias of ['brand', 'amber', 'teal', 'navy', 'pink', 'sky']) {
    assert.match(problemsOf(`daphnis 2\n${BODY}scene "s"\n  a -> b tone=${alias}\n`).at(0).message, new RegExp(`tone is one of ${names}`));
    for (const key of ['fill', 'stroke']) assert.match(problemsOf(`daphnis 2\nbox a "A"\nbox c "C" ${key}=${alias}\na -> c\n`).at(0).message, new RegExp(`${key} is one of ${names}`));
  }
  for (const name of names.split(', ')) assert.equal(problemsOf(`daphnis 2\n${BODY}scene "s"\n  a -> b tone=${name}\n`).length, 0, name);
});

test('a file that is not .dap is refused by name, and the folder, fence and command names of the old tool are not special', () =>
  withFolder((folder) => {
    writeFileSync(join(folder, 'old.muto'), `daphnis 2\n${BODY}`);
    const file = runCli(['render', join(folder, 'old.muto')], folder);
    assert.equal(file.status, 1);
    assert.match(file.stderr, /old\.muto:1: only \.dap files are read/);
    assert.deepEqual(readdirSync(folder), ['old.muto']);

    const json = runCli(['render', join(folder, 'old.muto'), '--json'], folder);
    assert.equal(json.status, 1);
    const [line, ...others] = json.stdout.trim().split('\n');
    assert.equal(others.length, 0);
    assert.deepEqual(JSON.parse(line), { file: join(folder, 'old.muto'), line: 1, message: 'only .dap files are read', severity: 'error', code: 'unsupported-extension', column: 1 });

    writeFileSync(join(folder, 'new.dap'), `daphnis 2\n${BODY}`);
    const gallery = runCli(['gallery', folder, '--out', join(folder, 'out')], folder);
    assert.equal(gallery.status, 0);
    assert.deepEqual(readdirSync(join(folder, 'out')).filter((name) => name.endsWith('.svg')), ['new.svg']);

    const flag = runCli(['render', join(folder, 'new.dap'), '--no-deprecated'], folder);
    assert.equal(flag.status, 2);
    assert.match(flag.stderr, /unknown option --no-deprecated/);
    assert.equal(runCli(['migrate', join(folder, 'new.dap')], folder).status, 2);

    const markdown = join(folder, 'doc.md');
    const text = `# t\n\n\`\`\`muto\ndaphnis 2\n${BODY}\`\`\`\n`;
    writeFileSync(markdown, text);
    const fence = runCli(['md', markdown], folder);
    assert.equal(fence.status, 0);
    assert.equal(fence.stderr, '');
    assert.equal(readFileSync(markdown, 'utf8'), text);
  }));

test('a source with no daphnis line writes no file from the command line', () =>
  withFolder((folder) => {
    writeFileSync(join(folder, 'v1.dap'), `flow right\n${BODY}`);
    const run = runCli(['render', join(folder, 'v1.dap')], folder);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /v1\.dap:1: the first line must be "daphnis 2"/);
    assert.equal(existsSync(join(folder, 'v1.svg')), false);
  }));
