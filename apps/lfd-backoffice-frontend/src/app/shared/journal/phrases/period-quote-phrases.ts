import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { count, optional } from '../payload-read';
import {
  byActor,
  cite,
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
 * **Le devis de période** d'un organisme public (plan
 * `documentation/comptabilite/facturation/plan-clients-publics-chorus.md`,
 * § 6 sexies, QD4) — famille `accounting` du catalogue. À part de
 * `invoice-phrases.ts`, qui dépasse déjà la taille d'un fichier.
 */

const QUOTE: Noun = { the: 'le devis', a: 'un devis' };
const FOR_CLIENT: Noun = { the: 'au client', a: 'à un client' };
const OF_CLIENT: Noun = { the: 'du client', a: 'd’un client' };
const INVOICE: Noun = { the: 'la facture', a: 'une facture' };

/** « le devis « D-20261031-1 v2 » », lié au sujet du fait. */
function piece(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null
    ? [text(QUOTE.a)]
    : [text(`${QUOTE.the} « `), subject(fact, label), text(' »')];
}

/** « … n'a pas pu envoyer le devis « D-… v1 » au client « X » : « raison » ». */
const noticeFailed: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('n’a pas pu envoyer '),
      ...piece(fact),
      text(' '),
      ...cite(FOR_CLIENT, fact.payload['payer']),
      text(' : « '),
      name(optional(fact.payload['failure']) ?? '—'),
      text(' »'),
    ],
    ['subjectLabel', 'payer', 'version', 'failure'],
  );

/**
 * « … a renvoyé le devis « D-… v1 » au client « X » à 1 destinataire(s) », ou
 * « … a rangé une nouvelle version … » quand ses commandes avaient changé.
 */
const resent: Phrase = (fact) => {
  const renewed = fact.payload['renewed'] === true;
  const recipients = count(fact.payload['recipientCount']);
  return byActor(
    fact,
    [
      text(renewed ? 'a rangé et envoyé une nouvelle version : ' : 'a renvoyé '),
      ...piece(fact),
      text(' '),
      ...cite(FOR_CLIENT, fact.payload['payer']),
      ...(recipients === null ? [] : [text(' à '), value(`${String(recipients)} destinataire(s)`)]),
    ],
    ['subjectLabel', 'payer', 'version', 'renewed', 'recipientCount'],
  );
};

/**
 * « … a enregistré l'engagement n° « 1300012345 » sur le devis « D-… v1 » du
 * client « X » : la facture « FA-… » est émise pour 2 commande(s) ».
 */
const commitmentReceived: Phrase = (fact) => {
  const orders = count(fact.payload['orderCount']);
  return byActor(
    fact,
    [
      text('a enregistré l’engagement n° « '),
      name(optional(fact.payload['commitmentNumber']) ?? '—'),
      text(' » sur '),
      ...piece(fact),
      text(' '),
      ...cite(OF_CLIENT, fact.payload['payer']),
      text(' : '),
      ...cite(INVOICE, fact.payload['invoice']),
      text(' est émise'),
      ...(orders === null ? [] : [text(' pour '), value(`${String(orders)} commande(s)`)]),
    ],
    ['subjectLabel', 'payer', 'version', 'commitmentNumber', 'invoice', 'orderCount'],
  );
};

export const PERIOD_QUOTE_PHRASES = {
  'period_quote.commitment_received': commitmentReceived,
  'period_quote.notice_failed': noticeFailed,
  'period_quote.resent': resent,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
