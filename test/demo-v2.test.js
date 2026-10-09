// 예제 30개와 갤러리, 첫 화면 그림이 둘째 판 문법으로 쓰였고 기능을 의미 있게 덮는지 확인한다.
// 개수만 세지 않는다: 원본 낱말을 읽어 기능마다 어느 예제가 쓰는지 대조하고, 컴파일 결과의 시간표와 값 묶음, 실제 Chrome의 가로 넘침을 확인한다.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { catalogCoverage } from '../scripts/lib/catalog-coverage.mjs';
import { galleryPage } from '../scripts/lib/catalog-page.mjs';
import { supportFiles } from '../scripts/lib/catalog-support.mjs';
import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';
import { VALUES } from '../src/source/grammar.js';
import { TONES } from '../src/tone.js';
import { launchChrome } from './chrome.js';
import { withFolder } from './helpers.js';

const CHARTS = ['bar', 'stacked', 'percent', 'dumbbell', 'difference', 'line', 'step', 'area', 'scatter', 'histogram', 'box', 'ecdf', 'heatmap', 'donut', 'pie', 'waterfall'];
const DEVELOPMENT = ['architecture', 'flow', 'state', 'schema', 'class', 'api', 'sequence', 'trace', 'metric', 'memory', 'stack', 'queue', 'pointer', 'integration'];
const ALL = [...CHARTS, ...DEVELOPMENT];
const SHOWCASE = ['async-orders', 'cloud-architecture', 'latency', 'oauth', 'order-rush', 'order-state', 'shop-schema'];

const sourceOf = (id) => readFileSync(`examples/${id}.dap`, 'utf8');
const sources = Object.fromEntries(ALL.map((id) => [id, sourceOf(id)]));
const coverage = Object.fromEntries(ALL.map((id) => [id, catalogCoverage(sources[id])]));
const built = Object.fromEntries(await Promise.all(ALL.map(async (id) => [id, await buildFigure(sources[id], { baseDir: 'examples', strict: true })])));
const users = (key) => ALL.filter((id) => coverage[id][key]);
// 줄 시작에서 장면 줄만 모은다.
const sceneLines = (source) => source.split('\n').filter((line) => /^scene /.test(line));

// 근거: 예제 전면 교체. 폴더는 지원하는 표현마다 하나, 변형 예제와 옛 산출물이 없다
test('examples_folder_holds_exactly_one_demo_per_supported_expression', () => {
  const files = readdirSync('examples').filter((name) => name.endsWith('.dap')).map((name) => name.replace(/\.dap$/, ''));

  assert.deepEqual(files.sort(), [...ALL].sort());
  assert.deepEqual([...CHARTS].sort(), Object.keys(VALUES.chartType.items).sort(), 'one chart demo per chart type of the grammar table');
  assert.deepEqual(readdirSync('examples').filter((name) => !name.endsWith('.dap')).sort(), ['data', 'icons'], 'only the folders that sources read by relative path remain');
  for (const stale of ['catalog', 'catalog.json', 'out']) assert.ok(!existsSync(`examples/${stale}`), `${stale} is gone`);
});

// 근거: 둘째 판 계약. 첫 문장, 낱말, 색 이름이 모두 정식 형태이고 옛 형태가 한 줄도 없다
test('every_example_and_showcase_source_uses_the_canonical_second_grammar', () => {
  const files = [...ALL.map((id) => `examples/${id}.dap`), 'docs/assets/how-it-works.dap', ...SHOWCASE.flatMap((id) => [`docs/assets/showcase/${id}-en.dap`, `docs/assets/showcase/${id}-ko.dap`])];
  const paint = /\b(?:tone|fill|stroke|card)=([a-z]+)/g;

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    assert.equal(lines[0], 'daphnis 2', `${file} starts with the version line`);
    assert.ok(!/^(?:flow|sequence|state|data|class)(?: right| down)?$|^chart \w+$|^step |^\s+say /m.test(text), `${file} has no old kind line, step, or say`);
    assert.ok(!/mutoscope|\.muto|speed \d/.test(text), `${file} has no old name or header speed`);
    for (const [, name] of text.matchAll(paint)) assert.ok(TONES.includes(name), `${file}: ${name} is a canonical color name`);
    for (const line of sceneLines(text)) assert.match(line, /\bmode=(static|once|loop)\b/, `${file}: a scene states its mode (${line})`);
    for (const line of sceneLines(text)) assert.ok(!/^scene "[^"]*" "/.test(line), `${file}: a scene takes one name`);
  }
});

