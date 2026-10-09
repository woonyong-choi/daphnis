// 브라우저 재생기 파일(src/player/)을 Node에서 불러 쓰는 도구. 재생기 파일은 한 스크립트로 이어 붙는 일반 스크립트라 export가 없다.
// DOM이 필요 없는 순수 파일(curve.js, sample.js)만 불러 오고, 컴파일러(src/build.js, src/html.js)에 기대지 않는다.
import { readFileSync } from 'node:fs';

// cost: time O(n), heap O(n), stack O(1), io f
// vars: n = 파일 글자 수, f = 파일 수
// basis: estimate
/**
 * 재생기 파일들을 이어 한 함수 몸으로 실행하고 names의 이름을 돌려준다. 같은 영역에서 돌아 객체의 프로토타입이 시험 파일과 같다.
 * 호출마다 새로 실행하므로 파일의 최상위 상태가 호출 사이에 새지 않는다.
 */
export function loadPlayerFiles(files, names) {
  const source = files.map((name) => readFileSync(new URL(`../src/player/${name}.js`, import.meta.url), 'utf8')).join('\n');
  return new Function(`${source}\nreturn { ${names.join(', ')} };`)();
}

// cost: time O(n), heap O(n), stack O(1), io 2
// vars: n = 파일 글자 수
// basis: estimate
/** 표본 추출기(sample.js)와 그것이 쓰는 이동 곡선(curve.js). */
export function loadSampler() {
  return loadPlayerFiles(['curve', 'sample'], ['buildScenes', 'sampleScene', 'clockOf', 'envelope', 'timeAtProgress', 'progressAt']);
}
