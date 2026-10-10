import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { count, optional } from '../payload-read';
import {
  byActor,
  cite,
  inUnit,
  name,
  subject,
  subjectLabelOf,
  text,
  value,
  valueIn,
  type Noun,
  type Phrase,
  type PhraseFact,
  type Segment,
} from '../phrase';
import { INVOICE_AUTOPILOT_OUTCOME } from '../values/accounting-values';

/**
 * **La facture émise et l'avoir** (plan
 * `documentation/comptabilite/facturation/facture-emise.md`) — famille
 * `accounting` du catalogue. À part de `accounting-phrases.ts`, qui dépasse
 * déjà la taille d'un fichier.
 */

const INVOICE: Noun = { the: 'la facture', a: 'une facture' };
const CREDIT_NOTE: Noun = { the: 'l’avoir', a: 'un avoir' };
const ON_INVOICE: Noun = { the: 'sur la facture', a: 'sur une facture' };
const FOR_CLIENT: Noun = { the: 'au client', a: 'à un client' };
const ENTITY: Noun = { the: 'l’entité émettrice', a: 'une entité émettrice' };

const KEYS = ['subjectLabel', 'payer', 'legalEntity', 'issuedOn', 'orderCount', 'totalCents'];

/** « la facture « FA-2026-000001 » » — ou tout sujet nommé du fait, lié à sa fiche. */
function piece(fact: PhraseFact, noun: Noun): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null
    ? [text(noun.a)]
    : [text(`${noun.the} « `), subject(fact, label), text(' »')];
}

/** « … du 30/09/2026, 3 bon(s), chez l'entité « X » — 12,34 € ». */
function details(fact: PhraseFact): Segment[] {
  return [
    text(' du '),
    inUnit('day', fact.payload['issuedOn']),
    text(', '),
    value(`${String(count(fact.payload['orderCount']) ?? '?')} bon(s)`),
    text(', chez '),
    ...cite(ENTITY, fact.payload['legalEntity']),
    text(' — '),
    inUnit('cents', fact.payload['totalCents']),
  ];
}

const invoiceIssued: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a émis '),
      ...piece(fact, INVOICE),
      text(' '),
      ...cite(FOR_CLIENT, fact.payload['payer']),
      ...details(fact),
    ],
    KEYS,
  );

const creditNoteIssued: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a émis '),
      ...piece(fact, CREDIT_NOTE),
      text(' '),
      ...cite(ON_INVOICE, fact.payload['correctedInvoice']),
      text(' '),
      ...cite(FOR_CLIENT, fact.payload['payer']),
      ...details(fact),
    ],
    [...KEYS, 'correctedInvoice'],
  );

/** « … à 2 destinataire(s) » — jamais les adresses, leur nombre (E6). */
function recipients(fact: PhraseFact): Segment[] {
  return [
    text(' à '),
    value(`${String(count(fact.payload['recipientCount']) ?? '?')} destinataire(s)`),
  ];
}

const NOTICE_KEYS = ['subjectLabel', 'payer', 'recipientCount'];

/** « … a prévenu de la facture « FA-… » au client « X » à 2 destinataire(s) ». */
const noticeSent: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a prévenu de '),
      ...piece(fact, INVOICE),
      text(' '),
      ...cite(FOR_CLIENT, fact.payload['payer']),
      ...recipients(fact),
    ],
    NOTICE_KEYS,
  );

/** « … n'a pas pu prévenir de la facture « FA-… » … : « raison » ». */
const noticeFailed: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('n’a pas pu prévenir de '),
      ...piece(fact, INVOICE),
      text(' '),
      ...cite(FOR_CLIENT, fact.payload['payer']),
      ...recipients(fact),
      text(' : « '),
      name(optional(fact.payload['failure']) ?? '—'),
      text(' »'),
    ],
    [...NOTICE_KEYS, 'failure'],
  );

