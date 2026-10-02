import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KINDS, OPTIONS, STATEMENTS, VALUES, VERSION, optionsOf, valueNames } from '../src/source/grammar.js';

const items = () => [
  ...Object.entries(KINDS),
  ...Object.entries(STATEMENTS),
  ...Object.entries(OPTIONS),
  ...Object.entries(VALUES).flatMap(([list, { items: values }]) => Object.entries(values).map(([name, item]) => [`${list}.${name}`, item])),
];

test('grammar_every_entry_has_a_version_not_above_the_current_one', () => {
  for (const [name, item] of items()) assert.ok(Number.isInteger(item.since) && item.since >= 1 && item.since <= VERSION, name);
});

test('grammar_statements_use_known_sections_and_kinds', () => {
  for (const [word, statement] of Object.entries(STATEMENTS)) {
    assert.ok(['version', 'header', 'declare', 'timeline'].includes(statement.section), word);
    assert.ok(statement.kinds.length && statement.kinds.every((kind) => kind in KINDS), word);
  }
});

test('grammar_references_to_value_lists_exist', () => {
  for (const kind of Object.values(KINDS)) assert.ok(!kind.argument || kind.argument in VALUES);
  for (const statement of Object.values(STATEMENTS)) for (const list of statement.positional ?? []) assert.ok(list in VALUES);
  for (const [key, option] of Object.entries(OPTIONS)) assert.ok(!option.values || option.values in VALUES, key);
});

test('grammar_option_scopes_belong_to_a_statement_or_a_declared_scope', () => {
  const scopes = new Set(Object.values(STATEMENTS).flatMap((s) => s.scopes ?? []));
  for (const key of Object.keys(OPTIONS)) {
    const scope = key.split('.')[0];
    assert.ok(scope in STATEMENTS || scopes.has(scope) || scope === 'column', key);
  }
});

test('grammar_flags_have_no_deprecated_alias_because_names_share_their_place', () => {
  for (const [key, option] of Object.entries(OPTIONS)) if (option.type === 'flag') assert.equal(option.deprecated, undefined, key);
});

test('grammar_current_value_names_exclude_retired_and_deprecated_values', () => {
  assert.deepEqual(valueNames('role'), ['main', 'compare']);
  assert.deepEqual(Object.keys(optionsOf('series')), ['role', 'key']);
});
