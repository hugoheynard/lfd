import type { JournalFactType } from '@lfd/contracts/journal-facts';

import {
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
import { REFUND_REJECTION, REFUND_STATUS } from '../values/orders-values';

/**
 * **Les remboursements Stripe constatés** (plan
 * `plan-facture-carte-et-remboursements.md`, lot R1) — familles
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

export const REFUND_PHRASES = {
  'order.refund_recorded': refundRecorded,
  'order.fully_refunded': fullyRefunded,
  'order.refund_rejected': refundRejected,
  'payment_refund.unmatched': refundUnmatched,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
