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

/** La préposition qui introduit le titulaire, et qui se contracte avec son article. */
type HolderPreposition = 'de' | 'à' | 'pour';

/** L'article défini ou indéfini, déjà contracté avec la préposition. */
const HOLDER_ARTICLE: Record<
  HolderPreposition,
  { readonly named: string; readonly unnamed: string }
> = {
  de: { named: 'du client', unnamed: 'd’un client' },
  à: { named: 'au client', unnamed: 'à un client' },
  pour: { named: 'pour le client', unnamed: 'pour un client' },
};

/**
 * Le titulaire des points, préposition comprise : « du client « X » », « au
 * client « X » », ou « d’un client » sans nom. La préposition est portée ici
 * parce qu'elle se contracte avec l'article — « de le client » s'écrivait tel
 * quel dans le cycle d'un bon (corrigé le 2026-09-27).
 */
function holderOf(fact: PhraseFact, preposition: HolderPreposition): Segment[] {
  const client = subjectLabelOf(fact);
  const article = HOLDER_ARTICLE[preposition];
  return client === null
    ? [text(article.unnamed)]
    : [text(`${article.named} « `), subject(fact, client), text(' »')];
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

/** « … a ajusté de 500 points le solde de fidélité du client « X » : « motif » ». */
const loyaltyPointsAdjusted: Phrase = (fact) => {
  const voucher = fact.payload['voucher'];
  return byActor(
    fact,
    [
      text('a ajusté de '),
      points(fact.payload['points']),
      text(' le solde de fidélité '),
      ...holderOf(fact, 'de'),
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
        text(' '),
        ...holderOf(fact, 'de'),
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
        text(' de fidélité '),
        ...holderOf(fact, 'à'),
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
  // Lot C (2026-09-27) : le reliquat d'un bon consommé sur une commande.
  'loyalty.voucher_remainder_issued': (fact) =>
    byActor(
      fact,
      [
        text('a émis le reliquat '),
        ...cite(LOYALTY_VOUCHER, fact.payload['voucher']),
        text(' '),
        ...holderOf(fact, 'pour'),
        text(', d’une valeur de '),
        inUnit('cents', fact.payload['valueCents']),
        text(', laissé par '),
        ...cite(LOYALTY_VOUCHER, fact.payload['parent']),
        text(' sur '),
        ...cite(ORDER, fact.payload['order']),
        text(', valable jusqu’au '),
        inUnit('instant', fact.payload['expiresAt']),
      ],
      ['subjectLabel', 'voucher', 'valueCents', 'parent', 'order', 'expiresAt'],
    ),
  'loyalty.voucher_remainder_lapsed': (fact) =>
    byActor(
      fact,
      [
        text('a constaté l’extinction d’un reliquat de '),
        inUnit('cents', fact.payload['remainderCents']),
        text(', laissé par '),
        ...cite(LOYALTY_VOUCHER, fact.payload['voucher']),
        text(' '),
        ...holderOf(fact, 'pour'),
        text(' : le bon était échu quand '),
        ...cite(ORDER, fact.payload['order']),
        text(' est devenue définitive'),
      ],
      ['subjectLabel', 'remainderCents', 'voucher', 'order'],
    ),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
