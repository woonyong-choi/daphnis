# 표현 범위와 검증 범위

| 항목 | 값 |
|---|---|
| 상태 | 결정 |
| 관련 결정 | [그림 문법과 배치](../decisions/2026-10-01-own-syntax-and-layout.md) |

## 요약

Daphnis는 `daphnis 2` 원본 하나로 구조, 순서, 상태, 스키마, API, 클래스, 칸 격자, 추적, 값에 묶인 차트와 열여섯 차트 종류를 한 모형으로 그린다. 개발자가 만드는 모든 시각물을 지원하지는 않는다. 이 문서는 지원하는 표현을 문법, 예제, 확인 근거와 이어 주고, 전용 문법이 없거나 일부러 제외한 표현을 구분한다. 문법 전체의 항목 목록은 [그림 문법](figure-syntax.md)의 생성 표가 정본이다. 이 문서의 표는 "예제가 이 기능을 적었다"와 "확인한 시험이 있다"를 말할 뿐 모든 조합이 맞다고 주장하지 않는다.

## 동기

문법을 읽는 시험만으로는 글자 잘림, 조작 오류, 본문에 넣었을 때의 크기와 테마 연결을 판단할 수 없고, 예제 수만으로는 기능이 빠졌는지 알 수 없다. 기능마다 어느 예제가 쓰는지, 무엇을 확인했는지, 무엇을 확인하지 않았는지를 한 곳에서 대조할 수 있어야 한다.

## 예시

### 기능이 예제에 있는지 찾기

1. 아래 표에서 기능의 줄을 찾는다.
2. 예제 열의 원본(`examples/*.dap`)을 연다. 갤러리(`npm run catalog`가 `.local/examples/index.html`로 만든다)는 모든 예제의 미리보기, 재생 화면, SVG, 원본을 한 쪽에 모은다.
3. 예제가 그 기능을 줄 번호와 함께 쓰는지는 `scripts/lib/catalog-coverage.mjs`가 원본 낱말을 읽어 알려 주고, `test/demo-v2.test.js`가 표의 기능마다 쓰이는지 확인한다.

### 지원 범위를 넘는 요청

1. 간트 차트나 UML 연관 클래스처럼 전용 문법이 없는 표현을 아래 목록에서 확인한다.
2. 카드와 선으로 일부 의미를 설명할 수 있어도 해당 표준이나 차트를 지원한다고 표시하지 않는다.

## 상세 설계

### 지원하는 표현

모든 예제는 첫 줄이 `daphnis 2`이고, 장면마다 `mode`를 적는다. 첫 장면은 정지(`static`)이고 움직임은 둘째 장면 이후의 `once`와 `loop` 탭에 둔다. 예제 30개는 차트 종류마다 하나(16개), 개발 그림 열세 가지와 통합 하나(14개)다. 같은 표현의 모양만 바꾼 변형 예제는 두지 않는다.

