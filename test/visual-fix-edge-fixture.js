// 값이 모두 0이거나 모두 빠진 차트 원본. 종류마다 하나씩이고, 같은 원본 모양에서 값만 다르다. 빠진 값(`-`)을 받는 종류는 bar, stacked, percent, line, step, ecdf뿐이다.
const doc = (chart) => `daphnis 2\n${chart}\nview main plot {\n  c\n}\n`;
const chart = (type, ...lines) => doc([`chart c "차트" ${type} "예시 데이터" {`, ...lines, '}'].join('\n'));

/** 모든 값이 0인 원본 */
export const ALL_ZERO = {
  bar: chart('bar', '  series a "읽기"', '  series b "쓰기"', '  row "웹" a=0 b=0', '  row "API" a=0 b=0'),
  stacked: chart('stacked', '  series a "읽기"', '  series b "쓰기"', '  row "월" a=0 b=0', '  row "화" a=0 b=0'),
  percent: chart('percent', '  series a "성공"', '  series b "실패"', '  row "월" a=0 b=0', '  row "화" a=0 b=0'),
  dumbbell: chart('dumbbell', '  series a "전"', '  series b "후"', '  row "웹" a=0 b=0', '  row "API" a=0 b=0'),
  difference: chart('difference', '  series a "차이"', '  row "웹" a=0', '  row "API" a=0'),
  box: chart('box', '  row "A" min=0 q1=0 median=0 q3=0 max=0', '  row "B" min=0 q1=0 median=0 q3=0 max=0'),
  pie: chart('pie', '  row "웹" value=0', '  row "API" value=0'),
  donut: chart('donut', '  row "웹" value=0', '  row "API" value=0'),
  line: chart('line', '  series a "A"', '  series b "B"', '  point x=1 a=0 b=0', '  point x=2 a=0 b=0'),
  step: chart('step', '  series a "A"', '  point x=1 a=0', '  point x=2 a=0'),
  area: chart('area', '  series a "A"', '  point x=1 a=0', '  point x=2 a=0'),
  scatter: chart('scatter', '  point "하나" x=0 y=0', '  point "둘" x=0 y=0'),
  ecdf: chart('ecdf', '  series a "가"', '  series b "나"', '  sample 0 series=a', '  sample 0 series=b'),
  histogram: chart('histogram', '  bins 0 10 5', '  sample 0', '  sample 0'),
  heatmap: chart('heatmap', '  cell "월" "오전" 0', '  cell "월" "오후" 0'),
  waterfall: chart('waterfall', '  row "처음" value=0', '  row "증가" value=0', '  total "합계"'),
};

/** 모든 값이 빠진 원본(`-`를 받는 종류만) */
export const ALL_MISSING = {
  bar: chart('bar', '  series a "읽기"', '  series b "쓰기"', '  row "웹" a=- b=-', '  row "API" a=- b=-'),
  stacked: chart('stacked', '  series a "읽기"', '  series b "쓰기"', '  row "월" a=- b=-', '  row "화" a=- b=-'),
  percent: chart('percent', '  series a "성공"', '  series b "실패"', '  row "월" a=- b=-', '  row "화" a=- b=-'),
  line: chart('line', '  series a "A"', '  series b "B"', '  point x=1 a=- b=-', '  point x=2 a=- b=-'),
  step: chart('step', '  series a "A"', '  point x=1 a=-', '  point x=2 a=-'),
  ecdf: chart('ecdf', '  series a "가"', '  series b "나"', '  sample - series=a', '  sample - series=b'),
};
