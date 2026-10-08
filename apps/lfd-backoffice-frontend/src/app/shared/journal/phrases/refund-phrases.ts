import type { JournalFactType } from '@lfd/contracts/journal-facts';

import {
  cite,
  inUnit,
  said,
  subject,
  subjectLabelOf,
  text,
  valueIn,
  type Noun,
  type Phrase,
  type PhraseFact,
  type Segment,
} from '../phrase';
import { REFUND_NOT_CREDITED, REFUND_REJECTION, REFUND_STATUS } from '../values/orders-values';

/**
 * **Les remboursements Stripe constatés** (plan
 * `plan-facture-carte-et-remboursements.md`, lot R1), et ce que la facture
 * carte en fait (lots E5a, E5b : facture signalée, remboursement sans avoir) — familles
 * `ordersAndProduction` (`order.refund_*`) et `accounting`
 * (`payment_refund.unmatched`). À part de `orders-phrases.ts`, qui dépasse
 * déjà la taille d'un fichier.
 *
 * Au **passif** : le geste a été fait dans le tableau de bord Stripe, le
 * système ne fait que le constater — l'auteur de la ligne n'est pas celui du
 * remboursement.
 */

/** « la commande CMD-142 », liée à sa fiche ; « une commande » sans libellé. */
function order(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null ? [text('une commande')] : [text('la commande '), subject(fact, label)];
}

const refundRecorded: Phrase = (fact) =>
  said(
    [
      text('Un remboursement Stripe de '),
      inUnit('cents', fact.payload['amountCents']),
      text(' a été constaté sur '),
      ...order(fact),
      text(' ('),
      valueIn(REFUND_STATUS, fact.payload['status'], { inSentence: true }),
      text(') — remboursé au total : '),
      inUnit('cents', fact.payload['refundedCents']),
    ],
    ['subjectLabel', 'amountCents', 'status', 'refundedCents'],
  );

const fullyRefunded: Phrase = (fact) =>
  said(
    [
      text('Les remboursements Stripe atteignent le total de '),
      ...order(fact),
      text(' : elle est remboursée en totalité ('),
      inUnit('cents', fact.payload['refundedCents']),
      text(')'),
    ],
    ['subjectLabel', 'refundedCents'],
  );

const refundRejected: Phrase = (fact) =>
  said(
    [
      text('Un remboursement Stripe de '),
      inUnit('cents', fact.payload['amountCents']),
      text(' n’a pas été noté sur '),
      ...order(fact),
      text(' : '),
      valueIn(REFUND_REJECTION, fact.payload['reason'], { inSentence: true }),
    ],
    ['subjectLabel', 'amountCents', 'reason'],
  );

const refundUnmatched: Phrase = (fact) =>
  said(
    [
      text('Un remboursement Stripe de '),
      inUnit('cents', fact.payload['amountCents']),
      text(' du '),
      inUnit('instant', fact.payload['refundedAt']),
      text(' porte sur un paiement qu’aucune commande ne connaît ('),
      valueIn(REFUND_STATUS, fact.payload['status'], { inSentence: true }),
      text(')'),
    ],
    ['amountCents', 'refundedAt', 'status'],
  );

const ON_INVOICE: Noun = { the: 'sur la facture', a: 'sur une facture' };

const refundNotCredited: Phrase = (fact) =>
  said(
    [
      text('Un remboursement Stripe de '),
      inUnit('cents', fact.payload['amountCents']),
      text(' sur '),
      ...order(fact),
      text(' reste sans avoir automatique '),
      ...cite(ON_INVOICE, fact.payload['invoice']),
      text(' : '),
      valueIn(REFUND_NOT_CREDITED, fact.payload['reason'], { inSentence: true }),
    ],
    ['subjectLabel', 'amountCents', 'invoice', 'reason'],
  );

const cardInvoiceBlocked: Phrase = (fact) =>
  said(
    [
      text('La facture carte de '),
      ...order(fact),
      text(' n’a pas pu être émise : '),
      text(typeof fact.payload['message'] === 'string' ? fact.payload['message'] : '—'),
    ],
    ['subjectLabel', 'message'],
  );

export const REFUND_PHRASES = {
  'order.refund_recorded': refundRecorded,
  'order.fully_refunded': fullyRefunded,
  'order.refund_rejected': refundRejected,
  'payment_refund.unmatched': refundUnmatched,
  'order.refund_not_credited': refundNotCredited,
  'order.card_invoice_blocked': cardInvoiceBlocked,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
