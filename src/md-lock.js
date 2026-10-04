// md 명령의 출력 폴더 잠금(docs/design/markdown.md 동시 실행). 같은 출력 폴더에 두 프로세스가 동시에 쓰지 못하게 폴더마다 잠금 파일을 배타적으로 만든다.
// 잠금 파일에는 주인 프로세스 번호(pid)를 적는다. 주인이 살아 있지 않으면 낡은 잠금으로 보고 지운 뒤 다시 잡는다.
import { mkdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { realPath } from './md-owner.js';

export const LOCK_NAME = '.daphnis-md.lock';

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
// 잠금 파일의 주인 번호. 읽지 못하거나 아직 번호가 적히지 않았으면 undefined다.
function ownerPid(path) {
  try {
    const pid = Number.parseInt(readFileSync(path, 'utf8'), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : undefined;
  } catch {
    return undefined;
  }
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 그 번호의 프로세스가 없으면 true다(ESRCH). 권한이 없어 신호를 못 보내는 경우(EPERM)는 살아 있는 것으로 본다.
function isGone(pid) {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error.code === 'ESRCH';
  }
}

// cost: time O(1), heap O(1), stack O(1), io 3
// basis: estimate
// 잠금 파일 하나를 잡는다. 잡으면 { path }, 다른 프로세스가 쥐고 있으면 { path, pid, busy: true }, 폴더에 못 만드는 경우(권한 등)는 undefined다(쓰기 단계가 같은 이유로 알린다).
function lockOne(dir) {
  const path = join(dir, LOCK_NAME);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(path, `${process.pid}\n`, { flag: 'wx' });
      return { path };
    } catch (error) {
      if (error.code !== 'EEXIST') return undefined;
      const pid = ownerPid(path);
      if (pid === undefined || !isGone(pid)) return { path, pid, busy: true };
      try {
        unlinkSync(path);
      } catch {
        return { path, pid, busy: true };
      }
    }
  }
  return { path, pid: ownerPid(path), busy: true };
}

// cost: time O(d), heap O(d), stack O(1), io 3d
// vars: d = 출력 폴더 수
// basis: estimate
/**
 * 출력 폴더마다 잠금을 잡는다. 없는 폴더는 만든다(실패하면 그 폴더는 건너뛴다).
 * 하나라도 다른 프로세스가 쥐고 있으면 이미 잡은 것을 풀고 { busy: { path, pid } }를 돌려준다. 모두 잡으면 { release }를 돌려주고, release는 잡은 잠금을 풀며 이 호출이 만든 빈 폴더를 치운다.
 */
export function acquireLocks(dirs) {
  const held = [];
  const made = [];
  const release = () => {
    for (const path of held.splice(0)) {
      try {
        unlinkSync(path);
      } catch {
        // 이미 없으면 풀 것이 없다
      }
    }
    for (const { first, dir } of made.splice(0).reverse()) removeEmpty(dir, first);
  };
  for (const dir of [...new Set(dirs.map(realPath))].sort()) {
    let first;
    try {
      first = mkdirSync(dir, { recursive: true });
    } catch {
      continue;
    }
    if (first) made.push({ first, dir });
    const lock = lockOne(dir);
    if (lock?.busy) {
      release();
      return { busy: lock };
    }
    if (lock) held.push(lock.path);
  }
  return { release };
}

// cost: time O(d), heap O(1), stack O(1), io d
// vars: d = 만든 폴더 깊이
// basis: estimate
// 이 실행이 만든 폴더 중 비어 있는 것을 안쪽부터 치운다. 비어 있지 않으면 거기서 멈춘다.
function removeEmpty(dir, first) {
  for (let path = dir; ; path = dirname(path)) {
    try {
      rmdirSync(path);
    } catch {
      return;
    }
    if (path === first) return;
  }
}
