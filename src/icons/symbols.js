import { PERSON_SYMBOL as PERSON } from './person.js';
// 의미 아이콘 등록부. 개념 이름(`server`, `lb`, `db` 등)의 도형과 역할이 이 표 하나에 있고, 다른 곳에 같은 이름의 도형이나 파일이 없다.
// 24 격자에서 역할색으로 채운 실루엣(symbol-face)과 그 안의 밝은 세부(symbol-cut, symbol-detail), 실루엣 밖으로 나오는 같은 색 획(symbol-line)을 그린다. 브랜드와 사용자 SVG는 원래 글리프를 쓴다.

/** 아이콘의 격자 한 변. 그리는 쪽은 모든 아이콘을 이 격자로 보고, 브랜드와 사용자 SVG는 읽을 때 이 격자에 맞춘다(sanitize.js). 그래서 모든 아이콘이 같은 여백으로 앉는다. */
export const ICON_GRID = 24;

const SERVER = '<rect class="symbol-face" x="4" y="3" width="16" height="18" rx="3"/><path class="symbol-cut" d="M4 9h16M4 15h16"/><path class="symbol-detail" d="M7 6h2v1H7zM7 12h2v1H7zM7 18h2v1H7z"/>'; // tokens-allow: 24 격자 아이콘 실루엣의 기하 좌표
const DATABASE = '<path class="symbol-face" d="M4 6v12c0 4 16 4 16 0V6Z"/><ellipse class="symbol-face" cx="12" cy="6" rx="8" ry="3"/><path class="symbol-cut" d="M4 12c0 4 16 4 16 0M4 17c0 4 16 4 16 0"/>'; // tokens-allow: 24 격자 아이콘 실루엣의 기하 좌표
const CLOUD = '<path class="symbol-face" d="M7 19a5 5 0 0 1-1-10 6 6 0 0 1 11-2 6 6 0 0 1 1 12Z"/>';
const SHIELD = '<path class="symbol-face" d="M12 2 21 6v6c0 5-5 8-9 10-4-2-9-5-9-10V6Z"/>';
const GLOBE = '<circle class="symbol-face" cx="12" cy="12" r="9"/><ellipse class="symbol-cut" cx="12" cy="12" rx="4" ry="9"/><path class="symbol-cut" d="M3 12h18M5 6h14M5 18h14"/>'; // tokens-allow: 24 격자 아이콘 실루엣의 기하 좌표
const LOCK = '<path class="symbol-line" d="M7 10V7a5 5 0 0 1 10 0v3"/><rect class="symbol-face" x="4" y="10" width="16" height="12" rx="3"/><path class="symbol-cut" d="M12 14v4"/>'; // tokens-allow: 24 격자 아이콘 실루엣의 기하 좌표
const MONITOR = '<rect class="symbol-face" x="2" y="3" width="20" height="14" rx="2"/><path class="symbol-line" d="M8 21h8M12 17v4"/>'; // tokens-allow: 24 격자 아이콘 실루엣의 기하 좌표
const QUEUE = '<rect class="symbol-face" x="2" y="5" width="20" height="14" rx="3"/><path class="symbol-cut" d="M8 5v14M15 5v14"/>'; // tokens-allow: 24 격자 아이콘 실루엣의 기하 좌표
const NETWORK = '<rect class="symbol-face" x="8" y="2" width="8" height="6" rx="2"/><path class="symbol-line" d="M12 8v5M5 17v-4h14v4"/><rect class="symbol-solid" x="2" y="17" width="6" height="5" rx="1"/><rect class="symbol-solid" x="16" y="17" width="6" height="5" rx="1"/>'; // tokens-allow: 24 격자 아이콘 실루엣의 기하 좌표
const PACKAGE = '<path class="symbol-face" d="m3 7 9-5 9 5v11l-9 4-9-4Z"/><path class="symbol-cut" d="m3 7 9 5 9-5M12 12v10M7 4l10 5v5"/>';

