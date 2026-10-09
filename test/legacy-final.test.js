// 읽지 않는 옛 입력(판 표기, 확장자, 소유 표시)과 아이콘 등록부의 계약. 옛 이름을 읽거나 가져가는 길은 없고, 옛 파일은 사용자 파일로 남는다.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildFigure } from '../src/build.js';
import { ICON_NAMES, loadIcon } from '../src/icons/index.js';
import { SYMBOLS } from '../src/icons/symbols.js';
import { parseFigure } from '../src/source/parse.js';
import { toSvg } from '../src/svg.js';
import { runCli, withFolder } from './helpers.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const BODY = 'box a "A"\nbox b "B"\na -> b\nview main graph right\n';
const GOOD = `daphnis 2\n${BODY}`;
const DOC = (name = '') => `# 문서\n\n\`\`\`dap${name}\n${GOOD}\`\`\`\n`;

const problemsOf = (source) => {
  try {
    parseFigure(source);
    return [];
  } catch (error) {
    if (!error.problems) throw error;
    return error.problems.map(({ code, line, column, message }) => ({ code, line, column, message }));
  }
};
const write = (folder, files) => {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, name)), { recursive: true });
    writeFileSync(join(folder, name), text);
  }
};

// 소스 읽기

test('only a first line of exactly "daphnis 2" starts a source; every other first line is one generic error at its own place', () => {
  const [missing] = problemsOf(`# note\n\n${BODY}`);
  assert.deepEqual([missing.code, missing.line, missing.column], ['missing-version', 3, 1]);
  assert.equal(problemsOf('').at(0).code, 'missing-version');
  assert.equal(problemsOf('daphnis 1\n' + BODY).at(0).code, 'unsupported-version');
  assert.equal(problemsOf('daphnis 3\n' + BODY).at(0).code, 'unsupported-version');
  assert.equal(problemsOf('daphnis two\n' + BODY).at(0).code, 'invalid-version');
  assert.deepEqual(problemsOf(GOOD), []);
});

test('an old tool name or an old kind line gets the same generic errors as any other unknown text, with no dedicated route', () => {
  const [name] = problemsOf(`mutoscope 2\n${BODY}`);
  assert.deepEqual([name.code, name.line, name.column, name.message], ['missing-version', 1, 1, 'the first line must be "daphnis 2"']);
  const kind = problemsOf('daphnis 2\nflow right\nbox a "A"\n');
  assert.equal(kind[0].line, 2);
  assert.match(kind[0].message, /unknown statement "flow"/);
  assert.ok(kind.every(({ code }) => code !== 'removed-kind' && code !== 'removed-name'));
  const src = ['src/source/version.js', 'src/cli.js', 'src/md.js', 'src/md-owner.js', 'src/md-run.js'].map(read).join('\n');
  assert.doesNotMatch(src, /mutoscope|\.muto|removed-name|removed-kind|removed-extension|removed-fence|`muto`|"muto"/);
});

// 확장자

test('render and check read .dap files only; any other extension, .muto included, is one generic error and writes nothing', () => {
  withFolder((folder) => {
    write(folder, { 'old.muto': GOOD, 'plain.txt': GOOD, 'noext': GOOD });
    for (const name of ['old.muto', 'plain.txt', 'noext']) {
      for (const command of ['render', 'check']) {
        const result = runCli([command, join(folder, name)], folder);
        assert.equal(result.status, 1, `${command} ${name}`);
        assert.equal(result.stderr, `${join(folder, name)}:1: only .dap files are read\n`);
      }
    }
    assert.deepEqual(readdirSync(folder).sort(), ['noext', 'old.muto', 'plain.txt']);
    const json = JSON.parse(runCli(['check', join(folder, 'old.muto'), '--json'], folder).stdout);
    assert.deepEqual([json.code, json.line, json.column, json.severity], ['unsupported-extension', 1, 1, 'error']);
  });
});

