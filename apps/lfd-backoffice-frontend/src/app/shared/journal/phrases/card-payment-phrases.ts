import type { JournalFactType } from '@lfd/contracts/journal-facts';

import {
  byActor,
  inUnit,
  said,
  subject,
  subjectLabelOf,
  text,
  type Phrase,
  type PhraseFact,
  type Segment,
} from '../phrase';

/**
 * **L'encaissement par carte et ses remboursements** — les faits que le bloc
 * `card-payment` écrit lui-même (plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §3.3, lot P1.b), famille `accounting` du catalogue. Ceux de la commande
 * (`order.refund_*`) restent dans `refund-phrases.ts`.
 *
 * Le sujet d'une ligne est la DEMANDE de remboursement ; son libellé est celui
 * de ce qu'on rembourse (« Commande CMD-142 »). Le code d'un échec se lit tel
 * quel, il ne se traduit pas (la règle de `refund-phrases.ts`). Au passif pour
 * ce que le système fait seul ; à l'actif pour les deux gestes de l'équipe,
 * « Relancer » et « rendu autrement ».
 */

/** « le remboursement de « Commande CMD-142 » » ; « un remboursement » sans libellé. */
function refundOf(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null
    ? [text('un remboursement')]
    : [text('le remboursement de « '), subject(fact, label), text(' »')];
}

/** La phrase commence par lui : la majuscule, sans toucher au libellé. */
function refundOfAtStart(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null
    ? [text('Un remboursement')]
    : [text('Le remboursement de « '), subject(fact, label), text(' »')];
}

function failureOf(fact: PhraseFact): Segment {
  return text(typeof fact.payload['failure'] === 'string' ? fact.payload['failure'] : '—');
}

const issued: Phrase = (fact) =>
  said(
    [
      ...refundOfAtStart(fact),
      text(' a été émis chez le prestataire : '),
      inUnit('cents', fact.payload['issuedCents']),
      text(' (annoncés : '),
      inUnit('cents', fact.payload['announcedCents']),
      text(')'),
    ],
    ['subjectLabel', 'issuedCents', 'announcedCents'],
  );

const attemptFailed: Phrase = (fact) =>
  said(
    [
      text('Un essai d’émettre '),
      ...refundOf(fact),
      text(' n’a pas abouti chez le prestataire ('),
      failureOf(fact),
      text(') — le système réessaie'),
    ],
    ['subjectLabel', 'failure'],
  );

const stopped: Phrase = (fact) =>
  said(
    [
      ...refundOfAtStart(fact),
      text(' est arrêté ('),
      failureOf(fact),
      text(') : il attend « Relancer » ou « rendu autrement »'),
    ],
    ['subjectLabel', 'failure'],
  );

const retried: Phrase = (fact) =>
  byActor(fact, [text('a relancé '), ...refundOf(fact)], ['subjectLabel']);

const settledElsewhere: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a noté '),
      ...refundOf(fact),
      text(' rendu autrement : '),
      inUnit('cents', fact.payload['amountCents']),
      text(' — « '),
      text(typeof fact.payload['reason'] === 'string' ? fact.payload['reason'] : '—'),
      text(' »'),
    ],
    ['subjectLabel', 'amountCents', 'reason'],
  );

const unmatched: Phrase = (fact) =>
  said(
    [
      text('Un événement du prestataire ('),
      text(typeof fact.payload['eventType'] === 'string' ? fact.payload['eventType'] : '—'),
      text(') est arrivé sur le compte '),
      text(typeof fact.payload['account'] === 'string' ? fact.payload['account'] : '—'),
      text(' sans porter sur aucun de nos paiements'),
    ],
    ['eventType', 'account'],
  );

export const CARD_PAYMENT_PHRASES = {
  'card_payment.issued': issued,
  'card_payment.attempt_failed': attemptFailed,
  'card_payment.stopped': stopped,
  'card_payment.retried': retried,
  'card_payment.settled_elsewhere': settledElsewhere,
  'card_payment.unmatched': unmatched,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
