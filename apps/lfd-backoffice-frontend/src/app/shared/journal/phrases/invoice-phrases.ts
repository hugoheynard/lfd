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
  type Noun,
  type Phrase,
  type PhraseFact,
  type Segment,
} from '../phrase';

/**
 * **La facture émise et l'avoir** (plan
 * `documentation/comptabilite/facturation/plan-emission-de-la-facture.md`, E2, E6, E3b) — famille
 * `accounting` du catalogue. À part de `accounting-phrases.ts`, qui dépasse
 * déjà la taille d'un fichier.
 */

const INVOICE: Noun = { the: 'la facture', a: 'une facture' };
const CREDIT_NOTE: Noun = { the: 'l’avoir', a: 'un avoir' };
const ON_INVOICE: Noun = { the: 'sur la facture', a: 'sur une facture' };
const FOR_CLIENT: Noun = { the: 'au client', a: 'à un client' };
const ENTITY: Noun = { the: 'l’entité émettrice', a: 'une entité émettrice' };

const KEYS = ['subjectLabel', 'payer', 'legalEntity', 'issuedOn', 'orderCount', 'totalCents'];

/** « la facture « FA-2026-000001 » », liée à sa pièce. */
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

export const INVOICE_PHRASES = {
  'invoice.issued': invoiceIssued,
  'invoice.credit_note_issued': creditNoteIssued,
  'invoice.notice_sent': noticeSent,
  'invoice.notice_failed': noticeFailed,
  'invoice.document_rendered': documentRendered,
  'invoice.document_render_failed': documentRenderFailed,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