// 근거: 색 규칙. 정식 색 이름 여덟 개가 모두 예제에서 실제로 쓰인다
test('the_examples_use_every_canonical_color_name_and_no_legacy_alias', () => {
  const used = new Set();
  for (const id of ALL) for (const [, name] of sources[id].matchAll(/\b(?:tone|fill|stroke|card)=([a-z]+)/g)) used.add(name);

  assert.deepEqual([...used].sort(), [...TONES].sort());
  for (const alias of ['brand', 'amber', 'teal', 'navy', 'pink', 'sky']) assert.ok(!used.has(alias), alias);
});

// 근거: 정지 첫 장면과 움직임 탭. 갤러리가 영원히 도는 재생 서른 개를 한꺼번에 띄우지 않고, 움직이는 예제는 탭으로 고른다
test('the_first_scene_of_every_example_is_static_and_traffic_demos_have_once_and_loop_tabs', () => {
  for (const id of ALL) {
    const steps = built[id].timeline.steps;

    assert.equal(steps[0].mode, 'static', `${id}: first scene`);
    assert.ok(steps.every((step) => ['static', 'once', 'loop'].includes(step.mode) && step.speed > 0), id);
    assert.ok(steps.length >= 2, `${id} has a scene beyond the still one`);
  }
  for (const id of ['architecture', 'flow', 'queue', 'memory', 'stack', 'pointer', 'metric', 'integration', 'donut', 'sequence', 'trace']) {
    const modes = built[id].timeline.steps.map((step) => step.mode);

    assert.ok(modes.includes('once') && modes.includes('loop'), `${id} shows traffic once and looping: ${modes}`);
  }
  assert.ok(built.flow.timeline.steps.some((step) => step.speed !== 1), 'a scene sets its own speed');
});

// 근거: 차트 열여섯 종류가 각자 자기 종류의 카드로 컴파일된다
test('each_chart_demo_compiles_to_its_own_chart_type', () => {
  for (const id of CHARTS) assert.ok(coverage[id][`chart:${id}`], `${id} declares chart ${id}`);
  const declared = ALL.flatMap((id) => Object.keys(coverage[id]).filter((key) => key.startsWith('chart:')).map((key) => key.slice(6)));

  assert.deepEqual([...new Set(declared)].sort(), [...CHARTS].sort());
});

