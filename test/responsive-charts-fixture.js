// 열여섯 종류 차트의 일반 원본(차트 보기 하나). 좁은 배치와 실제 Chrome 시험이 같이 쓴다. 예제 파일에 기대지 않아 예제가 바뀌어도 시험이 그대로다.
const doc = (chart, id) => `daphnis 2\n${chart}\nview main plot {\n  ${id}\n}\n`;

const ROWS = ['  row "웹" a=12 b=7', '  row "API" a=30 b=20', '  row "데이터베이스" a=18 b=25'];

export const CHARTS = {
  bar: doc(['chart c "요청 지연" bar "예시 데이터" {', '  x "지연(ms)"', '  series a "읽기"', '  series b "쓰기"', ...ROWS, '}'].join('\n'), 'c'),
  stacked: doc(['chart c "요청 구성" stacked "예시 데이터" {', '  series a "읽기"', '  series b "쓰기"', ...ROWS, '}'].join('\n'), 'c'),
  percent: doc(['chart c "오류 유형 비율" percent "예시 데이터" {', '  series a "타임아웃"', '  series b "연결 거부"', '  series c "인증 실패"', '  row "주문 API" a=30 b=4 c=9', '  row "결제 API" a=14 b=2 c=22', '}'].join('\n'), 'c'),
  dumbbell: doc(['chart c "배포 전후" dumbbell "예시 데이터" {', '  series a "배포 전"', '  series b "배포 후"', ...ROWS, '}'].join('\n'), 'c'),
  difference: doc(['chart c "전후 차이" difference "예시 데이터" {', '  series a "개선 폭"', '  row "웹" a=12', '  row "API" a=-7', '  row "데이터베이스" a=18', '}'].join('\n'), 'c'),
  box: doc(['chart c "응답 시간 분포" box "예시 데이터" {', '  x "응답 시간(ms)"', '  row "GET /products" min=8 q1=14 median=19 q3=27 max=64', '  row "POST /payments" min=180 q1=260 median=340 q3=520 max=1900', '}'].join('\n'), 'c'),
  pie: doc(['chart c "큐별 대기" pie "예시 데이터" {', '  row "메일" value=13', '  row "리포트" value=8', '  row "이미지" value=21', '}'].join('\n'), 'c'),
  donut: doc(['chart c "큐별 대기" donut "예시 데이터" {', '  row "메일" value=13', '  row "리포트" value=8', '  row "이미지" value=21', '  row "정산" value=0', '}'].join('\n'), 'c'),
  line: doc(['chart c "리전별 지연" line "예시 데이터" {', '  x "시각(시)"', '  y "p95 지연(ms)"', '  series a "서울"', '  series b "도쿄"', '  point x=10 a=118 b=142', '  point x=11 a=126 b=149', '  point x=12 a=171 b=161', '}'].join('\n'), 'c'),
  step: doc(['chart c "요청 한도" step "예시 데이터" {', '  x "시각(시)"', '  series a "한도"', '  point x=10 a=3', '  point x=11 a=6', '  point x=12 a=4', '}'].join('\n'), 'c'),
  area: doc(['chart c "누적 요청" area "예시 데이터" {', '  x "시각(시)"', '  series a "요청"', '  point x=10 a=3', '  point x=11 a=6', '  point x=12 a=4', '}'].join('\n'), 'c'),
  scatter: doc(['chart c "변경 규모와 장애" scatter "예시 데이터" {', '  x "변경 줄 수(줄)"', '  y "장애(건)"', '  series a "결제팀"', '  series b "검색팀"', '  point "결제 전" x=480 y=11 series=a', '  point "결제 후" x=200 y=4 series=a', '  point "검색 전" x=1450 y=14 series=b', '}'].join('\n'), 'c'),
  ecdf: doc(['chart c "응답 시간 누적분포" ecdf "예시 데이터" {', '  x "응답 시간(ms)"', '  y "누적 비율"', '  series a "블루 환경"', '  series b "카나리"', '  series c "롤링 업데이트"', ...[42, 48, 55, 61, 96].map((v) => `  sample ${v} series=a`), ...[51, 58, 79, 133, 260].map((v) => `  sample ${v} series=b`), ...[47, 91, 175, 410].map((v) => `  sample ${v} series=c`), '}'].join('\n'), 'c'),
  histogram: doc(['chart c "구간별 요청 수" histogram "예시 데이터" {', '  x "응답 지연(ms)"', '  y "요청 수(건)"', '  bins 0 1000 10', ...[22, 45, 64, 91, 117, 156, 199, 248, 318, 437, 601, 826].map((v) => `  sample ${v}`), '}'].join('\n'), 'c'),
  heatmap: doc(['chart c "장애 알림 건수" heatmap "예시 데이터" {', ...['월', '화', '수'].flatMap((day, i) => ['00~06시', '06~12시', '12~18시'].map((span, j) => `  cell "${day}" "${span}" ${i * 3 + j + 4}`)), '}'].join('\n'), 'c'),
  waterfall: doc(['chart c "월 비용 증감" waterfall "예시 데이터" {', '  x "누적 비용(만원)"', '  row "지난달 비용" value=4200', '  row "트래픽 증가" value=380', '  total "증설 반영"', '  row "예약 인스턴스" value=-610', '  total "이번 달 비용"', '}'].join('\n'), 'c'),
};