| 표현 | 문법 | 예제 | 확인 |
|---|---|---|---|
| 구성도: 사용자, 외부 시스템, 저장소, 중첩 그룹, 아이콘, 배지, 복제 개수, 타일, 번호 선, 등록한 아이콘 세트, 조용한 선 | `person`, `external`, `store`, `group`, `icons`, `icon=`, `badge=`, `count=`, `shape=tile`, `no=`, `quiet` | `architecture` | 문법과 사용은 `test/demo-v2.test.js`, 배치는 `test/layout.test.js`와 `test/icons.test.js` |
| 흐름: 동시 이동, 흐름 줄, 구간별 시간, 손실, 갈림길, 카드 바꾸기 | `&`, `track`, `legs`, `lost`, `decision`, `show`, `clear`, `light` | `flow`, `architecture` | `test/demo-v2.test.js`, 시간표는 `test/v2-golden.test.js`의 알고리즘 기준선 |
| 값: 증감, 대입, 참조, 읽기, 장면 사이 유지와 재설정 | `value`, `on`, `set=`, `ref=`, `:=`, `keep=` | `flow`, `metric`, `donut`, `stack`, `pointer` | `test/demo-v2.test.js`, `test/v2-golden.test.js` |
| 조건과 대기: 조건, 기다림, 시간 초과, 대체 경로, 의도한 막힘, 원자적 예약 | `when=`, `wait=`, `timeout=`, `else=`, `stuck`, `reserve=` | `flow`, `queue` | `test/demo-v2.test.js`, `test/v2-golden.test.js` |
| 큐: 용량, 채움, 역압, 보관함 | `queue slots= from=` | `queue`, `architecture`, `sequence` | `test/demo-v2.test.js` |
| 장면별 상태 알약 | `status=` | `architecture`, `flow`, `queue` | `test/demo-v2.test.js` |
| 순서 보기: 메시지, 응답, 자기 호출, 메모, 활성 구간, 생성과 소멸, 네 구획(`alt`, `loop`, `par`, `opt`) | `view ... sequence`, `fragment`, `branch`, `note`, `activate`, `create`, `destroy` | `sequence` | `test/demo-v2.test.js`, 구획 계약은 `test/sequence-fragments.test.js`, `test/sequence-life.test.js` |
| 상태: 시작, 끝, 자기 전이, 그룹, 점선 전이 | `state`, `start`, `final`, `group` | `state` | `test/demo-v2.test.js` |
| 스키마: 키, 유일, NULL 허용, 외래 키(같은 테이블의 두 열을 잇는 자기 참조 포함), 삭제 정책, 예시 행 | `table`, `pk`, `unique`, `nullable`, `required`, `fk=`, `ondelete=`, `show` | `schema` | `test/demo-v2.test.js`, 제약 모순은 `test/data-constraints.test.js` |
| API 카드: 메서드와 경로, `https://` 주소, 칸 사이 연결 | `api` | `api`, `integration` | `test/demo-v2.test.js` |
| 클래스: 세 구획, 가시성, 정적, 추상, 여섯 관계, 다중성, 그룹 | `class`, `interface`, `field`, `method`, `relation=`, `from=`, `to=` | `class` | `test/demo-v2.test.js`, 기호는 `test/class.test.js` |
| 칸 격자: 비트 필드, 합친 칸, 생략한 칸, 칸에서 칸으로 가는 선 | `grid`, `item`, `gap` | `memory`, `stack`, `pointer` | `test/demo-v2.test.js`, 크기는 `test/grid-scale.test.js` |
| 추적: 구간, 레인, 실제 시간 축, 밀리초와 마이크로초 | `trace`, `span`, `view ... time`, `unit=` | `trace`, `integration` | `test/demo-v2.test.js`, `test/v2-document.test.js` |
| 여러 보기가 같은 사건을 공유 | 한 문서의 `view` 여럿 | `integration`, `trace`, `metric`, `donut` | `test/v2-document.test.js`, `test/demo-v2.test.js` |
| 차트 열여섯 종류 | `chart id "제목" 종류 {` | 종류마다 `bar`, `stacked`, `percent`, `dumbbell`, `difference`, `line`, `step`, `area`, `scatter`, `histogram`, `box`, `ecdf`, `heatmap`, `donut`, `pie`, `waterfall` | 해석은 `test/demo-v2.test.js`, 그리기는 `test/chart-v2-*.test.js` |
| 계열 N개, 색 수(지금 일곱)를 넘는 구분 | `series` | `percent`(9), `pie`(9), `line`(4), `ecdf`(3) | `test/chart-v2-geometry.test.js`, `test/chart-palette.test.js` |
| 기대값 계열, 신뢰구간, 행 기준선, 공통 기준선 | `role=reference`, `.low`, `.high`, `rule` | `bar`, `line`, `step`, `dumbbell`, `difference` | `test/chart-v2-geometry.test.js` |
| 빠진 값(`-`)과 0의 구분, 모두 0이거나 모두 빠진 차트 | `-`, `missing` | `bar`, `stacked`, `percent`, `line`, `step`, `ecdf` | `test/chart-v2-data.test.js`. 히스토그램, 워터폴, 상자의 빠진 값은 예제가 쓰지 않고 `test/edgecase-final.test.js`가 확인한다([차트](charts.md#종류와-행-줄)). 모두 0과 모두 빠짐이 오류가 아니라는 규칙에 대응하는 시험은 아직 확인되지 않았다 |
| 값에 묶은 차트와 바뀐 표식 강조 | 행의 `계열=값이름` | `donut`, `metric`, `integration` | `test/chart-v2-frames.test.js`, `test/v2-document.test.js` |
| 차트 값을 JSON에서 읽기 | `data "경로" at "/포인터"` | `histogram` | `test/demo-v2.test.js` |
| 장면 재생 방식과 배속 | `mode=static\|once\|loop`, `speed=` | 모든 예제, `flow`(`speed=1.5`) | `test/v2-render.test.js` |

### 예제가 쓰지 않는 문법

문법 표에 있어도 예제가 쓰지 않아 이 문서가 예제로 연결하지 못하는 항목이다. 지원을 부정하는 것이 아니라 예제 근거가 없다는 뜻이다.

| 항목 | 이유 |
|---|---|
| 머리 `aspect`, `width wide` | 그림 비율을 억지로 맞추면 접힌 배치가 오히려 길어지고, 넓은 캔버스는 표시 폭으로 줄어 글자가 12px 아래로 내려간다. 예제가 쓰면 읽기 기준에 어긋난다 |
| 차트 `series ... key=` | JSON 키와 계열 이름을 따로 둘 때만 필요하다. 예제의 JSON은 `histogram`의 `value` 하나뿐이다 |
| `shape=circle`, `shape=rect`, 값 목록 `head=end`, `border=solid` | 기본값이거나 짧은 이름을 담는 작은 원 하나라 예제의 이야기에 필요하지 않았다 |
| `visibility=package`, 색 `red`의 `fill`·`stroke`(`tone=red`는 쓴다) | 다른 값이 같은 규칙을 보인다 |
| 추적 `unit=s` | `ms`와 `us`가 단위 규칙을 보인다 |

### 전용 표현이 없는 범위

다음은 기존 카드와 선으로 일부 의미를 그릴 수 있어도 전용 문법과 검증이 없는 범위다. 전용 지원 여부는 `src/source/grammar.js`의 카드, 보기, 차트 종류 목록을 기준으로 판단한다. 임의의 모든 조합을 시험했다는 뜻으로 목록을 사용하지 않는다. 이 목록은 지금 지원하지 않는다는 표시이고 구현해야 할 수용 기준이 아니다. 지원 범위에 넣으려면 먼저 [승인한 제외와 보류](#승인한-제외와-보류)와 대조해 따로 결정한다.

| 범위 | 현재 한계 |
|---|---|
| UML 객체·패키지·컴포넌트와 전체 메타모델 | 클래스·인터페이스의 멤버 구획과 기본 관계는 지원, 연관 클래스·포트·표준 전체의 계약은 없음 |
| 시퀀스 제어 구획의 전체 의미 | 메시지·생명주기·활성 구간과 `alt`·고정 `loop`·`par`·명시적으로 재생을 선택하는 `opt`는 지원. 조건식 평가·조건부 반복·구획 안 생명주기·`break`·`critical`·`ref`는 미지원 |
| UML 활동·유스케이스·타이밍 | 흐름·상태로 일부 설명 가능, 전용 의미 검증 없음 |
| BPMN·Petri net | 갈림길·큐는 있으나 이벤트·게이트웨이·토큰 의미 규칙 없음. 전체 BPMN은 지원 대상에서 제외했다 |
| 간트·일정·달력·로드맵 | 전용 날짜축·기간·의존 작업 모델 없음. 추적의 `time` 보기는 실제 시간 축 위 구간만 놓는다 |
| 스윔레인·표준 C4 전 계층 | 그룹으로 일부 표현 가능, 전용 레인·C4 규칙 검증 없음 |
| 마인드맵·방사형·자유 네트워크 | 방향성 자동 배치 외의 전용 배치 없음 |
| 차트 확장 | 누적 면적, 이중 축, 작은 다중 차트, 바이올린·밀도 곡선, 로그가 아닌 구간 추정(Sturges 외)은 없다. 원·도넛은 한 계열이다. 흐름 폭을 쓰는 Sankey, 불꽃 그래프, 바이올린은 보류 항목이다 |
| 와이어프레임·임의 웹 UI·폼 | 그림 재생기를 출력하며 앱 UI를 편집·생성하는 도구는 아님 |
| 자유 손그림·벡터 편집·이미지 합성 | 좌표 직접 편집, 브러시, 이미지 레이어 모델 없음 |
| 실시간 데이터·실행 추적 수집 | 작성한 시간표의 재생만 지원. 추적 카드의 시간은 작성한 값이다. 실시간 백엔드는 지원 대상에서 제외했다 |

### 승인한 제외와 보류

둘째 판의 설계 검토에서 정한 제외와 보류다. 제외는 지원한다고 쓰거나 우회 문법을 두지 않는다. 보류는 지원하지 않는다는 결정이 아니라 검증이 끝나지 않았다는 뜻이고, 지금은 지원한다고 쓰지 않는다.

| 표현 | 상태 | 비고 |
|---|---|---|
| Sankey, 불꽃 그래프, 바이올린 | 보류 | 흐름 폭이나 분포 모양을 그리는 모형이 아직 없다. 넣으려면 모형과 화면을 검증한 뒤 따로 결정한다 |
| 3차원, 지도, CAD, 전체 BPMN | 제외 | 좌표계나 표준 전체의 의미 모형을 두지 않는다 |
| CPU 시뮬레이션(그리기 대신 계산), 실시간 백엔드 | 제외 | Daphnis는 작성한 시간표를 재생하며 실행을 계산하거나 수집하지 않는다 |
| 클래스 멤버를 연결점으로 쓰기 | 제외 | `class members are not ports. Connect "order"` 오류. 선은 클래스 카드에 닿는다 |
| API 카드를 실행하기 | 제외 | API 카드는 문서화용이다 |

색 수는 팔레트 개정 1의 일곱이고 고정된 최대가 아니다. 앞 네 색(파랑, 노랑, 빨강, 초록)은 공식 solid 2024 기능 아이콘에서 읽은 값이라 바뀌지 않고, 뒤 색은 후보를 실제 크기의 라이트·다크 화면으로 검수한 뒤 기록한 순서 끝에만 더한다. 개정 2가 생기기 전에는 원본에서 개정을 고르는 문법이 없다.

### Things와의 연결 기준

기준은 [Things 공식 페이지](https://culturedcode.com/things/)와 [기능 페이지](https://culturedcode.com/things/features/)의 실제 렌더링이다. 예전 Refero 화면은 정규화한 측정값과 재구성 예제라 보조 참고일 뿐 기준이 아니다. 중립 면, 흰 카드, 절제된 파랑, 글자 위계를 역할이 같은 요소끼리 비교한다. 재생 조작은 시간 흐름을 장면 탭으로 고르는 구조라 Things의 대응 요소가 없고, 도구 막대 아이콘은 Daphnis의 확장이다([재생](playback.md#도구-막대와-전체-화면)). Daphnis의 데이터 의미색과 글꼴 측정 규칙을 Things의 원본 구현이라고 부르지 않는다.

화면 값은 design-tokens의 `themes/simple2`가 소유한다. Daphnis에서 가져온 JSON이나 생성 CSS·JS를 손으로 고치지 않는다. 그림 글꼴은 측정과 SVG 배포를 위해 포함한 글꼴을 쓰므로, 운영체제 글꼴을 쓰는 Things와 글꼴 파일이 같지는 않다. 다크 테마는 Daphnis의 확장이며 공식 밝은 페이지와 같은 화면이라고 판정하지 않는다. 다크의 보조 참고는 라이트·다크가 함께 있는 2018년 Things 3.7 화면 쌍이고, 현재 네이티브 버전의 다크라는 근거는 아니다. 2017년 사이트 영상 스틸도 같은 이유로 역할 비교용 보조 참고일 뿐 현재 네이티브 버전과 같다는 근거가 아니며, 두 이미지의 색을 현재 네이티브 색으로 읽지 않는다.

화면으로 확인한 범위는 [예제와 검증 범위](#예제와-검증-범위)의 표가 정하고, 그 밖의 폭과 장면, 실제 기기, Firefox는 확인하지 않았다(검증 요구사항, 미완료). 가로 넘침 없는 결과와 실제 글자가 읽히는 결과를 구분한다. 복잡한 그래프와 순서 그림은 보통 보기에서 읽을 수 있는 글자 크기를 지키려고 판 안에서 가로로 이동하므로 그림 전체가 한 화면에 들어간다고 적지 않고, 전체 화면은 묶음 전체를 영역에 맞춘 뒤 수동 확대로 읽는다([재생](playback.md#도구-막대와-전체-화면)). 화면 비교는 도형 경계, 텍스트 겹침, 카드 여백, 의미색, 조작의 위치를 확인하며 자동 검사 통과만으로 디자인 승인을 대신하지 않는다.

### 요소별 대응과 소유권

요소 하나를 추가·수정할 때 실제 Things 화면 옆에 놓고 판정한다. 같은 색·모서리 수치나 자동 테스트 통과만으로 일체감을 통과시키지 않는다. 대응 요소의 실제 캡처, 양쪽 크기·획·모서리·글꼴·간격, 주변 문맥, 선택·비선택·재생 상태, 모바일 읽기 결과를 함께 남긴다. 원본에 없는 도표·관계 기호는 확장으로 표시하고 조화 여부를 별도로 판정한다.

기준은 Things 공식 웹 페이지이고, 색의 기준점은 공식 사이트의 solid 2024 기능 아이콘이다. 웹 페이지에 보이는 요소는 computed style을 1280px Chrome에서 확인한다. 공식 2017년 사이트 영상 스틸과 2018년 Things 3.7 화면 쌍은 역할 위계의 보조 참고이고 역할이 같은 요소끼리 비교한다. 사이트 기능 아이콘의 면색은 사이트의 값이지 네이티브 앱 모든 역할의 같은 색이라는 근거가 아니다. 숨긴 접근성 제목은 화면 글자 크기 비교에서 제외한다. 아래의 확장은 Things에 동일한 도형이 있다는 뜻이 아니고, 표의 판정은 같은 모양이라는 증명이 아니라 어느 정본 경로가 맡는지의 대응이다.

| Daphnis 요소 | Things 대응 | 정본 경로·구현 | 판정 |
|---|---|---|---|
| 페이지·조작 글꼴 | 시스템 글꼴 스택 | `font.sans`, `styles/control.css` | 직접 대응. 그림 글꼴과 분리 |
| 그림·코드 글꼴 | 대응 요소 없음 | `font.figure-sans`, `font.figure-mono` | 측정과 SVG 포함을 위한 확장 |
| 큰 제목 | `.fancysection-heading`, 36px·700 | `simple2.heading`, `simple2.heading-weight` | 크기·굵기 대응 |
| 조작 글자 | `.navigation-button`, 15px·600 | `simple2.control`, `weight.semibold` | 역할 대응. 비선택 상태는 보통 굵기 |
| 본문 글자 | `body`, 18px·400 | `simple2.body`, `font.sans`, `styles/document.css` | 문서 본문 크기 대응 |
| 그림 이름·상세·메타 | 대응 요소 없음 | `simple2.label-size`, `size.text.13`, `size.text.11` | 그림 밀도를 위한 확장 |
| 캔버스 면 | `body`의 밝은 회색 면 | `simple2.canvas-fill` | 밝은 모드의 색 대응 |
| 캔버스 카드 | `.productcard`의 18px 모서리 | `simple2.canvas-corner` | 바깥 카드 역할. 모든 내부 도형에 적용하지 않는다 |
| 조작 모서리 | `.navigation-button`의 6px 모서리 | `simple2.control-radius` | 직접 대응 |
| 도형 외곽선 | 대응 요소 없음 | `simple2.surface-edge`, `simple2.node-stroke`, `.fl-node > .fl-stroke` | 공통 경계 규칙으로 확장 |
| 표·클래스 및 병합 격자의 내부 구분선 | 대응 요소 없음 | `simple2.separator`, `border.hair`, `.col-line` | 내부 경계를 한 규칙으로 통합 |
| 관계선·화살촉 | 페이지 이동 표시의 방향성 | `border.edge`, `draw/arrow.js` | 관계 의미를 위한 확장. 채운 삼각형 화살촉과 UML 기호 구분 |
| 생명선·활성 구간·소멸 | 대응 요소 없음 | `border.lifeline`, `draw/sequence-life.js` | 시퀀스 의미를 위한 확장 |
| 시퀀스 제어 구획·대안 제목 | 대응 요소 없음 | `simple2.separator`, `color.card`, `draw/sequence-fragments.js` | 공통 중립 경계·글자 위계를 재사용한 확장 |
| 내부 값 카드 | 대응 요소 없음 | `color.card`, `draw/card.js` | 그림자·테두리 없는 하위 면 |
| 선택·호버·키보드 초점 | 페이지 링크의 조작 상태 | `simple2.selection-fill`, `simple2.hover-fill`, `simple2.focus-width` | 접근성을 포함한 확장 |
| 조작 아이콘 | 영상 재생과 방향 아이콘 | `size.control.icon-stroke`, `icons/controls.js` | 굵기·크기 위계 대응. 도형은 저장소에서 다시 그렸으나 Lucide의 이름과 구성을 따르므로 Lucide와 독립이라고 적지 않고 `NOTICE`가 저작권 고지를 맡는다 |
| 시스템·브랜드 아이콘 | 대응 요소 없음 | `icons/symbols.js`, `icons/brands.json`, 의미색 토큰 | 종류 구분을 위한 확장. 개념 아이콘은 저장소에서 24 격자에 그렸고 브랜드는 Simple Icons 파일이다 |
| 데이터·상태 의미색 | 대응 요소 없음 | `color.tag`, `color.state`, 차트 역할색 | 오류·성공·계열 구분을 위한 확장 |
| 다크 모드 | 웹 기준 페이지에는 없다. 공식 네이티브 앱 화면 이미지 가운데 라이트·다크가 함께 있는 것(2018년 Things 3.7)이 보조 참고다 | `themes/simple2/tokens.dark.json` | 보조 참고만 있는 확장. 2018년 이미지는 현재 네이티브 버전이 아니므로 현재 앱과 같다고 판정하지 않고, 역할이 같은 요소끼리만 견준다 |

스타일 책임은 테마의 값, 배치의 크기, 렌더러의 기하, 공통 CSS의 상태로 나눈다. 도형 종류마다 같은 경계 값을 다시 쓰지 않는다. 클래스 구획도 표의 `col-line`을 사용한다. 원본에 명시한 의미색은 공통 기본값보다 우선한다. 페이지가 시스템 글꼴을 써도 그림 측정과 출력 글꼴은 바꾸지 않는다.

### 지원 범위를 넓힐 때

지원하는 표현의 회귀 검사와 표현 확장의 완료 판정은 별개다. 전용 표현이 없는 범위의 표현은 구현과 검증이 갖춰지기 전까지 지원하지 않는다. 지원하지 않는 문법을 거부하는 테스트는 오류 계약의 근거이며 해당 표현을 지원한다는 근거가 아니다.

새 표현을 지원 범위에 넣기로 따로 결정하면 원본 선언, 의미와 오류 검사, 배치와 렌더링, 정적 출력과 재생, 실제 브라우저 검수를 모두 연결한다. 표준의 일부만 구현하면 지원하는 부분을 명시한다. 임의의 모든 조합이나 모든 개발 분야를 검증했다고 쓰지 않는다.

아래는 지금 요구하는 구현 목록이 아니라 아직 범위에 없는 바람의 예다. 완전한 C4 계층이나 객체 편집처럼 이 표에 없는 바람도 새 수용 기준이 되지 않으며, 필요하면 결정 기록으로 먼저 정한다.

| 아직 범위에 없는 바람 | 넣기로 결정할 때 판정할 사례 |
|---|---|
| 대상의 동일성을 유지하는 구조 변경 | 연결 리스트 삽입·삭제와 트리 회전에서 같은 대상의 이동, 연결 변경, 생성·소멸을 구분 |
| 서로 다른 표현의 동기화 | 한 코드 실행 단계가 호출 스택, 메모리, 요청 흐름에 같은 시점으로 반영 |
| 변경 전후 비교 | 추가·삭제·수정·유지 항목의 대응 관계와 변경 이유를 함께 표시 |
| 상세도 전환 | 전체 구조에서 하위 구조를 열고 같은 대상을 잃지 않고 돌아오기 |
| 설명과 관측의 구분 | 작성한 시뮬레이션과 수집한 실행 기록의 출처·단위·시간·불확실성을 구분 |

### 요구사항

| 요구사항 | 검증 계획 |
|---|---|
| 예제 폴더가 지원하는 표현마다 하나이고 옛 산출물이 없다. 차트 예제는 문법 표의 차트 종류와 하나씩 맞는다. | `test/demo-v2.test.js`의 `examples_folder_holds_exactly_one_demo_per_supported_expression`, `scripts/build-catalog.mjs`의 같은 대조 |
| 모든 예제와 첫 화면 그림이 `daphnis 2`, 정식 색 이름, 장면마다 명시한 `mode`를 쓰고 옛 형태가 한 줄도 없다. | `test/demo-v2.test.js`의 `every_example_and_showcase_source_uses_the_canonical_second_grammar`, `the_examples_use_every_canonical_color_name_and_no_legacy_alias` |
| 표의 기능마다 그 기능을 쓰는 예제가 있고, 빠진 값과 0, 계열 N개, 기대값, 값 묶음, 반대 방향·손실·동시·막힘 이동, 순서 구획 네 가지가 원본과 시간표에서 확인된다. | `test/demo-v2.test.js`의 `chart_demos_cover_...`, `bound_chart_demos_change_frames_...`, `traffic_demos_cover_...`, `structure_demos_cover_...` |
| 모든 예제가 strict로 오류와 경고 없이 만들어지고, 첫 장면은 정지이며, 움직이는 예제는 한 번과 반복 탭을 갖는다. | `test/demo-v2.test.js`의 `every_example_builds_strictly_...`, `the_first_scene_of_every_example_is_static_...` |
| 갤러리 목록이 모든 예제의 재생 화면, SVG, 원본 내려받기, 원본 글을 담고 외부 틀을 쓰지 않는다. | `test/demo-v2.test.js`의 `the_gallery_index_exposes_every_example_and_its_source` |
| 모든 재생 페이지와 갤러리 목록이 폭 390과 960에서 가로로 넘치지 않는다. Chrome이 없으면 실패한다. | `test/demo-v2.test.js`의 `every_player_page_and_the_gallery_index_stay_inside_the_page_width_at_390_and_960` |
| 첫 화면 그림이 영어와 한국어 한 쌍으로 같은 구조이고 첫 그림은 반복 장면이다. | `test/demo-v2.test.js`의 `showcase_pairs_share_one_structure_and_the_hero_loops` |
| 지원하지 않는 전용 표현을 지원한다고 안내하지 않는다. | `test/grammar.test.js`의 `parseFigure_unsupported_dedicated_expressions_report_errors` |

시험은 각 파일이 맡은 계약의 범위만 보인다. `test/demo-v2.test.js`는 원본 낱말과 컴파일 결과, 실제 Chrome의 가로 넘침을 확인한다. 이 표는 시험이 있는 계약을 대응시킬 뿐 전체 품질을 확인했다는 근거가 아니다. 그림 안의 글자 겹침, 의미색, 라이트와 다크의 모양, 재생 중 표시는 자동으로 확인하지 않고 화면으로 본다.

### 예제와 검증 범위

예제 30개와 첫 화면 그림 일곱 쌍은 전부 지금 컴파일러로 strict 빌드한다. 사람이 화면으로 본 범위는 아래와 같고, 그 밖은 검증 요구사항, 미완료다.

| 검증 대상 | 실제 범위와 근거 | 증명하지 않는 것 |
|---|---|---|
| 원본의 둘째 판 문법과 기능 사용 | `test/demo-v2.test.js`: 예제 30개, 첫 화면 그림 열네 원본, 정식 색 이름 여덟 개 | 모든 입력 조합 |
| 컴파일과 시간표 | 같은 시험이 strict 빌드, 경고 없음, 장면 모드, 값에 묶은 차트의 프레임과 바뀐 표식을 확인 | 재생기가 그 시간표를 화면에서 맞게 그리는지 |
| 페이지 가로 넘침 | Chrome, 폭 390과 960, 재생 페이지 30개와 갤러리 목록. 문서 전체 `scrollWidth`만 본다 | 판 안쪽 글자가 읽히는지, 판 안쪽 가로 이동의 편의 |
| HTML 재생기의 자동 렌더 검사 | Chrome에서 예제 30개의 장면 99개를 폭 320·390·430·1440, 라이트·다크로 열고 장면마다 정지·진입·중간·종료 직전 시각을 표본으로 잡았다. 페이지 오류, 페이지 가로 넘침, SVG 글자의 경계 밖, 글 겹침, 도구 글 겹침, 10px 미만 글자를 검사했고 걸린 표본은 없었다 | 표본 사이의 시각, 글이 읽히는지, WebKit, 실제 기기 |
| 전체 화면 | Chrome에서 예제 30개를 폭 네 가지로 열었다. 맞춤이 SVG viewBox의 실제 묶음 크기이고 넘침이 없으며, 들어가기와 나가기에서 선택한 장면, 경과 시각, 프레임이 그대로다. WebKit은 `test/mobile-final-regression.test.js`의 자동 시험으로만 본다 | 전체 화면 1배에서 글자가 읽히는지(수동 확대가 읽기를 맡는다) |
| SVG의 구조와 글 | 예제 30개의 장면 99개마다 멈춘 SVG와 움직이는 SVG가 XML, id, 참조 구조를 지킨다. 멈춘 SVG의 보이는 글을 움직임 줄이기 상태의 HTML과 장면마다 대조해 모두 같았다. 조용한 선의 라벨과 번호, 장면이 없는 차트의 계열 보임은 `test/quiet-label-scene-less.test.js`가 Chrome과 WebKit에서 HTML과 SVG를 견준다([재생](playback.md#움직이는-svg)) | 움직이는 SVG의 재생 중 모든 순간이 HTML과 같다는 것. 위 시험이 보는 시각은 장면마다 여덟 곳이다 |
| 눈으로 본 화면(Chrome) | 폭 390 라이트·다크의 예제 30개 첫 장면 모음 화면, 그 가운데 면적·산점도·원·상자·통합 예제의 실제 크기, 일반 Chrome 390에서 산점도의 정지와 탭 바꾸기를 직접 조작, 폭 1440 라이트의 예제 30개 첫 장면 모음 화면과 흐름 예제의 실제 크기 화면, 순서 예제 다크의 마지막 장면 실제 크기, 데스크톱에서 그래프·차트·API·스키마·순서·추적이 섞인 화면을 직접 조작. 이 화면들에서 도구 막대, 번호 배지, 다크의 의미 아이콘과 일반 아이콘 카드를 함께 보았다 | 폭 320과 430의 눈 검수, 모든 예제의 모든 장면, 재생 중 모든 순간, 모든 아이콘 도형의 모든 크기, 갱신 효과 펄스의 라이트·다크 인지성, WebKit |
| 색각 이상 에뮬레이션 | 차트 여섯 종류를 라이트·다크에서 정상, 적록 색각 이상, 무색각으로 보며 끝 이름, 번호 키, 점 모양을 대조했다. 일곱 계열 산점도는 라이트·다크의 무색각 화면에서 점 열네 개와 번호 키 일곱 개가 모두 그려지는 것을 직접 확인했다. 에뮬레이션이다 | 일곱 계열 산점도의 정상·적록 화면, 색각 이상이 있는 실제 사용자 |
| Things와 역할 비교 | 공식 기능 페이지의 2024 solid 기능 아이콘에서 원색 네 개의 출처를 고정했다. 2017 공식 사이트 영상 스틸과 2018 Things 3.7 라이트·다크 공식 화면은 큰 제목, 작은 구획 제목, 본문, 보조 글자, 흰색·회색·다크 면, 파란 선택, 작은 의미 아이콘, 얇은 구분선을 역할끼리 견주는 보조 참고다 | 현재 네이티브 앱의 픽셀 단위 대조. 그래프, 흐름, 트래픽 표현은 Daphnis의 확장이다 |
| 차트 그리기 | `test/chart-v2-*.test.js`는 정규 입력을 직접 만들어 그리기만 확인한다. 예제의 원본에서 그림까지는 위 눈 확인이다 | 라이트와 다크의 모든 대비 |

Chrome과 WebKit 자동 시험은 브라우저 엔진 안의 에뮬레이션이라 실제 휴대폰이나 기기의 Safari를 시험한 것이 아니다. 접근성 기준 전체를 충족한다고도 적지 않는다.

알려진 결함과 제한은 이 문서의 [승인한 제외와 보류](#승인한-제외와-보류)와 [차트](charts.md)에 있다. 예제의 트래픽은 설명용 시뮬레이션이고, 수치는 모두 기능을 설명하려고 만든 예시 데이터다. 실제 부하나 실행 추적을 수집하는 기능은 없다.

## 미해결 질문

- E1: 명시한 그룹 방향·포함 관계를 유지하면서 큰 중첩 구성도를 좁은 화면에서 읽히게 할 방법. [모바일 배치 기준](layout.md#세로-그룹의-좁은-층-후보)을 따르며, 원본 의미 변경과 보기 전환을 구분한다.
- E2: [전용 표현이 없는 범위](#전용-표현이-없는-범위)의 항목 가운데 지원 범위에 넣을 것이 있는지. 넣는다면 어떤 문법·의미 검사·렌더러·실행 사례로 지원할지. 기존 상자·선으로 그릴 수 있다는 이유로 지원으로 승격하지 않는다.