test('a gallery lists .dap files only: other files in the folder, .muto included, are not sources and not errors', () => {
  withFolder((folder) => {
    write(folder, { 'ok.dap': GOOD, 'old.muto': GOOD, 'notes.txt': 'daphnis 2' });
    const out = join(folder, 'out');
    const result = runCli(['gallery', folder, '--out', out], folder);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readdirSync(out).sort(), ['document.html', 'index.html', 'ok.html', 'ok.svg']);
    assert.ok(!readFileSync(join(out, 'index.html'), 'utf8').includes('muto'));
    write(folder, { 'only/old.muto': GOOD });
    const none = runCli(['gallery', join(folder, 'only'), '--out', join(folder, 'none')], folder);
    assert.equal(none.status, 1);
    assert.match(none.stderr, /no \.dap files/);
    assert.ok(!existsSync(join(folder, 'none')));
  });
});

// 마크다운 소유

test('md writes a canonical v2 mark, and repeating the build changes no byte and passes --check', () => {
  withFolder((folder) => {
    write(folder, { 'doc.md': DOC() });
    const first = runCli(['md', 'doc.md'], folder);
    assert.equal(first.status, 0, first.stderr);
    const svg = readFileSync(join(folder, 'doc-1.svg'), 'utf8');
    assert.match(svg, /^<!-- daphnis md v2 doc\.md -->$/m);
    const doc = readFileSync(join(folder, 'doc.md'), 'utf8');
    assert.ok(doc.includes('![doc figure 1](doc-1.svg)<!-- dap -->'));
    const second = runCli(['md', 'doc.md'], folder);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(readFileSync(join(folder, 'doc-1.svg'), 'utf8'), svg);
    assert.equal(readFileSync(join(folder, 'doc.md'), 'utf8'), doc);
    const check = runCli(['md', 'doc.md', '--check'], folder);
    assert.equal(check.status, 0, check.stderr + check.stdout);
  });
});

test('an existing svg with an old unversioned or mutoscope mark is a user file: md refuses to overwrite it and leaves every byte', () => {
  for (const mark of ['<!-- daphnis md doc.md -->', '<!-- mutoscope md doc.md -->', '<!-- mutoscope md v2 doc.md -->', '<!-- muto md v2 doc.md -->']) {
    withFolder((folder) => {
      const old = `<svg xmlns="http://www.w3.org/2000/svg">\n${mark}\n<title>mine</title></svg>\n`;
      write(folder, { 'doc.md': DOC(), 'doc-1.svg': old });
      const before = readFileSync(join(folder, 'doc.md'), 'utf8');
      const result = runCli(['md', 'doc.md'], folder);
      assert.equal(result.status, 1, mark);
      assert.match(result.stderr, /doc-1\.svg already exists and has no daphnis md v2 mark/, mark);
      assert.equal(readFileSync(join(folder, 'doc-1.svg'), 'utf8'), old, mark);
      assert.equal(readFileSync(join(folder, 'doc.md'), 'utf8'), before, mark);
      assert.deepEqual(readdirSync(folder).sort(), ['doc-1.svg', 'doc.md']);
    });
  }
});

test('a canonical mark of another document is not claimed either, and only this document\'s v2 files are cleaned up as stale', () => {
  withFolder((folder) => {
    write(folder, { 'doc.md': DOC(' name=fig') });
    assert.equal(runCli(['md', 'doc.md'], folder).status, 0);
    const old = '<svg xmlns="http://www.w3.org/2000/svg">\n<!-- daphnis md doc.md -->\n</svg>\n';
    const other = '<svg xmlns="http://www.w3.org/2000/svg">\n<!-- daphnis md v2 other.md -->\n</svg>\n';
    write(folder, { 'doc-legacy.svg': old, 'doc-other.svg': other, 'doc-gone.svg': readFileSync(join(folder, 'doc-fig.svg'), 'utf8') });
    // 블록 이름을 바꾸면 doc-fig.svg와 복사해 둔 doc-gone.svg는 이 문서가 만든 낡은 파일이고, 옛 표시와 다른 문서 표시 파일은 남는다.
    write(folder, { 'doc.md': DOC(' name=next') });
    const result = runCli(['md', 'doc.md'], folder);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readdirSync(folder).sort(), ['doc-legacy.svg', 'doc-next.svg', 'doc-other.svg', 'doc.md']);
    assert.equal(readFileSync(join(folder, 'doc-legacy.svg'), 'utf8'), old);
    assert.equal(readFileSync(join(folder, 'doc-other.svg'), 'utf8'), other);
  });
});

