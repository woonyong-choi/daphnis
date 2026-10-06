# 문서 스킬 연동

| 항목 | 값 |
|---|---|
| 상태 | 제안 |
| 관련 결정 | [그림 문법과 배치를 직접 맡고 D2 호환을 버린다](../decisions/2026-10-01-own-syntax-and-layout.md) |

## 요약

문서 스킬 연동은 repo-docs-figures 스킬의 그림 도구 표에서 D2와 Vega-Lite 두 행을 이 도구 한 행으로 바꾸는 계약이다. 스킬의 그림 종류, 차트 종류, 색표, 글꼴, 변환 명령, 검사가 이 도구의 무엇에 대응하는지 정한다. 터미널 데모(VHS)는 그대로 둔다.

## 동기

지금 문서 스킬은 구조 그림을 D2로, 실험 차트를 Vega-Lite로 그리고, 두 도구에 같은 색을 넣으려고 변환 스크립트가 각 도구의 설정 형식으로 색표를 따로 넣는다. 글꼴은 보는 쪽에 설치되어 있어야 하고, D2 SVG에는 한글 글꼴이 들어가지 않는다. 도구가 하나면 색표, 글꼴, 여백, 움직임이 한 곳에서 정해지고, 스킬 규칙도 짧아진다.

## 예시

### 구성 요소 그림 변환

1. 기여자가 `docs/assets/architecture.dap`를 고친다.
2. 기여자가 저장소 루트에서 `python3 <스킬 폴더>/scripts/render_figures.py docs/assets/architecture.dap`를 실행한다.
3. 스크립트가 `daphnis render --strict docs/assets/architecture.dap`를 부르고, 같은 폴더에 움직이는 SVG `architecture.svg`가 생긴다.
4. 그림 검사 오류가 있으면 스크립트가 실패하고 결과 파일은 생기지 않는다.

### 실험 차트 변환

1. `03-analyze`가 `results/summary.json`을 쓴다.
2. `results/figures/accuracy.dap`의 `data "../summary.json" at "/accuracy"`가 그 값을 읽는다.
3. 원본에 숫자를 손으로 적지 않는다.

## 상세 설계

### 그림 종류 대응

| 스킬 그림 | 지금 | 이 도구 |
|---|---|---|
| 맥락 그림 | D2 `direction: right`, 그룹 `system` | `flow right`, `person`, `box system`, `external`, `store` |
| 구성 요소 그림 | D2 그룹 `system` 안 구성 요소 | `flow right`, `group system`, 안에 `box`, `store` |
| 순서 그림 | D2 `shape: sequence_diagram` | `sequence` |
| 상태 그림 | D2 `direction: down` | `state down`, `start`, `final` |
| 데이터 그림 | D2 `shape: sql_table` | `data right`, `table`, `fk=` |

| 스킬 도형 규칙 | 이 도구 |
|---|---|
| 사용자: `shape: person` | `person` |
| 이 시스템: 이름이 `system`인 그룹 | 맥락 그림은 `box system`, 구성 요소 그림은 `group system` |
| 구성 요소, 모듈: 기본 사각형 | `box` |
| 외부 프로그램, 외부 서비스: `style.stroke-dash: 4` | `external` |
| 파일, 데이터베이스: `shape: cylinder` | `store` |
| 테이블: `shape: sql_table` | `table` |

- 스킬의 "한 쌍에 선 하나, 방향은 요청이 가는 쪽" 규칙은 [그림 문법](figure-syntax.md)이 오류로 지킨다. 스킬 문장에서 뺀다.
- 스킬의 식별자 규칙(영어 소문자 kebab-case)은 그림 문법의 이름 규칙과 같다. 테이블 이름은 `_`를 쓰고, 열 이름은 대문자도 쓴다([그림 종류](figure-kinds.md)).
- 스킬의 순서 그림 규칙(참여자는 처음 메시지를 보내는 순서)은 도구가 경고로 알린다([그림 종류](figure-kinds.md)).
- Markdown 표는 이 도구의 대상이 아니다. 글로 된 표는 계속 Markdown 표로 쓴다.