// 근거: 차트 의미. 빠진 값과 0, 계열 N개, 기대값, 신뢰구간, 기준선, 행 기준선이 원본에 실제로 있다
test('chart_demos_cover_missing_versus_zero_n_series_reference_ranges_and_rules', () => {
  assert.match(sources.bar, /before=- /, 'bar: a missing value');
  assert.match(sources.bar, /after=0 after\.low=0/, 'bar: a real zero');
  assert.match(sources.bar, /rule=0\.8/, 'bar: a per-row reference rule');
  assert.match(sources.bar, /^\s*rule 1 /m, 'bar: a rule for every row');
  assert.match(sources.percent, /row "알림 API"( \w+=-){9}/, 'percent: a row with every value missing');
  assert.match(sources.percent, /row "정산 배치"( \w+=0){9}/, 'percent: a row whose sum is zero');
  assert.match(sources.stacked, /refund=-\s*$/m, 'stacked: one missing part');
  assert.match(sources.stacked, /churn=-\d/, 'stacked: negative parts');
  assert.match(sources.line, /tokyo=-/, 'line: a gap');
  assert.match(sources.step, /running=-/, 'step: a gap');
  assert.match(sources.ecdf, /^\s*sample - series=canary$/m, 'ecdf: a missing sample');
  assert.deepEqual(users('role=reference'), ['bar', 'line', 'step']);
  const seriesCount = (id) => (sources[id].match(/^\s*series /gm) ?? []).length;
  assert.ok(seriesCount('percent') >= 8, 'percent shows the pattern layer past seven colors');
  assert.ok((sources.pie.match(/^\s*row /gm) ?? []).length >= 8, 'pie shows the pattern layer past seven colors');
  for (const id of ['line', 'step', 'area', 'scatter', 'ecdf', 'stacked', 'bar']) assert.ok(seriesCount(id) >= 3, `${id} has three or more series`);
  for (const key of ['.low', '.high']) assert.ok(users(`diff${key}`).includes('difference') && users(`before${key}`).includes('bar'), key);
  assert.ok(coverage.dumbbell.scale && /scale log/.test(sources.dumbbell), 'dumbbell: a log scale');
  assert.ok(/zero off/.test(sources.line), 'line: a cut axis');
  assert.ok(coverage.histogram['measure=probability'] && coverage.histogram['measure=density'] && /bins auto/.test(sources.histogram) && coverage.histogram.data, 'histogram: both scales, auto bins, and a JSON source');
  assert.ok(coverage.scatter.link, 'scatter: link arrows');
});

// 근거: 값 묶음과 바뀐 표식. 값이 바뀌면 차트 프레임이 바뀌고 바뀐 표식이 알려진다
test('bound_chart_demos_change_frames_and_report_the_changed_marks', () => {
  for (const id of ['donut', 'metric', 'integration']) {
    const charts = Object.values(built[id].timeline.charts ?? {});

    assert.ok(charts.length > 0, `${id} has a bound chart`);
    const periods = charts.flatMap((chart) => chart.rows.flatMap((row) => row.periods));
    assert.ok(periods.length > 2, `${id}: the chart changes frames over time`);
    assert.ok(periods.some(([, , , changed]) => changed.length > 0), `${id}: some mark is reported as changed`);
  }
  assert.match(sources.donut, /row "정산" value=settles/);
  assert.match(sources.donut, /value settles "정산 대기" on=settle from=0/, 'donut: a slice that starts at zero');
  assert.ok(built.metric.figure.views.length >= 3 && built.integration.figure.views.length >= 3, 'several panels share one event');
});

// 근거: 값에 묶은 막대는 이제 만들어진다. 지표 예제는 값에 묶은 막대와 값에 묶은 선을 함께 보이고, 막대를 선으로 바꿔 우회하지 않는다
test('the_metric_demo_binds_a_bar_chart_and_a_line_chart_to_values', () => {
  assert.match(sources.metric, /^chart cpu "[^"]*" bar /m, 'metric: a bar chart');
  assert.match(sources.metric, /^chart lat "[^"]*" line /m, 'metric: a line chart');
  for (const server of ['cpu1', 'cpu2', 'cpu3']) assert.match(sources.metric, new RegExp(`row "API \\d" load=${server}$`, 'm'));
  assert.match(sources.metric, /point x=4 ms=p95/, 'metric: the line ends at the card value');
  const bar = built.metric.timeline.charts.cpu;

  assert.ok(bar, 'the bar chart is bound');
  assert.ok(bar.rows.flatMap((row) => row.periods).some(([, , , changed]) => changed.length > 0), 'the bar reports a changed mark');
});

// 근거: 예제 글의 사실. 차이 값의 부호가 계열 이름, 부제와 같고, 겹쳐 그리는 면적을 쌓는다고 말하지 않는다
test('example_copy_states_the_difference_sign_and_the_overlap_of_area_series_exactly', () => {
  assert.match(sources.difference, /series diff "새 모델 − 기존 모델"/, 'difference: the series is new minus old');
  assert.match(sources.difference, /subtitle "새 모델 전환율에서 기존 모델 전환율을 뺀 값이 0보다 오른쪽이면 새 모델이 낫다"/, 'difference: the subtitle states the same sign');
  assert.ok(!/기존 모델에서 새 모델을 뺀/.test(sources.difference), 'difference: no reversed sign');
  assert.match(sources.area, /겹쳐 그려진다/, 'area: series overlap');
  assert.ok(!/쌓/.test(sources.area), 'area: nothing is called stacked');
});