/** « … a renvoyé l'e-mail de la facture « FA-… » … (2 destinataire(s)) », et le refus s'il y en a un. */
const noticeResent: Phrase = (fact) => {
  const failure = optional(fact.payload['failure']);
  return byActor(
    fact,
    [
      text(failure === null ? 'a renvoyé l’e-mail de ' : 'n’a pas pu renvoyer l’e-mail de '),
      ...piece(fact, INVOICE),
      text(' '),
      ...cite(FOR_CLIENT, fact.payload['payer']),
      ...recipients(fact),
      ...(failure === null ? [] : [text(' : « '), name(failure), text(' »')]),
    ],
    [...NOTICE_KEYS, 'failure'],
  );
};

/** « la pièce « FA-… » » — une facture ou un avoir, selon `kind` (E3b). */
function document(fact: PhraseFact): Segment[] {
  return piece(fact, fact.payload['kind'] === 'credit_note' ? CREDIT_NOTE : INVOICE);
}

const DOCUMENT_KEYS = ['subjectLabel', 'payer', 'kind'];

/** « … a rendu le PDF de la facture « FA-… » au client « X » (48 213 octets) ». */
const documentRendered: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a rendu le PDF Factur-X de '),
      ...document(fact),
      text(' '),
      ...cite(FOR_CLIENT, fact.payload['payer']),
      text(' ('),
      value(`${String(count(fact.payload['byteCount']) ?? '?')} octets`),
      text(')'),
    ],
    [...DOCUMENT_KEYS, 'byteCount', 'sha256'],
  );

/** « … n'a pas pu rendre le PDF de la facture « FA-… » … : « raison » ». */
const documentRenderFailed: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('n’a pas pu rendre le PDF Factur-X de '),
      ...document(fact),
      text(' '),
      ...cite(FOR_CLIENT, fact.payload['payer']),
      text(' : « '),
      name(optional(fact.payload['failure']) ?? '—'),
      text(' »'),
    ],
    [...DOCUMENT_KEYS, 'failure'],
  );

/**
 * « … a tenté la facture du mois 2026-09 de l'entité émettrice « X » :
 * factures émises (3 facture(s), 1 payeur(s) signalé(s)) — « message » ».
 * Copie de `collection.autopilot_ran` ; l'auteur est le système.
 */
const autopilotRan: Phrase = (fact) => {
  const message = optional(fact.payload['message']);
  return byActor(
    fact,
    [
      text('a tenté la facture du mois '),
      value(optional(fact.payload['month']) ?? '—'),
      text(' de '),
      ...piece(fact, ENTITY),
      text(' : '),
      valueIn(INVOICE_AUTOPILOT_OUTCOME, fact.payload['outcome'], { inSentence: true }),
      text(' ('),
      value(`${String(count(fact.payload['issuedCount']) ?? '?')} facture(s)`),
      text(', '),
      value(`${String(count(fact.payload['signalledCount']) ?? '?')} payeur(s) signalé(s)`),
      text(')'),
      ...(message === null ? [] : [text(' — « '), name(message), text(' »')]),
    ],
    ['subjectLabel', 'month', 'outcome', 'issuedCount', 'signalledCount', 'message'],
  );
};

const PAYER: Noun = { the: 'le client', a: 'un client' };

/** « … a signalé le client « X » à la facture du mois 2026-09 : « raison » » — jamais un montant. */
const signalled: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a signalé '),
      ...piece(fact, PAYER),
      text(' à la facture du mois '),
      value(optional(fact.payload['month']) ?? '—'),
      text(' : « '),
      name(optional(fact.payload['reason']) ?? '—'),
      text(' »'),
    ],
    ['subjectLabel', 'month', 'reason'],
  );

export const INVOICE_PHRASES = {
  'invoice.issued': invoiceIssued,
  'invoice.credit_note_issued': creditNoteIssued,
  'invoice.notice_sent': noticeSent,
  'invoice.notice_failed': noticeFailed,
  'invoice.notice_resent': noticeResent,
  'invoice.document_rendered': documentRendered,
  'invoice.document_render_failed': documentRenderFailed,
  'invoice.autopilot_ran': autopilotRan,
  'invoice.signalled': signalled,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
