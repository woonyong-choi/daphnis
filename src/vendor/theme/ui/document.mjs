// 문서 작성 도구가 넘긴 텍스트와 검증된 본문 슬롯을 공통 구조로 조립한다.
import { escape, safeUrl, slot, id, out, trusted } from './html.mjs';
import { Table } from './table.mjs';
import { Kbd, TooltipTrigger, TooltipBubble } from './components.mjs';

export function ContentGroup({ title, body, after }) {
  return out(`<section class="app-support-group">${title ? `<h2>${escape(title)}</h2>` : ''}${slot(body, 'body')}${after ? `<p>${slot(after, 'after')}</p>` : ''}</section>`);
}

export function FeatureSection({ tone = 'canvas', split = false, heading, body, descriptions = [] }) {
  if (!['canvas', 'lightest', 'light', 'medium'].includes(tone)) throw new Error(`Unknown feature tone: ${tone}`);
  return out(`<section class="app-feature app-feature-${tone}${split ? ' is-split' : ''}"><div class="app-shell">${slot(heading, 'heading')}</div><div class="app-feature-workspace"><div class="app-feature-media">${slot(body, 'body')}</div>${descriptions.length ? `<div class="app-feature-description">${descriptions.map(item => `<div><h3>${escape(item.title)}</h3><p>${escape(item.body)}</p></div>`).join('')}</div>` : ''}</div></section>`);
}

export function SyntaxExamples({ items }) {
  return out(`<div class="app-syntax-examples">${items.map(item => `<section class="app-syntax-row"><pre aria-label="${escape(item.title)}">${escape(item.source)}</pre><div>${slot(item.body, 'body')}</div></section>`).join('')}</div>`);
}

export function FeatureList({ items }) {
  const middle = Math.ceil(items.length / 2);
  return out(`<div class="app-feature-list">${[items.slice(0, middle), items.slice(middle)].map(column => `<ul>${column.map(item => `<li><h3>${escape(item.title)}</h3>${slot(item.body, 'body')}</li>`).join('')}</ul>`).join('')}</div>`);
}

export function FeatureDemos({ items, media, mediaFirst = false, after }) {
  const descriptions = `<div>${items.map(item => `<section class="app-feature-demo-description">${item.title ? `<h3>${escape(item.title)}${item.action ? ` ${slot(item.action, 'action')}` : ''}</h3>` : ''}${slot(item.body, 'body')}</section>`).join('')}</div>`;
  const frame = `<div>${slot(media, 'media')}</div>`;
  return out(`<div class="app-feature-demos">${mediaFirst ? frame + descriptions : descriptions + frame}</div>${after ? `<div class="app-feature-demo-description">${slot(after, 'after')}</div>` : ''}`);
}

export function Details({ title, open = false, body }) {
  return out(`${Details.open({ open })}${Details.summaryOpen()}${escape(title)}${Details.summaryClose()}${slot(body, 'body')}${Details.close()}`);
}

Details.open = ({ open = false } = {}) => `<details class="app-details"${open ? ' open' : ''}>`;
Details.close = () => '</details>';
Details.summaryOpen = () => '<summary>';
Details.summaryClose = () => '</summary>';

export const Speech = ({ text }) => out(`<p class="app-speech">${escape(text)}</p>`);
export const Shortcut = ({ label = '', keys }) => out(`<p>${escape(label)} ${keys.map(text => Kbd({ text })).join(' + ')}</p>`);

export function Keyboard({ id: name, image, label, helpLabel, help, languages, groups, defaultLanguage = 'en-us' }) {
  id(name);
  return out(`<section class="app-keyboard" data-keyboard><div class="app-keyboard-selector">${image ? slot(image, 'image') : ''}<label class="app-sr" for="${name}-locale">${escape(label)}</label><select id="${name}-locale" data-keyboard-language>${languages.map(item => `<option value="${escape(item.value)}">${escape(item.label)}</option>`).join('')}</select>${TooltipTrigger({ id: `${name}-help`, label: helpLabel })}${TooltipBubble({ id: `${name}-help`, body: help })}</div>${groups.map(group => `<h3>${escape(group.title)}</h3>${Table({ label: group.title, body: trusted(`<tbody>${group.rows.map(row => `<tr><td>${slot(row.label, 'label')}</td><td><span data-keyboard-keys data-keyboard-map="${escape(JSON.stringify(row.keys))}">${(row.keys[defaultLanguage] ?? []).map(text => Kbd({ text })).join(' ')}</span>${row.note ? slot(row.note, 'note') : ''}</td></tr>`).join('')}</tbody>`) })}`).join('')}</section>`);
}

export function StatusBoard({ id: name, message, history, historyLabel, action, title, items }) {
  id(name);
  return out(`<div class="app-status-weather"><div class="app-status-current"><p class="app-status-message">${escape(message)}</p><div class="app-status-actions"><button type="button" data-status-toggle aria-expanded="false" aria-controls="${name}-history">${escape(historyLabel)}</button>${action ? `<a href="${safeUrl(action.href)}">${escape(action.label)}</a>` : ''}</div></div><div class="app-status-history" id="${name}-history" inert><div><p>${escape(history)}</p></div></div></div><section class="app-arrivals"><h1>${escape(title)}</h1>${items.map(item => `<article><div><h2>${escape(item.title)}</h2><div class="app-arrival-caption">${slot(item.body, 'body')}</div></div><div class="app-arrival-state"><p>${escape(item.status)}</p><small>${escape(item.date)}</small></div></article>`).join('')}</section>`);
}