// 근거: 예제 원본이 상대 경로로 읽는 자료(아이콘 파일, JSON 값)는 모두 예제 폴더 안에 있고, 갤러리가 파일마다 링크한다
test('support_files_of_every_example_are_inside_the_folder_and_linked_from_the_gallery', () => {
  const support = Object.fromEntries(ALL.map((id) => [id, supportFiles(sources[id], 'examples')]));

  assert.deepEqual(support.architecture, ['icons/chip.svg']);
  assert.deepEqual(support.histogram, ['data/latency.json']);
  assert.deepEqual(ALL.filter((id) => support[id].length).sort(), ['architecture', 'histogram']);
  assert.throws(() => supportFiles('daphnis 2\nchart c "t" bar {\n  data "../outside.json"\n}', 'examples'), /must stay inside/);
  assert.throws(() => supportFiles('daphnis 2\nchart c "t" bar {\n  data "data/missing.json"\n}', 'examples'), /is missing/);
  const html = galleryPage(ALL.map((id) => ({ id, group: CHARTS.includes(id) ? '차트' : '개발 그림', title: built[id].figure.title, subtitle: built[id].figure.subtitle, scenes: built[id].timeline.steps, source: sources[id], support: support[id] })), 'Daphnis 예제');
  assert.ok(html.includes('href="icons/chip.svg"') && html.includes('href="data/latency.json"'));
  assert.equal((html.match(/class="catalog-support"/g) ?? []).length, 2);
});

// 근거: 갤러리 만들기는 낡은 목록과 그림을 남기지 않고, 원본이 읽는 자료를 같은 상대 경로에 복사하며, 모르는 폴더는 지우지 않는다
test('the_catalog_build_replaces_a_previous_catalog_and_copies_the_files_the_sources_read', () => {
  withFolder((folder) => {
    const output = join(folder, 'catalog');
    mkdirSync(output);
    writeFileSync(join(output, 'review.json'), '[]');
    writeFileSync(join(output, 'old-listing.html'), 'stale');
    const run = spawnSync(process.execPath, ['scripts/build-catalog.mjs', output], { encoding: 'utf8' });

    assert.equal(run.status, 0, run.stderr);
    assert.ok(!existsSync(join(output, 'old-listing.html')), 'a stale file is gone');
    for (const id of ALL) for (const ext of ['dap', 'svg', 'html']) assert.ok(existsSync(join(output, `${id}.${ext}`)), `${id}.${ext}`);
    assert.deepEqual(readdirSync(output).sort(), [...ALL.flatMap((id) => ['dap', 'svg', 'html'].map((ext) => `${id}.${ext}`)), 'data', 'icons', 'index.html', 'review.json'].sort());
    assert.ok(existsSync(join(output, 'icons/chip.svg')) && existsSync(join(output, 'data/latency.json')));
    assert.deepEqual(readdirSync(join(output, 'icons')), ['chip.svg']);
    const unknown = join(folder, 'unknown');
    mkdirSync(unknown);
    writeFileSync(join(unknown, 'mine.txt'), 'keep');
    const refused = spawnSync(process.execPath, ['scripts/build-catalog.mjs', unknown], { encoding: 'utf8' });

    assert.notEqual(refused.status, 0);
    assert.equal(readFileSync(join(unknown, 'mine.txt'), 'utf8'), 'keep', 'a folder this script did not make is left alone');
  });
});

