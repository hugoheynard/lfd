import { JOURNAL_FACT_TYPES, JOURNAL_FACTS } from '@lfd/contracts/journal-facts';
import { describe, expect, it } from 'vitest';

import { KEY_LABELS } from '../key-labels';
import { renderFact } from '../render-fact';
import { payloadNodes, type SchemaNode } from '../schema-node';

/**
 * **La clôture D4 — rien ne se perd** (plan
 * `documentation/journalisation/plan-phrases-du-journal.md`, lot C).
 *
 * Pour CHAQUE type du catalogue, actifs et retirés, et pour CHAQUE forme de sa
 * charge (la courante et les anciennes, encore en base), une charge d'exemple
 * est tirée du schéma et rendue par le moteur, exactement comme l'écran la
 * rendrait :
 *
 * - toute clé que la phrase ne dit pas doit être rendue au détail sous un
 *   libellé du dictionnaire — une clé sans libellé fait échouer ;
 * - toute clé que la phrase ne dit pas donne au moins une ligne de détail ;
 * - aucune phrase n'est le type brut, ni ne le contient.
 *
 * C'est ce test qui tient l'exigence « rien ne se perd » par construction : un
 * champ ajouté au catalogue sans libellé ni phrase ne passe pas la CI.
 */

/** Une charge d'exemple qui remplit TOUT le schéma — facultatifs compris. */
function sample(node: SchemaNode): unknown {
  switch (node.kind) {
    case 'object':
      return Object.fromEntries(node.fields.map(([key, child]) => [key, sample(child)]));
    case 'maybe':
      return sample(node.inner);
    case 'array':
      return [sample(node.element)];
    case 'record':
      return { exemple: sample(node.value) };
    case 'union':
      return node.options[0] === undefined ? null : sample(node.options[0]);
    case 'enum':
      return node.values[0];
    case 'literal':
      return node.values[0];
    case 'string':
      return sampleString(node.unit ?? node.format);
    case 'number':
      return 2;
    case 'boolean':
      return true;
    case 'other':
      return null;
  }
}

/** Les chaînes à unité ont une forme ; les dates ne sont comparées à aucune horloge. */
function sampleString(unit: string | null): string {
  switch (unit) {
    case 'instant':
    case 'datetime':
      return '2026-09-19T08:00:00.000Z';
    case 'day':
    case 'date':
      return '2026-09-19';
    case 'clockTime':
      return '17:30';
    default:
      return 'Exemple';
  }
}

/** Le sujet d'un type : son préfixe, comme le backend l'écrit le plus souvent. */
function subjectTypeOf(type: string): string {
  return type.slice(0, type.lastIndexOf('.'));
}

interface Case {
  readonly type: string;
  readonly shape: number;
  readonly node: SchemaNode;
}

const CASES: readonly Case[] = JOURNAL_FACT_TYPES.flatMap((type) =>
  payloadNodes(type).map((node, shape) => ({ type, shape, node })),
);

describe('la clôture D4 du moteur de phrases', () => {
  it('parcourt tout le catalogue, formes anciennes et types retirés compris', () => {
    const retired = JOURNAL_FACT_TYPES.filter((type) => JOURNAL_FACTS[type].retired);

    expect(JOURNAL_FACT_TYPES.length).toBeGreaterThan(0);
    expect(retired.length).toBeGreaterThan(0);
    // Plus de cas que de types : les formes anciennes sont bien parcourues.
    expect(CASES.length).toBeGreaterThan(JOURNAL_FACT_TYPES.length);
  });

  it.each(CASES)('$type (forme $shape) : chaque clé est dite ou nommée', ({ type, node }) => {
    const payload = sample(node);
    // L'exemple est valide : sans quoi le test éprouverait le rendu brut.
    expect(node.accepts(payload)).toBe(true);
    const record: Record<string, unknown> =
      typeof payload === 'object' && payload !== null ? { ...payload } : {};

    const fact = renderFact({
      type,
      payload: record,
      subjectType: subjectTypeOf(type),
      subjectId: 'sujet_1',
      actorName: 'Colette Martin',
      actorType: 'staff',
    });

    expect({ type, unlabelled: fact.unlabelled }).toEqual({ type, unlabelled: [] });
    const unsaid = Object.keys(record).filter((key) => !fact.consumed.includes(key));
    expect(fact.detail.length).toBeGreaterThanOrEqual(unsaid.length);
    expect(fact.detail.filter((row) => row.value.trim() === '')).toEqual([]);
    expect(fact.sentence).not.toContain(type);
    expect(fact.sentence.trim()).not.toBe('');
  });

  it('n’a au dictionnaire que des libellés non vides', () => {
    const empty = Object.entries(KEY_LABELS).filter(([, label]) => label.trim() === '');

    expect(empty).toEqual([]);
  });
});