test('md reads dap fences only: a muto fence and a muto-marked image line are the document\'s own text and stay as written', () => {
  withFolder((folder) => {
    const muto = `\`\`\`muto\n${GOOD}\`\`\`\n\n![old](old.svg)<!-- muto -->\n`;
    write(folder, { 'doc.md': `${DOC()}\n${muto}` });
    const result = runCli(['md', 'doc.md'], folder);
    assert.equal(result.status, 0, result.stderr);
    const doc = readFileSync(join(folder, 'doc.md'), 'utf8');
    assert.ok(doc.endsWith(`\n${muto}`), 'the muto fence and the old image line are untouched');
    assert.equal((doc.match(/<!-- dap -->/g) ?? []).length, 1);
    assert.deepEqual(readdirSync(folder).sort(), ['doc-1.svg', 'doc.md']);
    const only = runCli(['md', 'doc.md', '--unfold'], folder);
    assert.equal(only.status, 0, only.stderr);
    assert.ok(readFileSync(join(folder, 'doc.md'), 'utf8').endsWith(`\n${muto}`));
  });
});

test('md fails on a dap block that is not a daphnis 2 source without writing anything, and a protected svg is checked before the build', () => {
  withFolder((folder) => {
    const old = '# t\n\n```dap\nbox a "A"\n```\n';
    write(folder, { 'doc.md': old });
    const result = runCli(['md', 'doc.md'], folder);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /doc\.md:4: the first line must be "daphnis 2"/);
    assert.deepEqual(readdirSync(folder), ['doc.md']);
    assert.equal(readFileSync(join(folder, 'doc.md'), 'utf8'), old);
    write(folder, { 'doc-1.svg': '<svg/>\n' });
    const protectedRun = runCli(['md', 'doc.md'], folder);
    assert.equal(protectedRun.status, 1);
    assert.match(protectedRun.stderr, /doc-1\.svg already exists and has no daphnis md v2 mark/);
    assert.equal(readFileSync(join(folder, 'doc-1.svg'), 'utf8'), '<svg/>\n');
  });
});

// 액션

test('the action collects tracked .dap and .md files only, and says nothing about an old extension', () => {
  const text = read('action.yml');
  assert.doesNotMatch(text, /muto/i);
  assert.match(text, /\*\.dap\) dap_files\+=\("\$file"\) ;;/);
  assert.match(text, /\*\.md\) md_files\+=\("\$file"\) ;;/);
  assert.match(text, /tracked \.dap and \.md files/);

  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.includes('- name: Run daphnis'));
  const body = lines.slice(lines.findIndex((l, i) => i > start && l.trim() === 'run: |') + 1);
  const end = body.findIndex((l) => l.trim() && !l.startsWith('        '));
  const script = body.slice(0, end === -1 ? undefined : end).map((l) => l.slice(8)).join('\n');
  withFolder((folder) => {
    write(folder, { 'old.muto': GOOD, 'ok.dap': GOOD });
    spawnSync('git', ['init', '-q'], { cwd: folder });
    spawnSync('git', ['add', '-A'], { cwd: folder });
    const run = (paths) => spawnSync('bash', ['-c', script], { cwd: folder, encoding: 'utf8', env: { ...process.env, GITHUB_ACTION_PATH: ROOT, PATHS: paths, MODE: 'check', STRICT: 'false', BUDGET: '' } });
    const only = run('old.muto');
    assert.equal(only.status, 1);
    assert.match(only.stdout + only.stderr, /no tracked \.dap or \.md file matches 'old\.muto'/);
    const mixed = run('old.muto ok.dap');
    assert.equal(mixed.status, 0, mixed.stdout + mixed.stderr);
    assert.ok(!(mixed.stdout + mixed.stderr).includes('muto'));
  });
});

