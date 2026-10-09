// 보기(view)의 기본값, 구성원 규칙, 카드가 어느 보기에든 보이는지를 확인한다. 보기가 정해지면 view.cardIds와 view.groupIds가 채워진다.
import { SEQUENCE_SHAPES } from './grammar.js';
import { unknownName } from './problems.js';

// cost: time O(v·(n + g)), heap O(n + g), stack O(1)
// vars: v = 보기 수, n = 카드 수, g = 그룹 수
// basis: estimate
/**
 * 보기를 정한다. 보기 줄이 없으면 기본 보기를 만들고, 구성원 규칙을 확인하고, 카드마다 보기에 놓였는지 본다.
 * 오류가 있으면 모형을 믿을 수 없어 다음 단계가 건너뛴다.
 */
export function resolveViews(figure, problems) {
  const cards = figure.nodes.filter((c) => !c.isRejected);
  if (!figure.views.length) figure.views = implicitViews(figure, cards);
  // refused는 구성원으로 적었지만 이유가 있어 받지 못한 카드다. 이 카드는 이미 오류가 났으니 "어느 보기에도 없다"를 덧붙이지 않는다.
  const context = { figure, cards, byId: new Map(cards.map((c) => [c.id, c])), groups: new Map(figure.groups.map((g) => [g.id, g])), problems, refused: new Set() };
  const plotOwned = new Set(figure.views.filter((v) => v.strategy === 'plot').flatMap((v) => (v.members ?? []).map((m) => m.id)));
  for (const view of figure.views) {
    if (view.isRejected) continue;
    if (view.strategy === 'graph') resolveGraph(view, context, plotOwned);
    else resolveSingle(view, context);
  }
  for (const card of cards) {
    if (!figure.views.some((v) => v.cardIds?.includes(card.id)) && !context.refused.has(card.id)) problems.error(card.line, `card "${card.id}" is not shown in any view. Add it to a view`);
  }
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 카드 수
// basis: estimate
// 보기 줄이 없을 때의 기본 보기. 카드가 차트 하나뿐이고 선이 없으면 차트 보기 하나, 아니면 모든 카드를 담는 그래프 하나와 추적 카드마다 시간 보기 하나다. 기본 보기의 이름은 이름 공간에 들지 않아 가리킬 수 없다.
function implicitViews(figure, cards) {
  if (!cards.length) return [];
  const views = [];
  if (cards.length === 1 && cards[0].shape === 'chart' && !figure.edges.length) {
    return [{ id: 'main', strategy: 'plot', direction: 'right', label: undefined, members: [{ id: cards[0].id, line: cards[0].line, column: 1 }], isImplicit: true, line: figure.line }];
  }
  views.push({ id: 'main', strategy: 'graph', direction: 'right', label: undefined, members: undefined, isImplicit: true, line: figure.line });
  for (const trace of cards.filter((c) => c.shape === 'trace')) views.push({ id: `time-${trace.id}`, strategy: 'time', direction: 'right', label: undefined, members: [{ id: trace.id, line: trace.line, column: 1 }], isImplicit: true, line: trace.line });
  return views;
}

// cost: time O(m·d + n + g), heap O(n + g), stack O(1)
// vars: m = 구성원 수, d = 그룹 깊이, n = 카드 수, g = 그룹 수
// basis: estimate
// 그래프 보기. 구성원을 적었으면 그 카드와 그룹(안쪽 전부), 적지 않았으면 추적 카드와 차트 보기에 놓인 차트를 뺀 모든 카드다. 그룹 나무는 온전히 담긴다.
function resolveGraph(view, { figure, cards, byId, groups, problems, refused }, plotOwned) {
  const included = new Set();
  const includedGroups = new Set();
  const addGroupTree = (id) => {
    includedGroups.add(id);
    for (const g of figure.groups) if (g.parent === id) addGroupTree(g.id);
    for (const c of cards) if (c.parent === id) included.add(c.id);
  };
  if (view.members === undefined) {
    for (const c of cards.filter((card) => !card.parent)) included.add(c.id);
    for (const g of figure.groups.filter((group) => !group.parent)) addGroupTree(g.id);
    for (const c of cards) if (c.shape === 'trace' || plotOwned.has(c.id)) included.delete(c.id);
    pruneEmptyGroups(view, { figure, included, includedGroups });
  } else {
    for (const m of view.members) memberInGraph(m, { view, byId, groups, problems, included, includedGroups, addGroupTree, figure, refused });
    for (const m of view.members) checkNestedMember(m, { byId, groups, includedGroups, problems });
  }
  view.cardIds = cards.filter((c) => included.has(c.id)).map((c) => c.id);
  view.groupIds = figure.groups.filter((g) => includedGroups.has(g.id)).map((g) => g.id);
}

// 구성원 하나가 카드인지 그룹인지 보고 그래프에 담는다. 추적 카드는 담지 못한다.
function memberInGraph(m, { byId, groups, problems, included, addGroupTree, refused }) {
  if (groups.has(m.id)) addGroupTree(m.id);
  else if (!byId.has(m.id)) problems.error(m.line, unknownName('card', m.id, [...byId.keys(), ...groups.keys()]), { column: m.column });
  else if (byId.get(m.id).shape === 'trace') {
    refused.add(m.id);
    problems.error(m.line, `a trace card cannot be in a graph view. List "${m.id}" in a time view`, { column: m.column });
  } else included.add(m.id);
}

// 카드나 그룹이 어떤 그룹 안에 있으면 그 그룹의 나무가 통째로 담겨야 한다. 바깥 그룹을 적지 않고 안쪽만 적으면 오류다.
function checkNestedMember(m, { byId, groups, includedGroups, problems }) {
  const item = byId.get(m.id) ?? groups.get(m.id);
  if (!item?.parent) return;
  let root = item.parent;
  while (groups.get(root)?.parent) root = groups.get(root).parent;
  if (!includedGroups.has(root)) problems.error(m.line, `list group "${root}" instead of "${m.id}". A group is shown whole`, { column: m.column });
}

// 구성원을 적지 않은 그래프에서 담을 카드가 모두 빠진 그룹은 빼고, 그 그룹을 품은 그룹이 비면 그것도 뺀다.
function pruneEmptyGroups(view, { figure, included, includedGroups }) {
  for (let changed = true; changed; ) {
    changed = false;
    for (const g of figure.groups) {
      if (!includedGroups.has(g.id)) continue;
      const hasChild = figure.groups.some((child) => child.parent === g.id && includedGroups.has(child.id)) || [...included].some((id) => figure.nodes.find((n) => n.id === id)?.parent === g.id);
      if (!hasChild) {
        includedGroups.delete(g.id);
        changed = true;
      }
    }
  }
}

// 카드가 이 보기의 구성원이 될 수 없는 이유. 받을 수 있으면 undefined다.
function refusal(view, card) {
  if (view.strategy === 'sequence' && !SEQUENCE_SHAPES.includes(card.shape)) return `a ${card.shape} card cannot be a sequence participant. Use ${SEQUENCE_SHAPES.join(', ')}`;
  if (view.strategy === 'plot' && card.shape !== 'chart') return `a plot view shows a chart card. "${card.id}" is a ${card.shape}`;
  if (view.strategy === 'time' && card.shape !== 'trace') return `a time view shows a trace card. "${card.id}" is a ${card.shape}`;
  return undefined;
}

// cost: time O(m), heap O(m), stack O(1)
// vars: m = 구성원 수
// basis: estimate
// 순서, 차트, 시간 보기. 구성원은 카드 이름이고 순서 보기는 참여자 모양의 카드만, 차트 보기는 차트 카드 하나, 시간 보기는 추적 카드 하나다.
function resolveSingle(view, { byId, problems, refused }) {
  const members = view.members ?? [];
  view.cardIds = [];
  view.groupIds = [];
  for (const m of members) {
    const card = byId.get(m.id);
    if (!card) {
      problems.error(m.line, unknownName('card', m.id, byId.keys()), { column: m.column });
      continue;
    }
    const reason = refusal(view, card);
    if (reason) {
      refused.add(card.id);
      problems.error(m.line, reason, { column: m.column });
    } else view.cardIds.push(card.id);
  }
  if ((view.strategy === 'plot' || view.strategy === 'time') && members.length !== 1) problems.error(view.line, `a ${view.strategy} view lists exactly one ${view.strategy === 'plot' ? 'chart' : 'trace'} card. Found ${members.length}`);
  if (view.strategy === 'sequence' && !members.length) problems.error(view.line, 'a sequence view lists its participants');
}