### 차트 종류 대응

| 스킬 Vega-Lite 차트 | 이 도구 |
|---|---|
| `bar`와 `errorbar`, 기준선 `rule` | `chart bar`, `계열.low`, `계열.high`, `rule` |
| 덤벨 | `chart dumbbell` |
| 상자 그림 | `chart box` |
| 산점도 | `chart scatter` |
| 히트맵 | `chart heatmap` |
| 선 | `chart line` |

- 스킬의 "값은 `03-analyze`가 넣고 손 기재 금지" 규칙은 `data` 줄로 지킨다.
- 스킬의 "막대 축 0에서 시작, y축 둘 금지, 계열 둘까지" 규칙은 [차트](charts.md)가 지킨다. 막대는 `scale log`가 오류라 늘 0에서 시작하고, 값 축은 하나뿐이며, 계열이 셋이면 오류다.

### 색 역할

공통 색과 그림 전용 색의 정본은 [design-tokens](https://github.com/woonyong-choi/design-tokens)의 simple2다. 기본 단계와 역할 토큰을 구분하며 코드와 CSS는 역할 토큰만 사용한다. daphnis는 해시가 있는 완성본과 그림 전용 호환 사본을 가져온다. 같은 토큰을 소비자에서 다시 정의하지 않는다.

기준은 클래식 macOS Things 3의 앱 화면이다. 웹사이트의 홍보 배지와 큰 제목, 다른 세대의 iOS 화면을 조작부에 섞지 않는다. [공식 라이트·다크 비교](https://culturedcode.com/things/blog/2018/09/night-and-day/)에서 관찰한 면의 위계를 사용하며, 색상은 이미지 관찰값과 대비 검사를 바탕으로 구성한 simple2 값이다. Things의 소스 코드에서 추출한 상수라는 뜻은 아니다. 아래 값은 simple2에서 가져오며 글자 4.5, 그래픽 3 기준을 실제 사용 면에서 검사한다.

| 역할 | 뜻 | 라이트 | 다크 | 기준 |
|---|---|---|---|---|
| `state.active` | 활성 선·점·도형 테두리 | `#1e66d8` | `#6ca4ff` | 3 이상 |
| `state.active-fill` | 선택한 면 | `#1760d2` | `#6ca4ff` | on-active 글자 4.5 이상 |
| `state.active-text` | 활성 글자 | `#1760d2` | `#6fa6ff` | 4.5 이상 |
| `ui.link` | 링크 | `#1760d2` | `#6fa6ff` | 4.5 이상 |
| `ui.focus` | 키보드 초점 | `#1e66d8` | `#6ca4ff` | 3 이상 |
| `ui.progress` | 재생 진행선 | `#1e66d8` | `#6ca4ff` | 3 이상 |
| `figure.icon` | 도형 아이콘 | `#1e66d8` | `#6ca4ff` | 3 이상 |
| `data.main` | 주 계열 | `#1e66d8` | `#6ca4ff` | 3 이상 |
| `data.compare` | 비교 계열 | `#e45100` | `#fa7a49` | 3 이상 |
| `fg` | 본문과 그림 글자 | `#303336` | `#f0f0f0` | 4.5 이상 |
| `muted` | 보조 글자 | `#566170` | `#a9adb6` | 4.5 이상 |
| `simple2.canvas-fill` | 설명용 그림 판 | `#f5f6f8` | `#26272b` | 글자 대비 기준 적용 |
| `node` | 도형 면 | `#ffffff` | `#303136` | 글자 대비 기준 적용 |
| `page` | 문서 바탕 | `#ffffff` | `#1d1e22` | 글자 대비 기준 적용 |
| `group-title` | 그룹 제목 | `#566170` | `#a9adb6` | 4.5 이상 |
| `outline` | 도형 외곽선 | `#818181` | `#868686` | 3 이상 |
| `plate-border` | 판과 조작부 구분선 | `#d4d8de` | `#50535b` | 1.3 이상 |
| `card` | 카드 기본 면 | `#f2f3f5` | `#36373b` | 글자 대비 기준 적용 |
| `card-on` | 카드 활성 면 | `#edf4ff` | `#08152d` | 글자 대비 기준 적용 |

- `flow.*`는 점이 한눈에 갈리도록 이름끼리 OKLab 거리 0.10 이상이고 적록 색각 이상(protanopia, deuteranopia) 시뮬레이션에서도 같다. 파랑(지금)과 주황(비교)과도 OKLab 거리 0.10 이상이다. `test/contrast.test.js`의 `flow_tone_colors_stay_apart_from_each_other_for_normal_protan_and_deutan_sight_and_from_blue_and_orange_for_normal_sight`가 잰다. 이름은 카드 태그 `tone`과 같은 집합이고 이름을 늘리면 `flow.*` 색도 같은 기준으로 더한다.
- 표 열의 PK, FK 표시는 항상 있는 스키마 표시라 파랑이 아니라 `color.muted`다.
- 칸 격자의 칸([칸 격자](grid.md))은 새 색 역할이 없다. 칸 면 `node`와 윤곽 `border`, 글 `fg`, 생략 칸 면 `surface`와 글 `muted`, 밝힌 칸 면 `card-on`과 윤곽 `state.active`가 위 기준의 기존 짝이다.
- 파랑은 "지금"(`state`)과 "주장하는 계열"(`data.main`)을 뜻하고, 조작부(`ui`)도 같은 파랑을 쓴다. 그 밖의 뜻으로는 쓰지 않는다. 사용자 아이콘의 기본 색 `figure.icon`은 브랜드 파랑이다(색상각 차이 1도 이내, `test/contrast.test.js`의 `palette_figure_icon_is_the_brand_blue_of_the_active_blue_in_both_themes`). 의미 아이콘은 서비스·데이터·접근·사용자·브랜드 역할별 면과 윤곽을 갖는다. 지금은 색만이 아니라 켜진 도형과 그룹의 재생 강조가 알리고 아이콘은 그대로다. 카드 태그는 파랑과 주황을 쓰지 않는다. 태그 색상이 `state.active`, `data.compare`와 40도 이상 떨어진다는 것을 `test/contrast.test.js`의 `tagColors_keep_their_hue_away_from_the_active_blue_and_the_compare_orange`가 잰다.
- `data.main`, `data.compare`는 선언 순서가 아니라 계열의 `role`이 정한다([차트](charts.md)). 같은 계열 이름은 모든 예제에서 같은 역할이다. `test/chart.test.js`의 `examples_same_series_label_and_id_have_the_same_role_in_every_source`가 잰다.
- 색 사용은 simple2의 역할 색을 따른다. 파랑은 재생·현재 상태·주 계열, 주황은 비교·주의, 빨강은 오류, 초록은 정상이다. 구성도 의미 아이콘은 별도 service·data·access·person 역할을 사용한다. 흐름은 `tone=brand`, `purple`, `green`, `gray`, `red`로 고른다. 옛 `blue`는 `brand`, `teal`과 `orange`는 `purple`로 읽는 폐기 별칭이다.
- 비교와 주의의 주황은 의미 아이콘의 금색과 구분한다. 파랑과 주황은 적록 색각 이상 시뮬레이션에서도 OKLab 거리 0.1 이상이다. 흐름 점과 글 상자의 보라 단계도 다른 흐름색과 구분되는 값으로 정한다.
- 설명 판은 `simple2.canvas-fill`, 도형 면은 `color.node`, 조작 줄은 `color.page`를 쓴다. 중첩 그룹은 `group-1`부터 `group-3`까지 중립색 면의 밝기로 구분한다. `fill=sky`와 `fill=purple` 그룹은 같은 깊이의 틴트 면을 쓴다. 이름과 면으로 경계가 식별되는 도형에는 `simple2.surface-edge` 장식선을 쓰고, 의미를 전달하는 선에는 대비 3 이상의 역할색을 쓴다. 내부 표와 배지는 `simple2.separator` 한 규칙을 공유한다. 박스플롯의 중앙값·수염 같은 데이터 선은 `simple2.data-line`으로 구분한다.
- 9px 태그 글자는 범주색으로 쓰면 대비가 1.7~3.4라 읽기 어려워서, 글자는 `color.fg`로 쓰고 범주색은 글자 뒤의 옅은 바탕 띠로만 전한다. 태그 색은 갈래를 나누는 색이고 판정을 뜻하지 않는다. 스킬의 상태 색 금지는 차트 판정에 대한 규칙이라 태그 색과 부딪치지 않는다.


#### 팔레트

팔레트는 색마다 사람이 정한 원색 하나에서 대비 규칙으로 단계를 계산한 값이다. 계산은 design-tokens의 `scripts/palette-theme.mjs simple2`가 하고 원색은 그 저장소의 `color.<색>.anchor`(`blue`, `purple`, `red`, `green`, `orange`) 한 곳이다. 원색은 simple2의 파랑과 기존 범주색(파랑 `#1E66D8`, 보라 `#B28FD1`, 빨강 `#EF0F0F`, 초록 `#09C72C`)과 주황(비교, 주의용) 다섯이다. 다크 원색은 라이트와 같은 색상각에서 밝기를 올린 값이다. 단계는 fill(옅은 면), stroke(그래픽, 면 위 대비 3), ink(글자와 켜진 면, 대비 4.5), dot(흐름 점), outline(외곽선, 대비 3)이고, 파랑은 히트맵 두 끝과 아이콘 단계가 더 있다. 범주 이름 `navy`는 파랑, `pink`는 보라, `teal`은 초록, `amber`는 주황(주의)의 단계를 가리키는 별칭이고, `sky`는 파랑의 선과 글자 단계에 파랑 강조용 옅은 면을 더하며, `gray`(`slate`)는 design-tokens의 회색 단계에 옅은 면을 더한다. 별칭 층의 면과 외곽선도 정본에서 계산하며, 소비자의 `npm run palette`는 계산 결과와 가져온 사본이 같은지 검사한다.

| 색 | 라이트 fill, stroke, ink | 다크 fill, stroke, ink |
|---|---|---|
| `red` | `#ffefed`, `#c70005`, `#c70005` | `#290b08`, `#fc7182`, `#ff7e8c` |
| `amber` | `#fff0ea`, `#e45100`, `#b43e00` | `#280d04`, `#fa7a49`, `#ff8253` |
| `green` | `#eaf8e9`, `#00971d`, `#007715` | `#061b07`, `#58bf5a`, `#58bf5a` |
| `teal` | `#eaf8e9`, `#00971d`, `#007715` | `#061b07`, `#58bf5a`, `#58bf5a` |
| `navy` | `#edf4ff`, `#1e66d8`, `#1760d2` | `#08152d`, `#6ca4ff`, `#6fa6ff` |
| `purple` | `#f7f0ff`, `#9573b3`, `#795895` | `#1c0f27`, `#b693d6`, `#bb98db` |
| `pink` | `#f7f0ff`, `#9573b3`, `#795895` | `#1c0f27`, `#b693d6`, `#bb98db` |
| `gray` | `#e7e7e7`, `#5d5d5d`, `#5d5d5d` | `#121318`, `#aaaaaa`, `#aaaaaa` |
| `sky` | `#e8f1fe`, `#1e66d8`, `#1760d2` | `#08152c`, `#6ca4ff`, `#6fa6ff` |

갈래색은 `flow.*`와 `paint.*.dot`로 구분한다. 파랑은 핵심 상태와 조작에 사용하고 주황은 비교와 주의에 사용한다.

- 이웃한 색(색상 순서 `red`, `amber`, `green`, `teal`, `navy`, `purple`, `pink`)의 `stroke`는 OKLab 거리가 보통 시각에서 `distance.neighbor`(0.06) 이상, 적록 색각 이상(protanopia, deuteranopia) 시뮬레이션에서 `distance.neighbor-cvd`(0.025) 이상이다. 색각 이상에서는 파랑 계열 이웃이 가까워지므로 값이 보통 시각보다 낮다. 그림은 색 하나로 뜻을 전하지 않는다. 이름과 글이 함께 간다. 팔레트 색은 모두 파랑(지금)과 주황(비교)에서도 보통 시각 0.06 이상 떨어진다.
- 갈래색(`flow.*`)끼리와 파랑, 주황은 `distance.flow`(0.10) 이상이다. 위 이웃 기준과 달리 색각 이상에서도 이 값이다.
- 색을 고른 도형은 재생 중에도 색 역할을 유지한다. 도형 외곽선은 1px, 색을 지정한 그룹은 1.5px로 유지하고 후광용 복제 윤곽을 그리지 않는다. 색을 지정하지 않은 도형의 활성 상태는 같은 굵기의 파란 외곽선으로 표시한다. 선택 칸은 `simple2.row-selection` 면과 같은 모서리의 단일 선으로 표시한다. HTML과 SVG에 같은 규칙을 적용한다.

### 색표와 글꼴

- 공통 색과 그림 전용 색의 정본은 모두 design-tokens의 simple2다. daphnis의 `src/tokens.json`은 그림 전용 사본이며 직접 값을 고치지 않는다.
- 모든 그림의 SVG `width`는 같은 표준 캔버스 폭(`size.figure-canvas`, 960)이다. 그림 머리 `width wide`를 쓴 그림만 넓은 폭(`size.figure-canvas-wide`)이고, 문서에서는 본문 폭에 맞춰 줄어든다. GitHub README는 이미지를 원래 크기보다 키우지 않고 본문 폭에 맞춰 줄이므로 모든 그림이 같은 폭으로 보인다. 가운데 정렬은 SVG 파일이 아니라 문서 쪽 몫이다. GitHub README는 `<img>` 하나만 두면 왼쪽에 붙으므로 `<p align="center"><img src="docs/assets/그림.svg" alt="설명"></p>` 형식으로 넣어야 가운데에 선다(Markdown 이미지 문법 `![]()`로는 정렬할 수 없다).
- 글꼴은 이 도구가 Pretendard, JetBrains Mono 파일(수학 기호용 Noto Sans, Noto Sans Math 포함)을 함께 배포하고 그림에 잘라 넣는다. 본문 글자 간격은 `tracking.text`(-0.3px)다([배치](layout.md)). 스킬의 글꼴 설치 줄은 지운다.

### 대비 기준

화면 값은 라이트와 다크 모두 아래 기준을 넘는다. 기준은 `test/contrast.test.js`가 토큰 정본에서 풀어 매번 잰다.

| 쌍 | 기준 | 근거 |
|---|---|---|
| 본문 글자(`fg`), 보조 글자(`muted`)와 모든 면(`bg`, `node`, `surface`, `card-on`, `group-1`, `group-2`, `group-3`, `page`) | 4.5 이상 | WCAG 글자 기준 |
| 강조 글자(`state.active-text`: 링크, 카드 표시 ✓)와 그림 바탕, 노드, 카드 바탕, 문서 바탕 | 4.5 이상 | 같음 |
| 강조 그래픽(`state.active`: 밝힌 선, 점, 테두리, 진행 고리, 초점 고리)과 그림 바탕, 그룹 바탕, 카드 바탕, 노드, 문서 바탕 | 3 이상 | WCAG 그래픽 기준, 예외 없음. 브랜드 파랑 `#1E66D8`이 그대로 넘는다(`color.blue.light-stroke`, 가장 낮은 면 3.87) |
| `state.on-active` 글자와 `state.active-fill` 면 | 4.5 이상 | 같음 |
| `state.on-active` 글자와 갈래색 면(`flow.*`) | 4.5 이상 | 같음. 갈래색 점은 모든 그림 면과 3 이상이다 |
| 카드 태그 글자(`fg`)와 어느 톤 띠 | 4.5 이상 | 같음 |
| 밝히지 않은 행(`ink.dim`, `opacity.dim-ink` 0.9)의 `fg`, `muted` 글자와 `bg` | 4.5 이상 | 같음. 흐린 `muted`는 라이트 4.87, 다크 6.45이다 |
| 도형 외곽선(`outline`, `paint.<색>.outline`)과 판, 그룹 셋, 도형, 카드 바탕, 자기 면 | 3 이상 | 사용자 결정(외곽선 대비 3). `test/outline-contrast.test.js`가 잰다 |
| 그룹 제목(`group-title`)과 회색 그룹 셋, 강조 그룹의 제목(`paint.<색>.ink`)과 틴트 첫 단계 | 4.5 이상 | 같음. 강조 그룹의 테두리는 틴트 세 단계 위에서 3 이상이다 |
| 밝히지 않은 행의 막대와 히트맵 칸 테두리(`data.main`, `data.compare`, `data.heat-high`)와 `bg` | 3 이상 | 면만 흐리면 라이트 1.5 이하라서 흐린 행에서만 보이는 같은 모양의 테두리로 지킨다. `test/dim-contrast.test.js`가 잰다 |
| 히트맵 칸 숫자와 그 칸 색 | 4.5 이상 | 칸마다 어두운 글자와 밝은 글자 중 대비가 큰 쪽을 빌드 때 고르고, 어느 강도에서나 4.5를 넘게 칸 색 범위를 정했다 |
| 경계(`border`)와 그림 바탕, 노드, 그룹, 카드 바탕, 문서 바탕 | 3 이상 | WCAG 그래픽 기준, 예외 없음. 같은 색상에서 3을 넘는 가장 약한 값이다. design-tokens가 정한 `color.gray` 단계(라이트 `gray.106`, 다크 `gray.776`) |
| 켜진 탭 표시(`border` 색 고리)와 탭 묶음 바탕 | 3 이상 | UI 상태 표시도 그래픽 기준이다. 알약 면(`ui.control-on`)은 글자 대비 4.5만 맡는다 |
| 팔레트 `fill` 위 글자(`fg`, `muted`)와 카드 태그 띠 위 `fg` | 4.5 이상 | 같음. 모든 색, 두 테마 |
| 다크 팔레트 `fill`과 그림 바탕(`bg`), 도형 바탕(`node`) | OKLab 거리 0.07, 0.03 이상(`distance.fill-dark`) | 어두운 면이 판에 묻혀 사람 도형이 비어 보이지 않게 한다. 글자 4.5가 밝기를 막아 채도(C 0.06)로 거리를 낸다. 가장 가까운 `gray`가 한계다 |
| 팔레트 `stroke`와 그림 면, 모든 색의 `fill`. `state.error`, `state.success`, `state.warning` | 3 이상 | WCAG 그래픽 기준 |
| 팔레트 `ink`와 그림 면, 모든 색의 `fill`, 이동 글 상자 글자(`state.on-active`) | 4.5 이상 | 같음 |
| 계열 막대와 점(`data.main`, `data.compare`)과 그림 바탕, 노드, 그룹, 카드 바탕 | 3 이상 | 데이터 표시라 그래픽 기준이다. 라이트 주황은 `palette.orange.light-stroke`이다 |
| 차이 차트의 0선, 행 기준 점선, 잘린 축의 지그재그(`muted`)와 그림 바탕 | 4.5 이상 | 값 차이를 전하는 그래픽이라 `muted`가 이미 맞추는 글자 기준을 쓴다. 꾸밈 요소가 아니다 |
| 꾸밈 요소: 격자와 축, 히트맵 값 0 칸, 신뢰구간 띠와 덤벨 범위 막대기 | 1.5 이상 | WCAG 적용 대상 밖이다. 값은 숫자로도 적히고 이 요소는 구조만 돕는다 |
| 꾸밈 요소: 판 테두리(`plate-border`: 문서용 SVG 그림 판)와 문서 바탕(`page`) | 1.3 이상 | WCAG 적용 대상 밖이다. 판 모양만 잡고 판 안 도형은 각자 3을 맞춘다. 실제 값은 대비 시험에서 검사 |

### 변환과 검사

| 스킬 규칙 | 이 도구 |
|---|---|
| 변환은 `render_figures`로만 | `render_figures`가 `.dap` 원본마다 `daphnis render --strict`를 부른다. 경고도 실패다 |
| 실험 차트 값 손 기재 금지, 비율에 신뢰구간 | `docs/experiments/` 아래 차트에 `--require-data --require-ci`를 붙인다([차트](charts.md)) |
| 원본과 만든 그림 함께 커밋 | 그대로 |
| 변환 뒤 그림을 열어 겹침, 잘림, 빈 영역 확인 | 겹침과 잘림은 [그림 검사](figure-check.md)가 대신한다. 빈 영역은 검사 항목이 없어 눈 확인으로 남는다 |
| 다시 변환 뒤 `git diff` 없음 | [배치](layout.md)의 결정성 요구사항이 지킨다 |
| 원본에 색, `config`, `sketch` 없음 | 색 줄과 hex는 문법에 없다. 도형 색은 팔레트 이름 `fill=`, `stroke=`, `card=`만 받아 검사 항목에서 지운다 |

- 결과는 움직이는 SVG `{이름}.svg` 하나다. 무엇이 언제 움직이는지는 [재생](playback.md)을 따른다. HTML 재생기는 문서 저장소에 넣지 않는다. 문서 저장소에 스크립트가 든 파일을 늘리지 않기 위해서다.

### 바꾸는 순서

1. 이 도구가 스킬의 다섯 그림(맥락, 구성 요소, 순서, 상태, 데이터)과 여섯 차트 종류를 구현하고, 모든 예제가 그림 검사를 통과한다.
2. repo-docs-figures 스킬의 도구 표, 색표, D2 절, Vega-Lite 절을 이 도구 기준으로 다시 쓰고, `render_figures`에 `.dap` 변환을 넣는다.
3. 스킬 저장소의 형식 검사가 `total 0`이 된 뒤 skill-sync로 설치한다.
4. 문서 저장소마다 `docs/assets/*.d2`와 `*.vl.json`을 `.dap`로 옮기고 다시 변환한다. 옮긴 뒤 D2와 Vega-Lite 변환 분기를 지운다.

- 1번이 끝나기 전에 스킬을 바꾸지 않는다. 없는 도구를 쓰라고 적는 스킬은 스킬의 정직한 상태 규칙을 어기기 때문이다.

### 요구사항

| 요구사항 | 검증 계획 |
|---|---|
| 스킬의 다섯 그림 템플릿을 새 문법으로 옮긴 원본이 검사를 통과한다. | 템플릿마다 원본을 만들어 `check` 실행 |
| 스킬의 여섯 차트를 `data` 줄로 그린다. | 예시 `summary.json`으로 여섯 원본 변환 |
| 같은 원본을 다시 변환해도 git 차이가 없다. | 두 번 변환 뒤 `git diff` 확인 |

## 단점

- 문서 저장소의 기존 D2, Vega-Lite 원본을 모두 다시 써야 한다.
- 스킬이 이 도구의 배포 방법(npm 패키지나 저장소 경로)에 묶인다.

## 미해결 질문

- 이 도구를 스킬 안 스크립트처럼 스킬 폴더에 넣나, npm 패키지로 배포하나.

### simple2 조작과 글자 위계

HTML 조작부와 그림의 sans는 내장 Pretendard(FigSans)로 통일한다. 목록·문서에는 테마의 가변 글꼴을 넣고, 재생기에는 그림과 조작에 쓰는 글자 조각을 함께 넣어 오프라인에서도 같은 글꼴을 쓴다. 그림은 측정한 FigSans·FigMono를 내장하므로 환경마다 글자 폭이 바뀌어 선과 라벨이 겹치지 않는다. 그림 내부는 배치에 맞춘 9·11·13·15·22px 단계를 유지한다. 목록·문서의 큰 제목은 36px, 절 제목은 27px, 본문은 18px, 조작은 15px, 보조 글자는 13px다. 기본 아이콘은 Lucide의 같은 외곽선 형태를 사용하며 조작 아이콘은 20px이다.

단계 탭과 테마 선택은 최소 44px의 눌리는 영역을 갖는다. 묶음의 패딩을 포함한 52px 높이에 재생·배속 버튼의 누르는 영역을 맞춘다. 선택한 탭은 반지름 6px의 옅은 파란 면과 굵은 파란 글자로 구분하고 hover는 옅은 파랑, pressed는 진한 파란 면, focus-visible은 3px 고리다. 탭의 가운데 축은 배속 글자 길이에 영향받지 않는다. 좁은 화면에서는 탭이 줄바꿈하며 그림 캔버스는 가로로 탐색한다. 페이지 전체에는 가로 스크롤을 만들지 않는다.

카드는 반지름 18px의 흰 표면과 두 겹 그림자(`simple2.shadow`)를 사용한다. 도형은 표면 요소에만 `simple2.node-shadow`를 적용한다. 글자·아이콘·선·이동 점에는 그림자를 넣지 않는다. 재생 버튼은 52px의 누르는 영역 안에 36px 파란 원(`simple2.play-fill`)과 채운 흰 아이콘(`simple2.play-ink`)을 둔다. 다크에서는 밝은 파랑과 어두운 아이콘으로 대비를 유지한다. 나머지 조작은 평평한 면이며 선택한 탭에도 그림자를 넣지 않는다. 목록 폭은 960px, 카드 사이는 48px다.

별도 소개·지원·문서 사이트를 만들지 않는다. 같은 디자인은 daphnis가 원래 생성하는 SVG·HTML 재생기·목록·문서 미리보기에 적용한다. Things의 로고와 제품 화면은 포함하지 않는다.

도형 윤곽은 1px, 활성 윤곽은 기존 2.5px를 유지한다. 도형과 경로는 확대·축소 때 선 굵기가 변하지 않으며 끝과 이음은 둥글다. 진행 고리는 52px 좌표계와 표시 크기를 맞추고 2px 둥근 선을 사용한다. 목록에서는 제목 아래에 원본 이름과 종류를 배치한다. 재생기에서는 현재 장면 번호와 설명을 먼저 읽고 아래 조작부에서 재생하거나 장면을 고른다.

HTML 재생기의 선택 탭은 simple2의 채운 파란 면과 흰 글자를 쓰며 대비 4.5 이상을 유지한다. 현재 이동 선과 점, 지난 경로, 조작 선택 상태를 구분한다. SVG의 자동 반복과 강조 계약은 HTML의 한 번 재생 계약과 별개다.

Things 3 앱 기준의 simple2는 선택 면을 중성 회색으로 둔다. 재생 원형 버튼은 유지하되 버튼 둘레의 진행 링은 쓰지 않는다. 상자·표·격자·큐의 채워진 카드 표면은 `simple2.surface-edge`를 장식 경계로 쓰고, 분기 도형과 명시한 색 경계는 기존 의미 외곽선을 유지한다. 이름 글자는 `simple2.label-size`로 재고 그린다. 차트·코드·이동 글상자의 크기 단계는 그대로 유지해 이름만 키워도 데이터 배치 계약이 바뀌지 않게 한다.
