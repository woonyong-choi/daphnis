// 유지보수 힌트 검사(check-size, check-cost-comments)의 종료 코드 계약. 항목은 기본에서 실패, `--advisory`에서는 알리기만 하고, 실행 오류는 어느 쪽이든 실패한다.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPTS = ['check-size.mjs', 'check-cost-comments.mjs'];
const folder = mkdtempSync(join(tmpdir(), 'rule-contract-'));
const flagged = join(folder, 'flagged.js');
// 매개변수 넷과 비용 주석 없는 반복 하나가 두 검사에 각각 한 항목씩 걸린다.
writeFileSync(flagged, 'export function many(a, b, c, d) {\n  for (const x of [a, b, c, d]) console.log(x);\n}\n');
after(() => rmSync(folder, { recursive: true, force: true }));

// cost: time O(1), heap O(o), stack O(1), io 1
// vars: o = 출력 길이
// basis: estimate
function run(script, ...args) {
  return spawnSync(process.execPath, [join(ROOT, 'scripts', script), ...args], { encoding: 'utf8' });
}

for (const script of SCRIPTS) {
  describe(script, () => {
    // 근거: 규칙 "항목은 기본에서 실패" 와 "--advisory는 같은 항목을 알리되 실패하지 않는다". 알림이 줄면 힌트가 사라진 것이다
    test('findings_fail_by_default_and_are_only_reported_in_advisory', () => {
      const strict = run(script, flagged);
      const advisory = run(script, '--advisory', flagged);

      assert.equal(strict.status, 1);
      assert.equal(advisory.status, 0);
      assert.equal(advisory.stdout, strict.stdout);
      assert.match(advisory.stdout, /flagged\.js:1: many: /);
      assert.match(advisory.stdout, /total 1\n$/);
    });

    // 근거: 규칙 "실제 실행 오류를 가리지 않는다". 오타 난 경로가 `total 0`으로 통과하면 안 된다
    test('execution_errors_fail_even_in_advisory', () => {
      const missing = run(script, '--advisory', join(folder, 'missing'));
      const unknown = run(script, '--advisory', '--nope', flagged);
      const none = run(script, '--advisory');

      for (const result of [missing, unknown, none]) {
        assert.equal(result.status, 2);
        assert.doesNotMatch(result.stdout, /^total /m);
      }
      assert.match(missing.stderr, /no such file or directory/);
    });
  });
}
