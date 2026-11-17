import type { JournalFactType } from '@lfd/contracts/journal-facts';

import {
  byActor,
  countOf,
  name,
  subject,
  subjectLabelOf,
  text,
  type Phrase,
  type PhraseFact,
  type Segment,
} from '../phrase';

/**
 * **Les problèmes du fournil** — le miroir de `production_problem.*` dans
 * `@lfd/contracts` (`documentation/fournil/plan-niveaux-de-suivi.md`, § 3.4,
 * § 3.8). Le sujet est le produit de la ligne ; la phrase dit ce que le
 * rouge a fait des fournées, parce que c'est ce qui touche au facturé.
 */
function product(fact: PhraseFact): Segment {
  return subject(fact, subjectLabelOf(fact) ?? 'un produit');
}

/** Σ des pièces corrigées, lues dans `correctedBatches`. */
function correctedTotal(raw: unknown): number {
  if (!Array.isArray(raw)) {
    return 0;
  }
  return raw.reduce<number>((total, batch: unknown) => {
    const corrected =
      typeof batch === 'object' && batch !== null ? Reflect.get(batch, 'corrected') : undefined;
    return total + (typeof corrected === 'number' ? corrected : 0);
  }, 0);
}

/** « ; 30 pièces corrigées », ou rien quand le compte est nul ou absent. */
function clause(raw: unknown, words: string, singular: string, plural: string): Segment[] {
  const counted = typeof raw === 'number' && raw > 0 ? countOf(raw, singular, plural) : null;
  return counted === null ? [] : [text(' ; '), counted, text(words)];
}

const reported: Phrase = (fact) => {
  const reason = fact.payload['reason'];
  return byActor(
    fact,
    [
      text('a signalé un problème au fournil sur '),
      product(fact),
      text(' : '),
      countOf(fact.payload['produced'], 'pièce sortie', 'pièces sorties') ?? text('un sorti'),
      text(' sur '),
      countOf(fact.payload['expected'], 'attendue', 'attendues') ?? text('le compte'),
      ...(typeof reason === 'string' ? [text(' — '), name(reason)] : []),
      ...clause(
        correctedTotal(fact.payload['correctedBatches']),
        ' corrigées sur les fournées',
        'pièce',
        'pièces',
      ),
      ...clause(fact.payload['uncorrected'], ' restées à corriger', 'pièce', 'pièces'),
      ...clause(fact.payload['declared'], ' ajoutées par une fournée', 'pièce', 'pièces'),
    ],
    [
      'subjectLabel',
      'serviceDay',
      'sku',
      'expected',
      'output',
      'produced',
      'reason',
      'version',
      'correctedBatches',
      'uncorrected',
      'declared',
    ],
  );
};

const resolved: Phrase = (fact) =>
  byActor(
    fact,
    [text('a marqué traité le problème du fournil sur '), product(fact)],
    ['subjectLabel', 'serviceDay', 'sku', 'produced', 'version'],
  );

export const PRODUCTION_PROBLEM_PHRASES = {
  'production_problem.reported': reported,
  'production_problem.resolved': resolved,
} satisfies Partial<Record<JournalFactType, Phrase>>;
