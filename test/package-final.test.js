// 배포 꾸러미 메타데이터: 쓰지 않는 개발 의존성과 옛 명령 이름이 없고, 아이콘 등록부가 읽는 파일이 모두 `files`에 들어간다.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const json = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const pkg = json('package.json');
const lock = json('package-lock.json');

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

test('the unused palette source dependency and the old command name are gone from package.json and the lock root', () => {
  assert.equal(pkg.devDependencies['@carbon/colors'], undefined);
  assert.deepEqual(Object.keys(pkg.bin), ['daphnis']);
  const root = lock.packages[''];
  assert.deepEqual(root.bin, { daphnis: 'src/cli.js' });
  assert.deepEqual(root.devDependencies, pkg.devDependencies);
  assert.deepEqual(root.dependencies, pkg.dependencies);
  assert.equal(lock.packages['node_modules/@carbon/colors'], undefined);
  assert.equal(lock.packages['node_modules/@ibm/telemetry-js'], undefined);
});

test('nothing outside the lock and manifest names @carbon/colors', () => {
  const dirs = ['src', 'scripts', '.github', 'test'].map((d) => join(ROOT, d)).filter(existsSync);
  const hits = dirs.flatMap(walk).filter((file) => !file.endsWith('package-final.test.js') && /@carbon\/colors/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(hits.map((f) => relative(ROOT, f)), []);
});

test('the lock keeps the theme owner pin and every dependency of the manifest', () => {
  const root = lock.packages[''];
  assert.equal(root.devDependencies['@woonyong-choi/design-tokens'], pkg.devDependencies['@woonyong-choi/design-tokens']);
  for (const name of [...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)]) {
    assert.ok(lock.packages[`node_modules/${name}`], name);
  }
});

test('the package ships src whole, so brands.json, the registry modules and the license texts are inside it', () => {
  assert.ok(pkg.files.includes('src'));
  assert.ok(pkg.files.includes('LICENSE') && pkg.files.includes('NOTICE'));
  const shipped = readdirSync(join(ROOT, 'src/icons'));
  for (const file of ['brands.json', 'symbols.js', 'person.js', 'controls.js', 'index.js', 'sanitize.js', 'LICENSE', 'simple-icons']) {
    assert.ok(shipped.includes(file), file);
  }
  for (const gone of ['names.json', 'carbon', 'lucide']) assert.ok(!shipped.includes(gone), gone);
});

test('every relative import and brand file in src/icons resolves inside src', () => {
  const dir = join(ROOT, 'src/icons');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const source = readFileSync(join(dir, file), 'utf8');
    for (const [, spec] of source.matchAll(/from '(\.[^']+)'/g)) {
      const target = resolve(dirname(join(dir, file)), spec);
      assert.ok(existsSync(target), `${file} -> ${spec}`);
      assert.ok(relative(join(ROOT, 'src'), target) && !relative(join(ROOT, 'src'), target).startsWith('..'), `${file} -> ${spec}`);
    }
  }
  const brands = json('src/icons/brands.json');
  for (const stem of Object.values(brands)) assert.ok(existsSync(join(dir, 'simple-icons', `${stem}.svg`)), stem);
});
