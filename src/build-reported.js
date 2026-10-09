// 원본 글 하나를 만들고 진단을 알리고 결과 파일을 쓴다. cli의 파일 명령과 md 명령이 같이 쓴다. 진단 출력은 docs/design/figure-check.md 명령 절이다.
import { buildFigure } from './build.js';
import { toJson } from './diagnostics.js';
import { commitWrites, FILE_IO } from './md-write.js';
import { FigureError, makeDiagnostic } from './source/problems.js';
import { selectScene } from './svg.js';

// 진단 종류마다 글 출력의 머리말. 오류는 머리말이 없다.
const SEVERITY_LABEL = { error: '', warning: 'warning: ' };

// cost: time O(m), heap O(m), stack O(1), io m
// vars: m = 메시지 수
// basis: estimate
/** 진단(오류, 경고)을 알린다. 기본은 stderr에 `파일:줄: 메시지`, json이면 진단마다 `toJson`이 정한 한 줄을 stdout에 쓴다. */
export function report(file, diagnostics, json) {
  for (const d of diagnostics) {
    if (json) process.stdout.write(`${JSON.stringify(toJson(file, d))}\n`);
    // 줄 번호가 없는 문제(파일 읽기, 도구 버그)는 줄 0이고, 글로는 `파일: 메시지`로 쓴다.
    else process.stderr.write(`${file}${d.line ? `:${d.line}` : ''}: ${SEVERITY_LABEL[d.severity]}${d.message}\n`);
  }
}

// cost: time O(s), heap O(1), stack O(1), io 1
// vars: s = 장면 수
// basis: estimate
/**
 * `--scene` 값(1부터 센 번호나 장면 이름)을 만든 그림의 장면 번호(0부터)로 바꾼다. render와 md가 같이 쓴다.
 * 값을 주지 않으면 첫 장면이고 장면이 없는 그림은 0이다(정지 그림 하나). 없는 장면이면(장면이 없는 그림에 값을 준 경우도) `파일:줄: --scene: …`을 알리고 undefined다. json이면 code `scene` 진단 한 줄이다.
 * @param options { file, json, line? }. line은 그림이 시작하는 파일 안 줄이다(md 코드 블록). 파일 하나가 그림 하나인 render는 줄이 없다
 */
export function pickScene(result, option, { file, json, line = 0 }) {
  if (option === undefined && !result.timeline.steps.length) return 0;
  try {
    return selectScene(result.timeline.steps, option);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    report(file, [makeDiagnostic({ severity: 'error', line, message: `--scene: ${error.message}` }, { code: 'scene' })], json);
    return undefined;
  }
}

// cost: time O(d), heap O(d), stack O(1)
// vars: d = 진단 수
// basis: estimate
// 글 한 조각의 진단 줄을 파일 안 줄로 옮긴다. 줄 없는 진단(0)은 조각이 시작한 줄이다.
function shifted(diagnostics, lineOffset) {
  if (!lineOffset) return diagnostics;
  return diagnostics.map((d) => ({ ...d, line: d.line + lineOffset }));
}

// cost: time O(build), heap O(out), stack O(1), io m
// vars: build = 원본 하나를 만드는 비용, out = 결과 글자 수, m = 진단 수
// basis: estimate
/**
 * 원본 글을 만들고 진단을 알린다. 파일은 쓰지 않는다. 오류가 있으면 undefined다.
 * @param options { flags, baseDir, lineOffset?, budget? }. budget은 올린 예산 { 이름: 값 }(src/budget.js)이고, flags는 명령 옵션 집합(`strict`, `require-data`, `require-ci`, `json`),
 *   lineOffset은 이 글이 파일 안에서 시작하기 전 줄 수다(md 코드 블록)
 */
export async function buildReported(source, file, { flags, baseDir, lineOffset = 0, budget }) {
  const json = flags.has('json');
  try {
    const result = await buildFigure(source, { baseDir, strict: flags.has('strict'), requireData: flags.has('require-data'), requireCi: flags.has('require-ci'), budget });
    report(file, shifted([...result.warnings].sort((a, b) => a.line - b.line), lineOffset), json);
    return result;
  } catch (error) {
    // 원본 오류가 아닌 실패는 이 도구의 버그다. 스택 대신 한 줄로 알리고 다음 파일로 넘어간다.
    const problems = error instanceof FigureError ? error.problems : [makeDiagnostic({ severity: 'error', line: 0, message: `internal error: ${error.message}. Please report this` }, { code: 'internal' })];
    report(file, shifted(problems, lineOffset), json);
    return undefined;
  }
}

// cost: time O(f·out), heap O(f·out), stack O(1), io 4f
// vars: f = 쓸 파일 수, out = 파일 글자 수
// basis: estimate
/**
 * 파일들을 한 번에 쓰고(md-write.js의 임시 파일과 rename, 실패 때 되돌리기) 성공한 뒤에만 경로를 stdout에 알린다. json이면 경로를 알리지 않는다.
 * 실패하면 스택 대신 `파일: cannot write the file: 코드` 한 줄을 알리고 false다. 이미 바꾼 파일은 옛 상태로 돌아가 있다.
 * @param writes { path, text }[]
 * @param options { json, io? }. io는 FILE_IO와 같은 모양이고 시험이 실패를 주입한다
 */
export function commitReported(writes, { json, io = FILE_IO }) {
  const result = commitWrites(writes, io);
  if (result.error) {
    // 오류 글은 한 줄이어야 한다. 파일 시스템 오류는 코드(EISDIR)만 알리고, 코드가 없으면 첫 줄만 알린다.
    const why = result.error.code ?? String(result.error.message).split('\n')[0];
    report(result.path, [makeDiagnostic({ severity: 'error', line: 0, message: `cannot write the file: ${why}` }, { code: 'io' })], json);
    for (const path of result.unrestored) report(path, [makeDiagnostic({ severity: 'error', line: 0, message: 'could not be restored after a failed write. Restore it from version control' }, { code: 'io' })], json);
    return false;
  }
  if (!json) for (const { path } of writes) process.stdout.write(`${path}\n`);
  return true;
}
