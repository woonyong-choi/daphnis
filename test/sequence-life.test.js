// 근거: docs/design/figure-kinds.md 순서 보기의 참여자 생명주기와 활성 구간(docs/design/figure-syntax.md 순서 보기 전용 문장).
// 순서 보기는 `view id sequence { 참여자 }`이고 선은 그래프 보기에 선언한다. 생명주기 문장(`create`, `destroy`, `dashed`, `activate`)은 장면 안에 쓴다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { toSvg } from '../src/svg.js';
import { errorsOf } from './helpers.js';

const HEAD = 'daphnis 2\nbox client "Client"\nbox worker "Worker"\nclient -> worker\nview g graph {\n  client worker\n}\nview s sequence {\n  client worker\n}\nscene "생명주기" mode=once\n';
// 장면 안 줄로 들여 쓴 본문
const indent = (body) => `${body.split('\n').map((line) => `  ${line}`).join('\n')}\n`;
const LIFE = HEAD + indent(`client -> worker "create" create
activate worker
worker -> worker "work"
activate worker
worker -> client "done" dashed
deactivate worker
deactivate worker
client -> worker "destroy" destroy`);

// 순서 보기(두 번째 판)의 그려진 모형만. 그래프 보기의 같은 카드와 선은 따로 있다.
const SEQUENCE_PANEL = 1;
const sequenceOf = (scene) => ({
  items: scene.items.filter((item) => item.panel === SEQUENCE_PANEL),
  edges: scene.edges.filter((edge) => edge.panel === SEQUENCE_PANEL),
  lifelines: scene.lifelines.filter((line) => line.panel === SEQUENCE_PANEL),
  activations: scene.activations.filter((bar) => bar.panel === SEQUENCE_PANEL),
  destructions: scene.destructions.filter((mark) => mark.panel === SEQUENCE_PANEL),
});

test('buildFigure_sequence_creation_destruction_and_nested_activations_follow_message_rows', async () => {
  const built = await buildFigure(LIFE, { strict: true });
  const { items, edges, lifelines, activations } = sequenceOf(built.scene);
  const worker = items.find((item) => item.id === 'worker');
  const line = lifelines.find((item) => item.id === 'worker');
  const [outer, inner] = activations;
  const creation = edges[0].points.at(-1);

  assert.equal(creation.x, worker.x);
  assert.equal(creation.y, worker.y + worker.h / 2);
  assert.equal(line.y1, worker.y + worker.h + worker.marginBottom);
  assert.equal(line.y2, edges.at(-1).points.at(-1).y);
  assert.ok(inner.x > outer.x && inner.y > outer.y);
  assert.equal(outer.y + outer.h, inner.y + inner.h);
  assert.equal(edges[0].dashed, true);
  const svg = await toSvg(built, { isStatic: true });
  assert.equal((svg.match(/class="fl-activation"/g) ?? []).length, 2);
  assert.match(svg, /class="fl-destruction" data-node="worker"/);
});

test('parseFigure_sequence_rejects_invalid_lifetimes_and_unbalanced_activations', async () => {
  for (const [body, message] of [
    ['client -> worker "early"\nclient -> worker "new" create', /before creation/],
    ['worker -> client "early"\nclient -> worker "new" create', /before creation/],
    ['client -> worker "new" create\nclient -> worker "again" create', /more than once/],
    ['client -> worker "end" destroy\nworker -> client "late"', /after destruction/],
    ['client -> worker "end" destroy\nclient -> worker "late"', /after destruction/],
    ['client -> worker "both" create destroy', /both create and destroy/],
    ['worker -> worker "new" create', /create itself/],
    ['client -> worker "work"\nactivate worker', /close activation/],
    ['client -> worker "work"\ndeactivate worker', /no activation/],
    ['client -> worker "work"\nactivate missing', /unknown participant "missing"/],
    ['activate worker', /follows a message/],
    ['client -> worker "end" destroy\nactivate worker', /not alive/],
    ['client -> worker "work" create create', /written twice/],
  ]) assert.match((await errorsOf(HEAD + indent(body))).join('\n'), message, body);
});

test('buildFigure_sequence_destroy_closes_active_executions_and_creation_can_face_left', async () => {
  const built = await buildFigure(HEAD + indent('worker -> client "new" create\nactivate client\nclient -> worker "work"\nworker -> client "end" destroy'));
  const { items, edges, activations, destructions } = sequenceOf(built.scene);
  const client = items.find((item) => item.id === 'client');
  assert.equal(edges[0].points.at(-1).x, client.x + client.w);
  const bar = activations[0];
  assert.equal(bar.y + bar.h, destructions[0].y);
});
