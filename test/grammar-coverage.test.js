// 문법 표의 모든 항목(문장 낱말, 선택 사항, 값)이 daphnis 2 원본 어딘가에서 쓰인다(docs/design/figure-syntax.md 문법 표).
// 옛 test/compat.test.js의 "고정 묶음이 문법 표 전체를 쓴다" 시험을 판 2로 옮긴 것이다. 묶음은 시험 원본(test/fixtures), 공개 예제(examples), 설계 문서 예시를 모두 센다.
// 표에 새 항목을 더하고 쓰는 원본이 없으면 이 시험이 실패한다. test/fixtures/grammar/에 그 항목을 쓰는 .dap를 더한다.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { OPTIONS, STATEMENTS, VALUES } from '../src/source/grammar.js';
import { tokenizeLine } from '../src/source/lexer.js';
import { createProblems } from '../src/source/problems.js';
import { docExamples } from './helpers.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
// 블록 안에서 첫 낱말이 문장 낱말이 아니라 이름인 줄(표와 API의 열 줄)을 여는 낱말
const NAMED_ROW_BLOCKS = new Set(['table', 'api']);

// cost: time O(f), heap O(f), stack O(d)
// vars: f = 폴더 안 파일 수, d = 폴더 깊이
// basis: estimate
// 폴더 아래 모든 .dap 경로.
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : path.endsWith('.dap') ? [path] : [];
});

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 원본 글자 수
// basis: estimate
// 묶음의 daphnis 2 원본 목록 [이름, 글].
function corpus() {
  const files = [...walk(join(ROOT, 'test/fixtures')), ...walk(join(ROOT, 'examples'))].map((path) => [path, readFileSync(path, 'utf8')]).filter(([, text]) => /^daphnis 2\b/m.test(text));
  return [...files, ...docExamples().map(({ file, source }, i) => [`${file}#${i}`, source])];
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 묶음 글자 수
// basis: estimate
// 묶음이 쓰는 낱말: 문장 낱말, 선택 사항(`범위.이름`), 값 없는 낱말, 값. 선택 사항은 쓴 줄의 범위로 센다(이름만 세면 `grid.rows`가 `item.rows`까지 쓴 것으로 센다).
function usedWords() {
  const used = { heads: new Set(), options: new Set(), words: new Set(), values: new Set() };
  for (const [, source] of corpus()) {
    let isInScene = false;
    let rowScope;
    source.split('\n').forEach((text, i) => {
      const tokens = tokenizeLine(text, i + 1, createProblems());
      if (!tokens.length) return;
      const [head, second] = tokens;
      if (head.type === 'close') rowScope = undefined;
      const isArrow = head.type === 'word' && second?.type === 'arrow';
      // 장면 밖 화살표는 선(edge)이고 클래스 관계(relation)도 같은 줄 모양이며, 장면 안 화살표는 이동(hop)이다.
      const scopes = rowScope ? [rowScope] : isArrow ? (isInScene ? ['hop'] : ['edge', 'relation']) : STATEMENTS[head.value]?.scopes ?? [head.value];
      if (NAMED_ROW_BLOCKS.has(head.value) && tokens.at(-1).type === 'open') rowScope = 'column';
      // 읽기 식(`대상:=원천`)은 문장 낱말이 아니라 식이라, 어느 줄이든 `:=`가 든 낱말이 있으면 쓴 것으로 센다
      if (tokens.some((t) => t.type === 'option' && (t.value.includes(':=') || t.key.endsWith(':')))) used.heads.add(':=');
      if (isArrow) used.heads.add(isInScene ? 'hop' : 'edge');
      else if (head.type === 'word') used.heads.add(head.value);
      if (head.value === 'scene') isInScene = true;
      for (const t of tokens) {
        const optionName = t.type === 'option' ? t.key : t.type === 'word' ? t.value : undefined;
        for (const scope of scopes) if (optionName !== undefined && `${scope}.${optionName}` in OPTIONS) used.options.add(`${scope}.${optionName}`);
        if (t.type === 'option') used.values.add(t.value);
        else if (t.type === 'word') used.words.add(t.value);
        // 값 목록을 가진 글 선택 사항(`status="카드=종류"`)은 글 안의 `=` 뒤 낱말이 값이다.
        if (t.type === 'option' && t.valueType === 'text' && scopes.some((scope) => OPTIONS[`${scope}.${t.key}`]?.values)) for (const [, kind] of t.value.matchAll(/=\s*([\w-]+)/g)) used.values.add(kind);
      }
    });
  }
  return used;
}

// 근거: 계약 figure-syntax.md 문법 표: 표의 모든 항목이 시험 원본, 예제, 설계 문서 예시 가운데 쓰이는 곳이 있다
test('grammar_every_statement_option_and_value_is_used_by_some_daphnis_2_source', () => {
  const used = usedWords();
  const missing = [];
  for (const word of Object.keys(STATEMENTS)) if (!used.heads.has(word)) missing.push(`statement ${word}`);
  for (const key of Object.keys(OPTIONS)) if (!used.options.has(key)) missing.push(`option ${key}`);
  for (const [list, { items }] of Object.entries(VALUES)) {
    for (const name of Object.keys(items)) if (!used.values.has(name) && !used.words.has(name)) missing.push(`value ${list}.${name}`);
  }

  assert.deepEqual(missing, [], 'add a .dap file to test/fixtures/grammar that uses each missing entry');
});

// 근거: 위 시험이 센 묶음이 비어 있지 않다(경로가 틀려 모든 항목이 비는 일을 막는다)
test('grammar_coverage_corpus_holds_fixtures_examples_and_doc_examples', () => {
  const names = corpus().map(([name]) => name);

  assert.ok(names.some((name) => name.includes('test/fixtures/')), 'fixtures');
  assert.ok(names.some((name) => name.includes('/examples/')), 'examples');
  assert.ok(names.some((name) => name.includes('.md#')), 'doc examples');
  assert.ok(names.length >= 80, `${names.length} sources`);
});
