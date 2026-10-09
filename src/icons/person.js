// 사용자 아이콘. 24 격자에서 다른 의미 아이콘과 같은 16px 몸통 폭, 21px 바닥선이다. 머리 아래 끝(10.6)과 몸통 위 끝(12.2)은 1.6 격자 떨어져 있어 작게 줄어도 한 덩어리로 붙지 않는다. 사람 카드(`person`)는 표준 카드 머리에 이 아이콘을 놓고, 따로 그리는 사람 윤곽은 없다.
export const PERSON_SYMBOL = '<circle class="symbol-face" cx="12" cy="7.2" r="3.4"/><path class="symbol-face" d="M4 19.4V16.2A8 4 0 0 1 20 16.2V19.4Q20 21 18.4 21H5.6Q4 21 4 19.4Z"/>'; // tokens-allow: 24 격자 아이콘 기하 좌표
