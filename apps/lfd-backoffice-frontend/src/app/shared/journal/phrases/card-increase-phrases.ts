import type { JournalFactType } from '@lfd/contracts/journal-facts';

import {
  byActor,
  inUnit,
  said,
  subject,
  subjectLabelOf,
  text,
  valueIn,
  type Phrase,
  type PhraseFact,
  type Segment,
} from '../phrase';
import { CARD_INCREASE_ABANDON_CAUSE } from '../values/orders-values';

/**
 * **La hausse d'une commande payée par carte** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.9) — le
 * miroir de `order-card-increases.ts` dans `@lfd/contracts`. Le client
 * demande, le système encaisse, applique ou rend : la demande et l'abandon se
 * disent à la voix active (l'auteur est celui du geste), le reste au passif.
 */

/** « la commande CMD-142 », liée à sa fiche ; « une commande » sans libellé. */
function order(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null ? [text('une commande')] : [text('la commande '), subject(fact, label)];
}

/** « le complément de 12,00 € de la commande CMD-142 ». */
function complementOf(fact: PhraseFact): Segment[] {
  return [
    text('le complément de '),
    inUnit('cents', fact.payload['complementCents']),
    text(' de '),
    ...order(fact),
  ];
}

const BASE = ['subjectLabel', 'complementCents'];

function freeText(raw: unknown): Segment {
  return text(typeof raw === 'string' && raw !== '' ? raw : '—');
}

const proposed: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a demandé une hausse de '),
      ...order(fact),
      text(' à '),
      inUnit('cents', fact.payload['targetTotalCents']),
      text(' : complément de '),
      inUnit('cents', fact.payload['complementCents']),
      text(' à payer avant le '),
      inUnit('instant', fact.payload['expiresAt']),
    ],
    [...BASE, 'targetTotalCents', 'expiresAt'],
  );

const paid: Phrase = (fact) =>
  said(
    [
      text('Le client a payé '),
      ...complementOf(fact),
      text(' : la modification attend d’être appliquée'),
    ],
    BASE,
  );

const applied: Phrase = (fact) =>
  said(
    [
      text('La hausse payée de '),
      ...order(fact),
      text(' est appliquée (complément de '),
      inUnit('cents', fact.payload['complementCents']),
      text(', révision '),
      text(String(fact.payload['revision'] ?? '—')),
      text(')'),
    ],
    [...BASE, 'revision'],
  );

const refused: Phrase = (fact) =>
  said(
    [
      text('La hausse payée de '),
      ...order(fact),
      text(' n’est plus possible ('),
      freeText(fact.payload['refusal']),
      text(') : le complément de '),
      inUnit('cents', fact.payload['complementCents']),
      text(' sera rendu'),
    ],
    [...BASE, 'refusal'],
  );

const abandoned: Phrase = (fact) =>
  said(
    [
      text('La hausse de '),
      ...order(fact),
      text(' est abandonnée avant paiement du complément de '),
      inUnit('cents', fact.payload['complementCents']),
      text(' : '),
      valueIn(CARD_INCREASE_ABANDON_CAUSE, fact.payload['cause'], { inSentence: true }),
    ],
    [...BASE, 'cause'],
  );

const stalled: Phrase = (fact) =>
  said(
    [
      text('La hausse payée de '),
      ...order(fact),
      text(' n’a pas pu être appliquée après '),
      text(String(fact.payload['attempts'] ?? '—')),
      text(' essais ('),
      freeText(fact.payload['failure']),
      text(') : elle attend « Relancer »'),
    ],
    [...BASE, 'attempts', 'failure'],
  );

const closed: Phrase = (fact) =>
  said(
    [
      text('Le client a payé '),
      ...complementOf(fact),
      text(' après l’abandon de la hausse : il sera rendu'),
    ],
    BASE,
  );

const relaunched: Phrase = (fact) =>
  byActor(fact, [text('a relancé la hausse payée de '), ...order(fact)], BASE);

const alreadyReturned: Phrase = (fact) =>
  said(
    [text('Rien à rendre pour '), ...complementOf(fact), text(' : il avait déjà été rendu')],
    BASE,
  );

export const CARD_INCREASE_PHRASES = {
  'order.card_increase_proposed': proposed,
  'order.card_increase_paid': paid,
  'order.card_increase_applied': applied,
  'order.card_increase_refused': refused,
  'order.card_increase_abandoned': abandoned,
  'order.card_increase_stalled': stalled,
  'order.card_increase_closed': closed,
  'order.card_increase_relaunched': relaunched,
  'order.card_increase_already_returned': alreadyReturned,
} satisfies Partial<Record<JournalFactType, Phrase>>;
