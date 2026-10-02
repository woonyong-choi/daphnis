// 테스트가 같이 쓰는 도구. 문서 예시 원본 뽑기와 오류 메시지 모으기.
import { readdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parseFigure } from '../src/source/parse.js';

const DOCS = new URL('../docs/design/', import.meta.url);

// cost: time O(d), heap O(d), stack O(1), io f
// vars: d = 문서 글자 수, f = 문서 수
// basis: estimate
/** 설계 문서의 예시 원본 모두. { file, source } 목록이다. */
export function docExamples() {
  return readdirSync(DOCS)
    .filter((f) => f.endsWith('.md'))
    .flatMap((file) => [...readFileSync(new URL(file, DOCS), 'utf8').matchAll(/```text\n([\s\S]*?)```/g)].map((m) => ({ file, source: m[1] })))
    .filter(({ source }) => /^(flow|sequence|state|data|chart)\b/.test(source));
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 원본 글자 수
// basis: estimate
/** 원본을 읽고 오류 메시지 목록을 돌려준다. 오류가 없으면 빈 목록이다. */
export function errorsOf(source) {
  try {
    parseFigure(source);
    return [];
  } catch (error) {
    if (!error.problems) throw error;
    return error.problems.map((p) => `${p.line}: ${p.message}`);
  }
}

// cost: time O(t), heap O(t), stack O(d)
// vars: t = 토큰 수, d = 묶음 깊이
// basis: estimate
// 정본 파일의 토큰을 점 이름 경로 → 값 표로 편다.
function flatten(node, path, out) {
  if (node && typeof node === 'object' && '$value' in node) out.set(path.join('.'), node.$value);
  else if (node && typeof node === 'object') for (const [key, child] of Object.entries(node)) if (!key.startsWith('$')) flatten(child, [...path, key], out);
  return out;
}

const readTokens = (name) => JSON.parse(readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8'));
const LIGHT = flatten(readTokens('tokens.json'), [], new Map());
const DARK = new Map([...LIGHT, ...flatten(readTokens('tokens.dark.json'), [], new Map())]);

/** 라이트 정본의 토큰 값. 참조는 풀지 않는다. */
export const tokenValue = (name) => LIGHT.get(name);

// cost: time O(c), heap O(1), stack O(1)
// vars: c = 참조 사슬 길이
// basis: estimate
/** 의미 색 토큰 이름의 라이트 또는 다크 `#rrggbb`. 참조 `{...}`를 끝까지 따라간다. */
export function themeColor(theme, name) {
  const table = theme === 'dark' ? DARK : LIGHT;
  let value = table.get(`color.${name}`);
  while (typeof value === 'string' && value.startsWith('{')) value = table.get(value.slice(1, -1));
  assert.match(value ?? '', /^#[0-9a-f]{6}$/, `color.${name} (${theme})`);
  return value;
}
