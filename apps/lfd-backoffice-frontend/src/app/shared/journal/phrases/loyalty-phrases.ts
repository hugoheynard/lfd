import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { optional } from '../payload-read';
import {
  byActor,
  cite,
  countOf,
  inUnit,
  subject,
  subjectLabelOf,
  text,
  value,
  type Noun,
  type Phrase,
  type PhraseFact,
  type Segment,
} from '../phrase';

/**
 * **La fidélité** — le réglage du programme, le livre de points et les bons
 * de fidélité (famille `accounting` du catalogue des faits, plan
 * `documentation/comptabilite/plan-points-de-fidelite.md`, lot A, 2026-09-26).
 * Guide : en tête de `phrase-registry.ts`.
 *
 * Le titulaire est le sujet du fait ; une personne sans nom au profil se dit
 * « un client » — son adresse n'en tient jamais lieu.
 */

const LOYALTY_VOUCHER: Noun = { the: 'le bon', a: 'un bon de fidélité' };
const ORDER: Noun = { the: 'la commande', a: 'une commande' };

/** Le titulaire des points : « le client « X » », ou « un client » sans nom. */
function holderOf(fact: PhraseFact): Segment[] {
  const client = subjectLabelOf(fact);
  return client === null
    ? [text('un client')]
    : [text('le client « '), subject(fact, client), text(' »')];
}

function points(raw: unknown): Segment {
  return countOf(raw, 'point', 'points') ?? value('—');
}

/** « le réglage du programme : 1 000 points valent 5,00 €, … ». */
const loyaltySettingsSet: Phrase = (fact) => {
  const open = [
    fact.payload['openToPublic'] === true ? 'aux particuliers' : null,
    fact.payload['openToPro'] === true ? 'aux professionnels' : null,
  ].filter((word): word is string => word !== null);
  return byActor(
    fact,
    [
      text('a réglé le programme de fidélité : '),
      points(fact.payload['pointsPerStep']),
      text(' valent '),
      inUnit('cents', fact.payload['stepValueCents']),
      text(', bons valables '),
      inUnit('days', fact.payload['voucherValidityDays']),
      text(open.length === 0 ? ', fermé à toutes les clientèles' : `, ouvert ${open.join(' et ')}`),
    ],
    [
      'subjectLabel',
      'pointsPerStep',
      'stepValueCents',
      'openToPublic',
      'openToPro',
      'voucherValidityDays',
    ],
  );
};

/** « … a ajusté de 500 points le solde du client « X » : « motif » ». */
const loyaltyPointsAdjusted: Phrase = (fact) => {
  const voucher = fact.payload['voucher'];
  return byActor(
    fact,
    [
      text('a ajusté de '),
      points(fact.payload['points']),
      text(' le solde de fidélité de '),
      ...holderOf(fact),
      ...(voucher === null || voucher === undefined
        ? []
        : [text(', en annulant '), ...cite(LOYALTY_VOUCHER, voucher)]),
      text(' : « '),
      value(optional(fact.payload['reason']) ?? '—'),
      text(' »'),
    ],
    ['subjectLabel', 'points', 'reason', 'voucher'],
  );
};

/** Un bon cité, et son titulaire : le socle des phrases du cycle d'un bon. */
function onVoucher(
  verb: string,
  tail: (fact: PhraseFact) => Segment[],
  consumed: readonly string[],
): Phrase {
  return (fact) =>
    byActor(
      fact,
      [
        text(`${verb} `),
        ...cite(LOYALTY_VOUCHER, fact.payload['voucher']),
        text(' de '),
        ...holderOf(fact),
        ...tail(fact),
      ],
      ['subjectLabel', 'voucher', ...consumed],
    );
}

export const LOYALTY_PHRASES = {
  'loyalty_settings.set': loyaltySettingsSet,
  'loyalty.points_earned': (fact) =>
    byActor(
      fact,
      [
        text('a crédité '),
        points(fact.payload['points']),
        text(' de fidélité à '),
        ...holderOf(fact),
        text(' pour '),
        ...cite(ORDER, fact.payload['order']),
      ],
      ['subjectLabel', 'points', 'order'],
    ),
  'loyalty.points_adjusted': loyaltyPointsAdjusted,
  'loyalty.voucher_issued': onVoucher(
    'a émis',
    (fact) => [
      text(' contre '),
      points(fact.payload['pointsCost']),
      text(', d’une valeur de '),
      inUnit('cents', fact.payload['valueCents']),
      text(', valable jusqu’au '),
      inUnit('instant', fact.payload['expiresAt']),
    ],
    ['pointsCost', 'valueCents', 'expiresAt'],
  ),
  'loyalty.voucher_expired': onVoucher(
    'a constaté l’expiration',
    (fact) => [text(', d’une valeur de '), inUnit('cents', fact.payload['valueCents'])],
    ['valueCents'],
  ),
  'loyalty.voucher_cancelled': onVoucher(
    'a annulé',
    (fact) => [
      text(', d’une valeur de '),
      inUnit('cents', fact.payload['valueCents']),
      text(' ('),
      points(fact.payload['pointsCost']),
      text(') : « '),
      value(optional(fact.payload['reason']) ?? '—'),
      text(' »'),
    ],
    ['valueCents', 'pointsCost', 'reason'],
  ),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