// 근거: 사건의 방향과 동시성. 거꾸로 지나는 이동, 손실, 동시 이동, 같은 순간의 경쟁, 막힘이 예제에 있다
test('traffic_demos_cover_reverse_loss_concurrent_and_blocked_flows', () => {
  assert.match(sources.integration, /^gw -> pay$/m);
  assert.match(sources.integration, /^\s+pay -> gw "ok" dashed/m, 'integration: a move against the declared edge');
  assert.deepEqual(users('lost'), ['flow', 'queue']);
  assert.ok(users('&').includes('flow'), 'concurrent beats');
  assert.ok(users('track').length >= 6, 'flows');
  assert.deepEqual(users('stuck'), ['queue']);
  for (const key of ['reserve', 'wait', 'timeout', 'else', 'when', 'keep', 'set', 'legs', 'quiet', 'status', 'ref', 'every']) assert.ok(users(key).length > 0, `${key} appears in an example`);
  assert.deepEqual(users('reserve'), ['flow', 'queue']);
  assert.ok(users(':=').length > 0, 'a read expression');
  assert.ok(users('fragment:alt').length && users('fragment:loop').length && users('fragment:par').length && users('fragment:opt').length, 'all four sequence fragments');
  for (const pattern of [/" create$/m, /" destroy$/m, /^\s+activate \w+$/m, /^\s+deactivate \w+$/m, /^\s+note \w+ "/m]) assert.match(sources.sequence, pattern);
});

// 근거: 카드와 보기 범위. 카드 종류, 보기 네 방식, 클래스 여섯 관계, 스키마 제약, 격자, 추적 단위가 예제에 있다
test('structure_demos_cover_cards_views_relations_constraints_grids_and_traces', () => {
  for (const key of ['person', 'box', 'external', 'store', 'decision', 'queue', 'state', 'group', 'grid', 'table', 'api', 'class', 'interface', 'chart', 'trace', 'icons']) assert.ok(users(key).length > 0, key);
  for (const view of ['graph', 'sequence', 'plot', 'time']) assert.ok(users(`view:${view}`).length > 0, view);
  for (const relation of ['association', 'dependency', 'inheritance', 'realization', 'aggregation', 'composition']) assert.deepEqual(users(`relation=${relation}`), ['class'], relation);
  for (const policy of ['restrict', 'cascade', 'set-null', 'no-action']) assert.deepEqual(users(`ondelete=${policy}`), ['schema'], policy);
  for (const key of ['pk', 'unique', 'nullable', 'required', 'fk']) assert.ok(users(key).includes('schema'), key);
  assert.deepEqual(users('grid').sort(), ['memory', 'pointer', 'stack']);
  assert.ok(users('unit=us').includes('trace') && users('unit=ms').includes('trace'), 'trace units');
  assert.match(sources.api, /api charge "POST https:\/\/pay\.example\.com\/v1\/charges"/, 'an https address as the API title');
  for (const key of ['count', 'badge', 'border', 'shape=tile', 'no', 'head=both', 'mono', 'mark', 'meta', 'tag', 'lit', 'clear']) assert.ok(users(key).length > 0, key);
  for (const key of ['abstract', 'static', 'visibility=private', 'visibility=protected', 'visibility=public']) assert.deepEqual(users(key), ['class'], key);
});

// 근거: 모든 예제가 strict로 오류와 경고 없이 만들어지고 시간표가 있다
test('every_example_builds_strictly_without_warnings_and_has_a_timeline', () => {
  for (const id of ALL) {
    assert.deepEqual(built[id].warnings, [], `${id} has no warnings`);
    assert.ok(built[id].timeline.total > 0 && Number.isFinite(built[id].timeline.total), `${id} has a finite timeline`);
    assert.ok(built[id].figure.title && built[id].figure.subtitle, `${id} has a title and a subtitle`);
  }
});

// 근거: 서술 금지. 그림 안에 설명 글, 재생 조작, 홍보 문구가 없다(설명은 문서 본문이 맡는다)
test('examples_carry_no_captions_footers_or_marketing_text_inside_the_figure', () => {
  for (const id of ALL) {
    assert.ok(!/^\s*say /m.test(sources[id]), id);
    assert.ok(!/(?:혁신|강력한|손쉽게|쉽게 만드는|완벽)/.test(sources[id]), `${id}: no marketing words`);
    assert.ok(!/^(?:width|aspect) /m.test(sources[id]), `${id} lets the layout pick its width and keeps text at its size`);
  }
});

// 근거: 갤러리 목록은 예제마다 재생 화면, SVG, 원본 내려받기와 원본 글을 한 쪽에 둔다
test('the_gallery_index_exposes_every_example_and_its_source', () => {
  const entries = ALL.map((id) => ({ id, group: CHARTS.includes(id) ? '차트' : '개발 그림', title: built[id].figure.title, subtitle: built[id].figure.subtitle, scenes: built[id].timeline.steps, source: sources[id] }));
  const html = galleryPage(entries, 'Daphnis 예제');

  for (const id of ALL) {
    assert.ok(html.includes(`href="${id}.html"`) && html.includes(`href="${id}.svg"`) && html.includes(`href="${id}.dap"`), `${id}: three links`);
    assert.ok(html.includes(`id="${id}"`), `${id}: an anchor`);
    assert.ok(html.includes('daphnis 2'), 'source text');
  }
  assert.equal((html.match(/<details><summary>원본 보기<\/summary>/g) ?? []).length, ALL.length);
  assert.ok(!/<script src|<link rel="stylesheet"/.test(html), 'no outside framework or stylesheet');
});

// 근거: 첫 화면 그림. 영어와 한국어가 한 쌍이고 둘째 판이며 같은 구조이다. 첫 그림은 움직이는 반복 장면이다
test('showcase_pairs_share_one_structure_and_the_hero_loops', async () => {
  const skeleton = (text) => text.replace(/"[^"\n]*"/g, '""').replace(/`[^`\n]*`/g, '``');

  for (const id of SHOWCASE) {
    const [en, ko] = ['en', 'ko'].map((lang) => readFileSync(`docs/assets/showcase/${id}-${lang}.dap`, 'utf8'));

    assert.equal(skeleton(en), skeleton(ko), id);
    for (const lang of ['en', 'ko']) for (const theme of ['light', 'dark']) assert.ok(existsSync(`docs/assets/showcase/${id}-${lang}-${theme}.svg`), `${id}-${lang}-${theme}`);
  }
  assert.ok(readdirSync('docs/assets/showcase').every((name) => SHOWCASE.some((id) => name.startsWith(`${id}-`))), 'no obsolete showcase files remain');
  const hero = await buildFigure(readFileSync('docs/assets/showcase/async-orders-en.dap', 'utf8'), { baseDir: 'docs/assets/showcase', strict: true });
  assert.equal(hero.timeline.steps[0].mode, 'loop');
});

// 근거: 모바일 390과 데스크톱 960에서 페이지 전체가 가로로 넘치지 않는다. 넓은 판은 판 안에서 움직인다. Chrome이 없으면 실패한다
test('every_player_page_and_the_gallery_index_stay_inside_the_page_width_at_390_and_960', async () => {
  const browser = await launchChrome();
  try {
    const pages = [...await Promise.all(ALL.map(async (id) => [id, await toHtml(built[id], id)]))];
    pages.push(['index', galleryPage(ALL.map((id) => ({ id, group: CHARTS.includes(id) ? '차트' : '개발 그림', title: built[id].figure.title, subtitle: built[id].figure.subtitle, scenes: built[id].timeline.steps, source: sources[id] })), 'Daphnis 예제')]);
    for (const width of [390, 960]) {
      const errors = [];
      for (const [id, html] of pages) {
        // 재생기는 전역 상수를 선언하므로 문서마다 새 페이지를 쓴다.
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        page.on('pageerror', (error) => errors.push(`${id}: ${error.message}`));
        await page.setContent(html, { waitUntil: 'load' });
        const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
        await page.close();

        assert.ok(scroll <= inner, `${id} at ${width}: page scrolls ${scroll} > ${inner}`);
      }
      assert.deepEqual(errors, [], `page errors at ${width}`);
    }
  } finally {
    await browser.close();
  }
});
