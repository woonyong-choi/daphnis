# daphnis

`.dap` 원본 하나를 움직이는 문서 그림 하나(구조, 순서, 상태, 데이터 관계 그림과 차트)로 바꾸는 명령. 마크다운 문서 안의 ` ```dap ` 블록도 그림으로 반영한다(`daphnis md`).

설계 문서는 [docs/README.md](docs/README.md)에 있다.

## 구성

| 경로 | 내용 |
|---|---|
| `src/source/` | 원본 읽기: 낱말 나누기, 문장 해석, 이름과 규칙 확인 |
| `src/measure/` | 글꼴 파일로 글 폭 재기, 도형과 카드 크기, 글꼴 조각 넣기 |
| `src/layout/` | elkjs 배치(구조, 상태, 데이터 관계)와 순서 그림 격자 배치 |
| `src/chart/` | 차트 눈금, 숫자 표기, 차트 종류별 그리기(종류 목록은 `src/source/grammar.js`의 문법 표가 정본이다), 프레임 범위(`extent.js`)와 프레임(`frames.js`), 바뀐 표식의 겹침 효과(`pulse-overlay.js`) |
| `src/draw/` | 도형, 선, 카드 그리기 |
| `src/icons/` | 아이콘. 개념 이름의 면 아이콘과 역할은 등록부(`symbols.js`) 한 곳, 기술 브랜드는 `brands.json`과 `simple-icons/`, 사용자 SVG 정리(`sanitize.js`), 조작부 아이콘(`controls.js`) |
| `src/tone.js`, `src/chart-palette.js` | 정식 색 이름(팔레트 계열 일곱과 회색)과 범주 색 순서 |
| `src/timeline.js`, `src/chip.js`, `src/build.js`, `src/build-scene.js` | 시간표, 글 상자 크기와 밀어 넣기, 장면 잇기와 장면 검사 |
| `src/track-geometry.js`, `src/reflow-timeline.js` | 흐름 경로 기하와 기존 사건 시각을 보존하는 재배치 |
| `src/check.js`, `src/check/` | 그림 검사. 항목 목록(`items.js`)과 항목별 판정 파일 |
| `src/svg.js`, `src/html.js`, `src/html/`, `src/href.js`, `src/cli.js` | 움직이는 SVG, HTML 재생기 문서와 목록, 파일 이름을 링크 주소로 바꾸기, 명령 |
| `src/build-reported.js`, `src/md.js`, `src/md-run.js`, `src/md-owner.js`, `src/md-lock.js`, `src/md-write.js`, `src/md-fold.js`, `src/md-tags.js`, `src/md-blocks.js` | 원본 만들기와 진단 알림, 마크다운 블록 찾기와 이미지 줄 넣기(`md.js`는 파일을 다루지 않음), `md` 명령 실행, 원본 접기 배치(`md-fold.js`), 접기에 필요한 `<details>` 태그 세기와 그 블록 판별(`md-tags.js`, `md-blocks.js`), 만든 SVG의 소유 표시(`daphnis md v2`)와 판정, 출력 폴더 잠금, `md` 파일 쓰기(임시 파일과 rename, 실패 때 되돌리기) |
| `action.yml`, `.github/workflows/` | GitHub Action(composite), CI, `v*` 태그 배포, design-tokens 새 버전 감지(`design-tokens-update.yml`) |
| `src/player/` | 브라우저에서 도는 재생기: 시각의 순수 표본 추출(`sample.js`), 시계와 장면 들어가기(`play.js`), 모습 쓰기(`stage.js`, `effects.js`, `values.js`), 탭(`controls.js`), 전체 화면·확대(`view.js`), 폭에 따른 배치 바꾸기(`responsive.js`), 내려받기(`export.js`), 이동 곡선(`curve.js`) |
| `examples/` | 표현마다 하나인 예제 원본(`icons/`, `data/`는 예제가 읽는 자료). 결과는 `npm run catalog`가 `.local/examples/`에 생성 |
| `scripts/` | 화면 확인 도구(`shoot.mjs`), 예제 갤러리 생성(`build-catalog.mjs`, `catalog.css`, `lib/catalog-page.mjs`, `lib/catalog-coverage.mjs`), 첫 화면 그림 생성(`build-showcase.mjs`), 토큰 생성과 낡음 검사(`build-tokens.mjs`), 팔레트 값 계산(`build-palette.mjs`), design-tokens 새 버전 판정, PR 본문, 이슈와 PR 올리기와 프로젝트 등록(`update-design-tokens.mjs`, `lib/design-tokens-board.mjs`), 하드코딩 검사(`check-tokens.mjs`), 유지보수 힌트(`check-cost-comments.mjs`, `check-size.mjs`, `npm run check:advisory`), 배치 무작위 시험(`fuzz-layout.mjs`), 빌드 시간 기준 검사(`perf-chips.mjs`, 로컬 전용), 문서 표 생성(`build-grammar-doc.mjs`, `build-check-doc.mjs`) |
| `docs/` | 설계 문서, 그림 종류별 레퍼런스(`reference/`), README 그림(`assets/showcase/`) |

## 명령

```sh
npm test
npm run check
npm run check:advisory
```

`npm test`의 브라우저 시험은 Google Chrome과 Playwright의 WebKit을 쓴다. Chrome이 기본 위치에 없으면 `CHROME_PATH`로 알리고, WebKit은 `npx playwright-core install webkit`으로 한 번 설치한다. 브라우저가 없으면 시험은 건너뛰지 않고 실패한다. CI(`ubuntu-latest`, Node 20과 22)는 `playwright-core install --with-deps chrome webkit`으로 브라우저를 설치하고 `CHROME_PATH=/usr/bin/google-chrome`을 쓴다. 브라우저 설치가 시험의 전제이므로 이 단계를 빼지 않는다. 실행 결과와 날짜는 GitHub Actions 기록과 이슈에 있다.

`npm run check`는 정확성 관문이다. 토큰 생성물이 낡았거나 `src/tokens.json`이 design-tokens와 같은 이름을 다시 정의하거나 화면 값을 하드코딩하면 실패한다. 토큰이나 design-tokens 버전을 바꾼 뒤에는 `npm run palette`, `npm run tokens`, `npm run figures` 순서로 생성물을 다시 만든다.

`npm run check:advisory`는 유지보수 힌트를 알린다. 파일 300줄, 함수 40줄, 매개변수 3개(`check-size.mjs`)와 비용 주석 누락(`check-cost-comments.mjs`)을 찾고 항목이 있어도 0으로 끝난다. 두 검사는 줄 시작 모양을 정규식으로 읽어서 여러 줄 매개변수, 블록 주석 안의 중괄호, 메서드 호출 이름이 같은 재귀 판정 등을 틀리게 읽는다. 설계나 정확성의 증거가 아니므로 항목을 없애려고 일관된 코드를 쪼개거나 근거 없는 점근 표기를 적지 않는다. 실행 오류(없는 경로, 잘못된 옵션)는 이 명령도 2로 실패한다. 알고리즘의 실제 복잡도를 설명하는 비용 주석은 계속 쓴다.

## 규칙

- 디자인 기준은 Things 공식 사이트 [culturedcode.com/things](https://culturedcode.com/things/), [기능 페이지](https://culturedcode.com/things/features/)다. 색의 기준점은 공식 사이트의 solid 2024 기능 아이콘이다. 역할 위계(카드, 판, 선택, 글자 단계)는 공식 2017년 사이트 영상 스틸과 라이트·다크가 함께 있는 2018년 Things 3.7 화면 쌍을 보조로 읽는다. 역할이 같은 요소끼리 비교하고 직접 대응이 없는 그림 요소는 Daphnis의 확장으로 구분한다. 사이트 기능 아이콘의 면색은 사이트의 값이지 네이티브 앱 모든 역할의 같은 색이라는 근거가 아니다. 2017·2018년 이미지는 역할 비교용 보조 참고이고 현재 네이티브 버전이라는 근거가 아니며, 2018년 쌍이 다크의 유일한 보조 참고다. 예전 Refero 화면은 정규화한 측정값과 재구성 예제라 보조 참고일 뿐 기준이 아니다.
- 진행 기록, 감사 영수증(검수 날짜, 배포 식별자, 통과 개수), 이전에 남긴 검증 근거는 GitHub 이슈 요약에 둔다. `docs/`는 현재 계약과 실제로 확인한 증거 표만 적고 시간순 일지를 쌓지 않는다. 화면으로 확인한 범위(예제 30개, 폭, 라이트·다크, 직접 본 화면, 공식 Things 역할 비교)는 [표현 범위](docs/design/expression-coverage.md#예제와-검증-범위)의 표가 정하고, 개수와 날짜는 적지 않는다. 가능한 모든 조합, 모든 네이티브 Things 화면, 실제 iPhone이나 기기의 Safari를 확인했다고 쓰지 않는다. Chrome과 Playwright WebKit의 자동 시험은 실제 기기를 대신하지 않는다. 확인하지 않은 항목은 "검증 요구사항, 미완료"로 표시하고 확인한 범위 밖을 주장하지 않으며, 이미 고쳐진 결함을 미완료로 남기지 않는다. 자동으로 반복하는 장면에 일시정지 조작이 없으므로 접근성 기준을 모두 충족한다고 쓰지 않는다.
- 색: 핵심 넷(파랑 `#1e6bd6`, 노랑 `#f2d024`, 빨강 `#fa1955`, 초록 `#269c6e`)의 값과 순서는 바꾸지 않고, 대비를 맞추려고 핵심 RGB를 바꾸지 않는다. 확장 색은 후보를 실제 크기 라이트·다크 화면으로 검수한 뒤 고르고, 고른 순서는 한 번 기록한 뒤 뒤에만 더한다. 빌드마다 순서를 다시 찾지 않고 고른 값 밖으로 색상·밝기를 자동으로 옮기지 않는다. 색 수를 넘는 계열은 무늬·모양·직접 라벨로 구분하며 색만으로 구분하지 않는다. 대비는 그 요소가 실제로 그려지는 면(카드, 판, 라이트·다크 테마의 면)과 역할(글자, 선, 면)마다 그 면 위에서 잰다. 검은색·흰색 바탕 위의 계산은 보조 확인일 뿐 기준이 아니다. 노랑처럼 면 위 대비가 낮은 그래픽은 색을 바꾸지 않고 라벨, 번호 키, 모양으로 보완하며, 그 낮은 그래픽 대비를 접근성 기준 충족이라고 쓰지 않는다. 범주 번호가 정하는 점 모양, 면적 끝 이름, 산점도 번호 접두와 범례, 원·도넛의 조각 안 번호 키(조각에 들어갈 때만 보이고 아니면 숨는다)가 그 보완이다.
- 디자인 수용은 자동 검사가 아니라 화면 비교로 한다. 모바일 320·390·430px와 데스크톱 실제 크기에서 공식 기준과 나란히 보고, 라이트·다크, 정지·재생 중 상태를 확인한다. 필요한 브라우저가 없으면 건너뛰지 않고 실패로 본다. 테스트 통과만으로 일관성이나 디자인 완료를 선언하지 않고 검수하지 않은 변경은 공개하지 않는다.
- 결함을 덮어쓰기 CSS나 예제별 CSS·좌표 보정으로 숨기지 않는다. 공통 규칙을 고친다.
- 태그를 만들거나 `npm publish`를 하지 않는다. 배포는 `release.yml`이 `v*` 태그에서 한다(`NPM_TOKEN` 등록 뒤 사용자가 태그)
- `package.json`의 `files`는 `src`, 로고 SVG(`docs/assets/daphnis-*.svg`), `LICENSE`, `NOTICE`만. 바꾸면 `test/package.test.js`가 지킨다
- 배포 전에는 README에 npm 설치를 사용 가능으로 쓰지 않는다
- 다음 판은 `daphnis` 2로 올리는 단절 변경이다. 원본의 첫 비주석 의미 줄은 `daphnis 2`여야 하고, 판 1이거나 판 줄이 없으면 줄 위치와 함께 오류다. 옛 이름(`mutoscope` 명령, `.muto`, ` ```muto `, 옛 소유 표시)을 읽거나 옮기거나 안내하는 어댑터, 별칭, 폐기 안내 경로를 두지 않는다. 읽는 확장자는 `.dap`뿐이고 다른 확장자는 일반 오류다. `md`는 `daphnis md v2` 표시와 `<!-- dap -->` 이미지 줄만 이 도구의 것으로 보고, 그 밖의 표시가 붙은 파일과 줄은 사용자 것으로 두어 가져가지도 덮어쓰지도 지우지도 않는다. 호환을 위해 기존 출력과 옵션을 그대로 두는 제약은 없다
- 렌더러나 그림 CSS를 바꾼 뒤에는 `npm run figures`가 끝난 다음 `npm test`를 실행한다. 생성 그림을 검사하는 테스트와 그림 재생성을 병렬로 돌리지 않는다.
- 커밋 전 `npm test`와 `npm run check` 통과. `npm run check:advisory`는 항목을 읽어 보되 0건을 요구하지 않는다
- 동작, 계약, 설정 변경은 같은 PR에서 설계 문서 갱신
- 문법 표(`figure-syntax.md`)와 검사 표(`figure-check.md`)는 생성물이다. `src/source/grammar.js`나 `src/check/items.js`를 고친 뒤 `npm run grammar`, `npm run checkdoc`으로 다시 만들고 표를 손으로 고치지 않는다.
- 새 문서는 `docs/README.md` 문서 목록 안에서만 추가
- 배치에 넘긴 도형 크기와 연결점은 그리는 도형과 동일
- elkjs 경로 점 수정 금지. 예외는 `docs/design/layout.md` 선 그리기 절의 선 끝 계단 펴기 하나
- 오류가 있으면 결과 파일을 쓰지 않음
- `src/player/`는 시간표를 읽기만 하고 상태를 다시 계산하지 않음
- 화면 값은 토큰만 사용. 공통 토큰(색 역할, 기본 색 단계, 간격, 반지름, 글자 크기)은 `@woonyong-choi/design-tokens`가 정본이고 `src/tokens.json`은 선택한 테마의 그림 전용 토큰을 가져온 사본이다. 공통 정본 소유 저장소는 design-tokens(`themes/simple2`)이고 거기서만 수정한다. 같은 이름을 다시 정의하지 않는다
- design-tokens 버전은 `package.json`의 `devDependencies` 태그로 고정하고, 올릴 때는 `design-tokens-update` 워크플로가 만드는 PR을 쓴다. 손으로 올리면 `npm run palette`, `npm run tokens`, `npm run figures`를 같은 PR에서 돌린다
- 생성 토큰(`tokens.css`, `tokens.js`와 가져온 `src/design-theme/` 사본)은 손으로 고치지 않는다. 값을 바꾸려면 정본을 고쳐 다시 만든다
