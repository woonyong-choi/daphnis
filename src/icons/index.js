// 아이콘 찾기와 읽기. 기본 세트의 이름은 두 곳에서만 온다: 개념 이름은 의미 아이콘 등록부(symbols.js)가 도형과 역할을 함께 갖고, 기술 브랜드 이름은 brands.json이 Simple Icons 파일을 가리킨다. `icons` 줄로 등록한 사용자 세트는 폴더의 `<이름>.svg`를 읽는다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeIcon } from './sanitize.js';
import { BRAND_ROLES, SYMBOLS } from './symbols.js';

/** 이름 앞에 세트를 적지 않았을 때 찾는 세트. 저장소에 파일이 들어 있다. */
export const DEFAULT_SET = 'builtin';
const BRANDS = JSON.parse(readFileSync(new URL('./brands.json', import.meta.url), 'utf8'));
const BRAND_DIR = new URL('./simple-icons/', import.meta.url);
const clash = Object.keys(SYMBOLS).filter((name) => Object.hasOwn(BRANDS, name));
if (clash.length) throw new Error(`icon names are both a concept and a brand: ${clash.join(', ')}`);
const unroled = Object.keys(BRANDS).filter((name) => !Object.hasOwn(BRAND_ROLES, name));
if (unroled.length) throw new Error(`brand icons without a concept role (icons/symbols.js BRAND_ROLES): ${unroled.join(', ')}`);
/** 기본 세트의 이름 → 역할(`service`, `data`, `access`, `person`) 표. 개념 이름(`server`)과 브랜드 이름(`git`)이 한 표에 있어 서로 겹치지 못한다. 브랜드는 자기 개념의 역할이다(BRAND_ROLES). */
export const ICON_NAMES = Object.freeze(Object.fromEntries([...Object.keys(SYMBOLS), ...Object.keys(BRANDS)].sort().map((name) => [name, SYMBOLS[name]?.role ?? BRAND_ROLES[name]])));
/** 사용자 세트 안의 아이콘 이름 형식. 폴더 밖으로 나가는 경로를 막는다. */
export const USER_ICON_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

// 읽은 파일의 정리 결과. 같은 파일을 그림마다 다시 읽지 않는다.
const cache = new Map();

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** `server`나 `nhn:lb`를 { set, name }으로 가른다. 세트를 적지 않으면 기본 세트다. */
export function splitIconRef(ref) {
  const [set, name] = ref.includes(':') ? ref.split(/:(.*)/s) : [DEFAULT_SET, ref];
  return { set, name };
}

// cost: time O(n), heap O(n), stack O(1), io 1
// vars: n = 파일 글자 수
// basis: estimate
// 파일 하나를 정리해 읽는다. 같은 파일은 한 번만 읽는다.
function readSvg(file) {
  if (!cache.has(file)) cache.set(file, sanitizeIcon(readFileSync(file, 'utf8')));
  return cache.get(file);
}

// cost: time O(n), heap O(n), stack O(1), io 1
// vars: n = 파일 글자 수
// basis: estimate
/**
 * 아이콘 하나를 읽어 { body, role, name, symbol }로 돌려준다. symbol은 의미 아이콘 등록부의 도형이면 true다.
 * @param ref { set, name }
 * @param sets 등록한 사용자 세트 목록 { name, path }[]
 * @param baseDir 사용자 세트 경로의 기준 폴더
 * @throws Error 파일이 없거나 SVG를 정리할 수 없을 때
 */
export function loadIcon(ref, sets, baseDir) {
  if (ref.set !== DEFAULT_SET) return { ...readSvg(resolve(baseDir, sets.find((s) => s.name === ref.set).path, `${ref.name}.svg`)), role: 'custom', name: undefined, symbol: false };
  const symbol = SYMBOLS[ref.name];
  if (symbol) return { body: symbol.body, role: symbol.role, name: ref.name, symbol: true };
  return { ...readSvg(fileURLToPath(new URL(`${BRANDS[ref.name]}.svg`, BRAND_DIR))), role: BRAND_ROLES[ref.name], name: ref.name, symbol: false };
}

// cost: time O(n·f), heap O(n), stack O(1), io n
// vars: n = 도형과 그룹 수, f = 아이콘 파일 글자 수
// basis: estimate
/**
 * 도형과 그룹의 `icon=`을 읽어 iconData({ body, role, name, symbol })로 붙인다. 파일을 못 읽거나 SVG를 정리할 수 없으면 그 줄의 오류다.
 * 그린 아이콘이 없는 도형은 범주색과 글자 배지가 대신한다(docs/design/layout.md 아이콘).
 */
export function attachIcons(figure, baseDir, problems) {
  for (const item of [...figure.nodes, ...figure.groups]) {
    if (item.icon === undefined) continue;
    try {
      item.iconData = loadIcon(splitIconRef(item.icon), figure.iconSets, baseDir);
    } catch (error) {
      problems.error(item.line, `cannot use icon "${item.icon}": ${error.code === 'ENOENT' ? 'the file does not exist' : error.message}`);
    }
  }
}
