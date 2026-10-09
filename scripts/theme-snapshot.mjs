// 가져온 테마의 파일과 해시, 그리고 사본의 출처 버전과 package.json의 design-tokens 태그가 같은지를 검증한다. 값은 공통 정본에서 갱신한다.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../src/design-theme/', import.meta.url);
const DEPENDENCY = '@woonyong-choi/design-tokens';
const hash = (value) => createHash('sha256').update(value).digest('hex');

// cost: time O(n), heap O(n), stack O(1), io f
// vars: n = 테마 바이트 수, f = 테마 파일 수
// basis: estimate
export function verifyTheme() {
  const meta = JSON.parse(readFileSync(new URL('theme.json', ROOT), 'utf8'));
  const config = JSON.parse(readFileSync(new URL('../../theme.config.json', ROOT), 'utf8'));
  if (meta.id !== config.theme) throw new Error(`theme mismatch: configured ${config.theme}, imported ${meta.id}`);
  if (hash(JSON.stringify(meta.files, null, 2) + '\n') !== meta.contentHash) throw new Error('invalid theme manifest hash');
  for (const [name, expected] of Object.entries(meta.files)) {
    if (name.startsWith('/') || name.split('/').includes('..')) throw new Error(`invalid theme path: ${name}`);
    if (hash(readFileSync(new URL(name, ROOT))) !== expected) throw new Error(`modified imported theme: ${name}`);
  }
  return meta;
}

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
/**
 * 가져온 테마 사본이 `package.json`의 design-tokens 태그(devDependencies)와 같은 버전에서 온 것인지 본다. 태그만 올리고 사본을 다시 가져오지 않았거나 그 반대이면 던진다.
 * 해시 검증은 사본이 자기 매니페스트와 같다는 것만 보증하므로 이 검사가 사본의 출처 버전을 맞춘다.
 */
export function verifyPin(meta) {
  const pinned = currentTag(JSON.parse(readFileSync(new URL('../../package.json', ROOT), 'utf8'))).slice(1);
  if (meta.source?.version !== pinned) {
    throw new Error(`theme copy is from design-tokens ${meta.source?.version}, but package.json pins v${pinned}. Run npm run theme:sync -- --from <design-tokens-root at v${pinned}>, npm run tokens and npm run figures`);
  }
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** package.json의 design-tokens 태그(`github:woonyong-choi/design-tokens#v0.1.0`의 `v0.1.0`). 이 모양이 아니면 던진다. */
export function currentTag(manifest) {
  const spec = manifest.devDependencies?.[DEPENDENCY];
  const tag = /#(v\d+\.\d+\.\d+)$/.exec(spec ?? '')?.[1];
  if (!tag) throw new Error(`${DEPENDENCY} must be pinned to a vX.Y.Z tag in package.json devDependencies: ${spec}`);
  return tag;
}