// 아이콘 등록부

const BRAND_NAMES = Object.entries(ICON_NAMES).filter(([, role]) => role === 'brand').map(([name]) => name);

test('every supported icon name is in one registry: concept names carry their shape and role, brands carry a file, and no name is in both', () => {
  const brands = JSON.parse(read('src/icons/brands.json'));
  assert.deepEqual(Object.keys(ICON_NAMES), [...Object.keys(SYMBOLS), ...Object.keys(brands)].sort());
  assert.deepEqual(BRAND_NAMES.sort(), Object.keys(brands).sort());
  assert.equal(Object.keys(SYMBOLS).filter((name) => Object.hasOwn(brands, name)).length, 0);
  assert.equal(Object.keys(SYMBOLS).length, 29);
  assert.equal(BRAND_NAMES.length, 32);
  for (const [name, { role, body }] of Object.entries(SYMBOLS)) {
    assert.ok(['service', 'data', 'access', 'person'].includes(role), name);
    assert.equal(ICON_NAMES[name], role, name);
    assert.match(body, /symbol-face|symbol-solid/, name);
    assert.doesNotMatch(body, /#[a-f0-9]{6}|<script|<image|href=/i, name);
  }
});

test('loadIcon takes a concept straight from the registry on the shared 24 grid and a brand from its svg file', () => {
  for (const [name, { role, body }] of Object.entries(SYMBOLS)) {
    const icon = loadIcon({ set: 'builtin', name }, [], '.');
    assert.deepEqual({ role: icon.role, name: icon.name, symbol: icon.symbol, body: icon.body, viewBox: icon.viewBox }, { role, name, symbol: true, body, viewBox: [0, 0, 24, 24] });
  }
  for (const name of BRAND_NAMES) {
    const icon = loadIcon({ set: 'builtin', name }, [], '.');
    assert.deepEqual([icon.role, icon.name, icon.symbol], ['brand', name, false]);
    assert.match(icon.body, /fill="currentColor"/);
  }
  assert.equal(loadIcon({ set: 'builtin', name: 'git' }, [], '.').role, 'brand');
});

test('the bundled icon files are the brand marks only, each a Simple Icons file with a color-free fill, and NOTICE counts them', () => {
  const icons = new URL('../src/icons/', import.meta.url);
  assert.deepEqual(readdirSync(icons).sort(), ['LICENSE', 'brands.json', 'controls.js', 'index.js', 'person.js', 'sanitize.js', 'simple-icons', 'symbols.js']);
  const brands = JSON.parse(read('src/icons/brands.json'));
  const files = readdirSync(new URL('simple-icons/', icons)).filter((f) => f.endsWith('.svg')).sort();
  assert.deepEqual(files, Object.values(brands).map((stem) => `${stem}.svg`).sort());
  for (const file of files) {
    const svg = read(`src/icons/simple-icons/${file}`);
    assert.match(svg, /fill="currentColor"/, file);
    assert.doesNotMatch(svg, /fill="#|stroke="#/, file);
  }
  const notice = read('NOTICE');
  assert.ok(notice.includes(`${files.length} icons`));
  assert.match(notice, /trademarks of their respective owners/);
  assert.match(notice, /Apache Kafka logo/);
  assert.match(notice, /CC BY 3\.0/);
  assert.doesNotMatch(notice, /IBM Carbon|src\/icons\/carbon|names\.json|src\/icons\/lucide/);
  assert.match(notice, /Player control icons \(src\/icons\/controls\.js\)/);
  assert.match(notice, /Copyright: 2026 Lucide Icons and Contributors \(ISC License\)/);
  assert.match(notice, /Cole Bemis/);
  assert.match(notice, /does not claim they are independent of Lucide/);
  const licenses = read('src/icons/LICENSE');
  assert.match(licenses, /Apache License\s+Version 2\.0/);
  assert.match(licenses, /^ISC License\n\nCopyright \(c\) 2026 Lucide Icons and Contributors$/m);
  assert.match(licenses, /^Copyright \(c\) 2013-present Cole Bemis$/m);
  assert.match(licenses, /Permission to use, copy, modify, and\/or distribute this software for any/);
  assert.match(licenses, /Permission is hereby granted, free of charge, to any person obtaining a copy/);
  assert.doesNotMatch(licenses, /IBM Corp|Carbon/);
  for (const name of ['minimize-2', 'zoom-in', 'zoom-out', 'download']) assert.match(licenses, new RegExp(`\\b${name}\\b`));
  assert.match(read('src/icons/simple-icons/LICENSE'), /CC0 1\.0 Universal/);
});

test('NOTICE names every font the figures embed, and each is a font file the measure code actually loads', () => {
  const notice = read('NOTICE');
  const fonts = read('src/measure/fonts.js');
  for (const [name, needle] of [['Pretendard', 'pretendard/'], ['Noto Sans', '@expo-google-fonts/noto-sans'], ['Noto Sans Math', '@expo-google-fonts/noto-sans-math'], ['JetBrains Mono', 'jetbrains-mono/']]) {
    assert.ok(fonts.includes(needle), needle);
    assert.ok(notice.includes(name), name);
  }
  assert.match(notice, /SIL Open Font License 1\.1/);
});

test('a figure draws a concept icon as a filled symbol, a brand and a user svg as their own glyph, through one fit', async () => {
  await withFolder(async (folder) => {
    write(folder, { 'set/chip.svg': '<svg viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="#123456"/></svg>' });
    const source = 'daphnis 2\nicons mine "set"\nbox s "서버" icon=server\nbox g "깃" icon=git\nbox c "칩" icon=mine:chip\ns -> g\ng -> c\nview main graph right\n';
    const result = await buildFigure(source, { baseDir: folder, strict: true });
    const svg = await toSvg(result, { scene: 0 });
    const chunk = (role) => new RegExp(`<g class="fl-symbol fl-symbol-${role}"><g class="([\\w-]+)" transform="translate\\(([\\d. -]+) ([\\d. -]+)\\) scale\\(([\\d.]+)\\)">`).exec(svg);
    assert.equal(chunk('service')[1], 'fl-symbol-glyph');
    assert.equal(chunk('brand')[1], 'fl-icon');
    assert.equal(chunk('custom')[1], 'fl-icon');
    assert.ok(svg.includes(SYMBOLS.server.body));
    assert.ok(!svg.includes('#123456'), 'a user svg is recolored to currentColor');
    const scales = ['service', 'brand'].map((role) => Number(chunk(role)[4]));
    assert.ok(Math.abs(scales[0] - scales[1]) < 1e-9, 'a 24-grid symbol and a 24-grid brand mark fit the same square at the same scale');
  });
});

test('an unknown builtin icon name is the line\'s error with the supported names, and the removed Carbon-file names are not paths', async () => {
  await assert.rejects(buildFigure('daphnis 2\nbox a "A" icon=bare-metal-server\n'), (e) => e.problems[0].line === 2 && /unknown icon "bare-metal-server"/.test(e.problems[0].message) && /server/.test(e.problems[0].message));
  await assert.rejects(buildFigure('daphnis 2\nbox a "A" icon=mine:x\n'), (e) => /icon set/.test(e.problems[0].message));
});
