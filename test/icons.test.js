// 아이콘: 기본 세트 표와 파일, 사용자 세트 읽기와 안전한 SVG만 남기기(docs/design/layout.md 아이콘).
// 개념 이름(server, db)은 저장소가 24 격자로 그린 의미 아이콘(symbols.js)이고, 기술 브랜드 이름(git)은 brands.json이 가리키는 Simple Icons 파일이다.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { ICON_NAMES, loadIcon } from '../src/icons/index.js';
import { ICON_GRID, SYMBOLS } from '../src/icons/symbols.js';
import { sanitizeIcon } from '../src/icons/sanitize.js';
import { withFolder } from './helpers.js';

const ICONS = new URL('../src/icons/', import.meta.url);
const BRANDS = JSON.parse(readFileSync(new URL('brands.json', ICONS), 'utf8'));
const NOTICE = readFileSync(new URL('../../NOTICE', ICONS), 'utf8');
const brandFile = (name) => new URL(`simple-icons/${BRANDS[name]}.svg`, ICONS);

// 근거: 설계 layout.md 아이콘 "기술 브랜드 이름은 brands.json 표 하나에서 찾고, 파일은 색을 currentColor로만 바꾼 것이다. 로고(logo--*)와 공급자 서비스 아이콘은 넣지 않는다"
test('icons_bundled_brand_files_match_the_name_table_and_carry_no_logos_or_fixed_colors', () => {
  for (const name of Object.keys(BRANDS)) {
    const path = brandFile(name);

    assert.ok(existsSync(path), name);
    assert.ok(!BRANDS[name].includes('logo--') && !/^(aws|amazon|azure|googlecloud)/.test(BRANDS[name]), `${name}: 공급자 서비스 아이콘이 아니다`);
    assert.match(readFileSync(path, 'utf8'), /fill="currentColor"/, name);
    assert.doesNotMatch(readFileSync(path, 'utf8'), /fill="#|stroke="#/, name);
  }
  assert.ok(NOTICE.includes('color only'));
});

// 근거: 설계 layout.md 아이콘 "기본 이름은 개념과 브랜드가 한 표에 있고 서로 겹치지 못한다. 역할은 개념 등록부가 정하고 브랜드는 brand다"
test('icons_name_table_is_the_concepts_and_the_brands_without_overlap_and_each_has_a_role', () => {
  assert.equal(Object.keys(ICON_NAMES).length, Object.keys(SYMBOLS).length + Object.keys(BRANDS).length);
  assert.deepEqual(Object.keys(SYMBOLS).filter((name) => Object.hasOwn(BRANDS, name)), []);
  for (const [name, role] of Object.entries(ICON_NAMES)) assert.equal(role, SYMBOLS[name]?.role ?? 'brand', name);
  assert.deepEqual([...new Set(Object.values(ICON_NAMES))].sort(), ['access', 'brand', 'data', 'person', 'service']);
});

// 근거: 설계 layout.md 아이콘 "NOTICE에 상표 문구가 있고, 넣은 브랜드 파일 수가 NOTICE와 맞는다. 개념 아이콘은 저장소가 그렸으므로 제삼자 아이콘 자료가 없다"
test('icons_notice_states_the_trademark_notice_and_counts_every_bundled_file', () => {
  assert.match(NOTICE, /trademarks of their respective owners/);
  assert.ok(NOTICE.includes(`${Object.keys(BRANDS).length} icons`), `NOTICE는 브랜드 파일 ${Object.keys(BRANDS).length}개를 센다`);
  assert.match(NOTICE, /concept icons .* are drawn in this repository/s);
  assert.match(NOTICE, /no third-party icon data/);
});

// 근거: 설계 layout.md 아이콘 "사용자 세트의 SVG는 허용한 요소만 남기고 색은 currentColor다. 코드와 외부 자원은 오류다"
test('sanitizeIcon_keeps_shapes_recolors_them_and_rejects_scripts_and_external_references', () => {
  const ok = sanitizeIcon('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>t</title><rect x="1" y="1" width="4" height="4" fill="#123456" id="x"/></svg>');

  assert.deepEqual(ok.viewBox, [0, 0, 24, 24]);
  assert.ok(ok.body.includes('fill="currentColor"') && !ok.body.includes('#123456'));
  for (const bad of ['<script>alert(1)</script>', '<image href="http://x/y.png"/>', '<use href="#a"/>', '<foreignObject/>']) {
    assert.throws(() => sanitizeIcon(`<svg viewBox="0 0 1 1">${bad}</svg>`), /not supported|outside tags/, bad);
  }
  assert.throws(() => sanitizeIcon('<svg viewBox="0 0 1 1"><path d="M0 0" onload="x()"/></svg>'), /not supported/);
});

// 근거: 설계 figure-syntax.md 아이콘 절 "icons 이름 폴더로 등록한 세트는 icon=세트:이름으로 쓰고, 파일이 없으면 그 줄의 오류다"
test('buildFigure_user_icon_set_loads_the_file_and_reports_a_missing_one_at_its_line', async () => {
  await withFolder(async (folder) => {
    mkdirSync(join(folder, 'set'));
    writeFileSync(join(folder, 'set', 'lb.svg'), '<svg viewBox="0 0 8 8"><circle cx="4" cy="4" r="3"/></svg>');
    const source = (name) => `daphnis 2\nicons mine "set"\nbox a "A" icon=mine:${name} badge="LB"`;
    const { scene } = await buildFigure(source('lb'), { baseDir: folder, strict: true });

    assert.ok(scene.items[0].decor.items.some((i) => i.kind === 'icon'));
    await assert.rejects(buildFigure(source('none'), { baseDir: folder }), (e) => e.problems[0].line === 3 && /the file does not exist/.test(e.problems[0].message));
  });
});

// 근거: #161. 기본 이름은 그대로 읽고 역할만 구분한다. 개념은 등록부의 도형을 24 격자로, 브랜드는 원래 파일 도형을 쓰고 브랜드에 성공·실패색을 부여하지 않는다.
test('loadIcon_separates_semantic_roles_without_changing_bundled_shapes', () => {
  for (const [name, role] of Object.entries({ server: 'service', db: 'data', key: 'access', user: 'person', git: 'brand' })) {
    const icon = loadIcon({ set: 'builtin', name }, [], '.');
    assert.equal(icon.role, role);
    if (role === 'brand') {
      const original = sanitizeIcon(readFileSync(brandFile(name), 'utf8'));
      assert.equal(icon.symbol, false);
      assert.equal(icon.body, original.body);
      assert.deepEqual(icon.viewBox, original.viewBox);
    } else {
      assert.equal(icon.symbol, true);
      assert.equal(icon.body, SYMBOLS[name].body);
      assert.deepEqual(icon.viewBox, [0, 0, ICON_GRID, ICON_GRID]);
    }
  }
});

// 근거: #161. 범용 개념은 모두 면 아이콘이 있고 기술 브랜드는 원래 실루엣을 쓴다. 의미 아이콘은 고정색이나 외부 자원을 갖지 않는다.
test('symbols_cover_every_concept_name_without_replacing_brand_marks', () => {
  const concepts = Object.entries(ICON_NAMES).filter(([, role]) => role !== 'brand').map(([name]) => name);
  assert.deepEqual(Object.keys(SYMBOLS).sort(), concepts.sort());
  assert.equal(ICON_GRID, 24);
  for (const { body } of Object.values(SYMBOLS)) {
    assert.match(body, /symbol-face|symbol-solid/);
    assert.doesNotMatch(body, /#[a-f0-9]{6}|<script|<image|href=/i);
  }
});
