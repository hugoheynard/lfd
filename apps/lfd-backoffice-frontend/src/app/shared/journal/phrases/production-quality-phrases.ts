import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { count, entries, optional, recordOf } from '../payload-read';
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
  valueIn,
} from '../phrase';
import { QUALITY_VERDICT } from '../values/orders-values';

/**
 * **Le contrôle qualité du superviseur** (plan
 * `documentation/production/plan-controle-qualite.md`, D9) — un verdict rendu,
 * une retenue au retrait posée ou levée.
 *
 * La charge ne porte ni la note ni les photos : elles ne se lisent qu'en
 * `b2b_supervision:write` (D3). La phrase dit donc la cible et le verdict,
 * jamais le motif — il est sur la Supervision.
 */

/** Le verdict par son mot des `values/` ; `warning` se dit « réserve » (§0). */
function verdictOf(raw: unknown): Segment {
  return valueIn(QUALITY_VERDICT, raw, { inSentence: true });
}

/**
 * « la ligne VIE-001 (16 comptés) » ou « la commande ORD-0002 » : la cible par
 * le nom que le fournil lui donne, le libellé du sujet à défaut.
 */
function target(fact: PhraseFact): Segment[] {
  const cited = recordOf(fact.payload['target']);
  const label = subjectLabelOf(fact) ?? fact.subjectId;
  if (cited?.['kind'] === 'order') {
    const order = recordOf(cited['order']);
    return [text('la commande '), subject(fact, optional(order?.['name']) ?? label)];
  }
  const seen = count(cited?.['quantitySeen']);
  return [
    text('la ligne '),
    subject(fact, optional(cited?.['sku']) ?? label),
    ...(seen === null ? [] : [text(` (${String(seen)} au compte)`)]),
  ];
}

const CONSUMED = ['subjectLabel', 'serviceDay', 'target'] as const;

const checked: Phrase = (fact) => {
  const photos = countOf(fact.payload['photoCount'], 'photo', 'photos');
  return byActor(
    fact,
    [
      text('a contrôlé '),
      ...target(fact),
      text(' : '),
      verdictOf(fact.payload['verdict']),
      ...(photos === null || count(fact.payload['photoCount']) === 0 ? [] : [text(', '), photos]),
    ],
    [...CONSUMED, 'verdict', 'photoCount'],
  );
};

/** « ORD-0001, ORD-0002 » — les commandes retenues sous leur référence du moment. */
function heldOrders(fact: PhraseFact): Segment[] {
  const held = entries(fact.payload['heldOrders']).map(
    (order) => optional(order['name']) ?? optional(order['id']) ?? '—',
  );
  if (held.length === 0) {
    return [text(' : aucune commande du plan ne porte ce produit')];
  }
  const counted = countOf(held.length, 'commande retenue', 'commandes retenues');
  return [
    text(' : '),
    ...(counted === null ? [] : [counted]),
    text(' ('),
    name(held.join(', ')),
    text(')'),
  ];
}

const holdRaised: Phrase = (fact) =>
  byActor(
    fact,
    [text('a bloqué au retrait '), ...target(fact), ...heldOrders(fact)],
    [...CONSUMED, 'heldOrders'],
  );

const holdLifted: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a levé le blocage de '),
      ...target(fact),
      text(' — nouveau verdict : '),
      verdictOf(fact.payload['verdict']),
    ],
    [...CONSUMED, 'verdict'],
  );

export const PRODUCTION_QUALITY_PHRASES = {
  'production_quality.checked': checked,
  'production_quality.hold_raised': holdRaised,
  'production_quality.hold_lifted': holdLifted,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