// 역할(색을 고르는 묶음)별 도형. 역할은 이름이 말하는 제품 의미가 아니라 figure.css의 `fl-symbol-{역할}` 색 묶음이다.
const BY_ROLE = {
  service: {
    server: SERVER,
    container: PACKAGE,
    region: CLOUD,
    vpc: CLOUD + '<path class="symbol-cut" d="m8 13 3 3 5-6"/>',
    cdn: GLOBE,
    dns: GLOBE,
    igw: NETWORK,
    lb: NETWORK,
    apigw: '<path class="symbol-face" d="M4 21V5l8-3 8 3v16Z"/><path class="symbol-cut" d="M8 21V10h8v11"/>',
    desktop: MONITOR,
    mobile: '<rect class="symbol-face" x="6" y="2" width="12" height="20" rx="3"/><path class="symbol-cut" d="M10 5h4M10 19h4"/>', // tokens-allow: 24 격자 아이콘 실루엣의 기하 좌표
    monitoring: MONITOR + '<path class="symbol-cut" d="m5 11 4-4 4 6 5-5"/>',
    scaling: '<rect class="symbol-face" x="2" y="12" width="10" height="10" rx="2"/><path class="symbol-line" d="M8 3h13v13M21 3 10 14"/>', // tokens-allow: 24 격자 아이콘 실루엣의 기하 좌표
    function: '<rect class="symbol-face" x="2" y="2" width="20" height="20" rx="5"/><path class="symbol-cut" d="m9 7-4 5 4 5m6-10 4 5-4 5"/>', // tokens-allow: 24 격자 아이콘 실루엣의 기하 좌표
  },
  data: {
    db: DATABASE,
    block: '<rect class="symbol-face" x="3" y="4" width="18" height="16" rx="3"/><path class="symbol-cut" d="M3 14h18"/><circle class="symbol-detail" cx="17" cy="17" r="1"/>', // tokens-allow: 24 격자 아이콘 실루엣의 기하 좌표
    object: PACKAGE,
    cache: '<path class="symbol-face" d="M14 2 4 14h7l-1 8 10-13h-7Z"/>',
    mq: QUEUE,
    logsearch: '<path class="symbol-face" d="M4 2h10l5 5v14H4Z"/><path class="symbol-cut" d="M14 2v6h5M7 12h8M7 16h5"/>',
  },
  access: {
    vpn: SHIELD + '<path class="symbol-cut" d="m8 12 3 3 5-6"/>',
    ddos: SHIELD + '<path class="symbol-cut" d="m9 9 6 6m0-6-6 6"/>',
    bastion: SHIELD + '<path class="symbol-cut" d="M9 16V9h6v7Z"/>',
    firewall: '<rect class="symbol-face" x="2" y="4" width="20" height="16" rx="2"/><path class="symbol-cut" d="M2 9h20M2 15h20M8 4v5m8 0v6M8 15v5"/>', // tokens-allow: 24 격자 아이콘 실루엣의 기하 좌표
    key: '<path class="symbol-face" d="M14 3a6 6 0 0 0-5 9l-7 7v3h4v-3h3v-3l3-3a6 6 0 1 0 2-10Z"/><circle class="symbol-cut" cx="17" cy="7" r="1"/>',
    subnet: LOCK,
    admin: PERSON + '<path class="symbol-cut" d="m8 17 3 3 5-5"/>',
  },
  person: {
    user: PERSON,
    notify: '<path class="symbol-solid" d="M4 17h16l-2-4V9a6 6 0 0 0-12 0v4Z"/><path class="symbol-line" d="M9 21h6"/>',
  },
};

/** 개념 이름 → { role, body }. 역할은 `service`, `data`, `access`, `person`이다. 색은 figure.css의 역할 토큰이 정한다. */
export const SYMBOLS = Object.freeze(
  Object.fromEntries(Object.entries(BY_ROLE).flatMap(([role, bodies]) => Object.entries(bodies).map(([name, body]) => [name, Object.freeze({ role, body })]))),
);

/**
 * 기술 브랜드의 개념 역할. 브랜드(icons/brands.json의 이름)도 개념 아이콘과 같은 역할 색 묶음(service, data, access)을 쓰므로 같은 개념이 같은 색이다.
 * 브랜드 글리프는 원래 모양 그대로이고 색만 역할을 따른다. 사용자 SVG(`icons` 세트)는 역할이 없다.
 */
export const BRAND_ROLES = Object.freeze({
  ansible: 'service',
  argo: 'service',
  bitbucket: 'service',
  cloudflare: 'service',
  docker: 'service',
  elasticsearch: 'data',
  git: 'service',
  github: 'service',
  githubactions: 'service',
  gitlab: 'service',
  go: 'service',
  grafana: 'service',
  helm: 'service',
  kafka: 'data',
  kubernetes: 'service',
  linux: 'service',
  mariadb: 'data',
  mongodb: 'data',
  mysql: 'data',
  nginx: 'service',
  nodejs: 'service',
  postgresql: 'data',
  prometheus: 'service',
  python: 'service',
  rabbitmq: 'data',
  react: 'service',
  redis: 'data',
  spring: 'service',
  terraform: 'service',
  typescript: 'service',
  ubuntu: 'service',
  vercel: 'service',
});
