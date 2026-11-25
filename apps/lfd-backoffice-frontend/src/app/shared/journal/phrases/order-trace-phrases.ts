import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { optional, recordOf } from '../payload-read';
import {
  byActor,
  name,
  said,
  subject,
  subjectLabelOf,
  text,
  type Phrase,
  type PhraseFact,
  type Segment,
} from '../phrase';

/**
 * **Ce qui s'est passé sur une commande après le colisage** (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 5 ter,
 * B4b.3) — le manque signalé, l'impression d'un bon de livraison, la lettre
 * au client. Le sujet est la commande ; le détail rend le reste de la charge.
 */

/** « la commande ORD-142 », liée à sa fiche ; « une commande » sans libellé. */
function order(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null ? [text('une commande')] : [text('la commande '), subject(fact, label)];
}

/**
 * « Cécile Martin a signalé un manque au colisage sur la commande ORD-142 » —
 * `reportedBy` cite la fiche qui a signalé ; la ligne est écrite par la
 * machine, d'où le repli sur l'auteur seulement quand elle ne la nomme pas.
 */
const shortfallReported: Phrase = (fact) => {
  const cited = recordOf(fact.payload['reportedBy']);
  const by = cited === null ? null : optional(cited['name']);
  const rest = [text('a signalé un manque au colisage sur '), ...order(fact)];
  return by === null
    ? byActor(fact, rest, ['subjectLabel'])
    : said([name(by), text(' '), ...rest], ['subjectLabel', 'reportedBy']);
};

const shortfallLetterSent: Phrase = (fact) =>
  byActor(
    fact,
    [text('a écrit au client du départ incomplet de '), ...order(fact)],
    ['subjectLabel'],
  );

const notePrinted: Phrase = (fact) => {
  const number = optional(fact.payload['noteNumber']);
  const version = fact.payload['contentVersion'];
  return byActor(
    fact,
    [
      text('a imprimé le bon de livraison '),
      ...(number === null ? [] : [name(number)]),
      ...(typeof version === 'number' ? [text(` (version ${String(version)})`)] : []),
      text(' de '),
      ...order(fact),
    ],
    ['subjectLabel', 'noteNumber', 'contentVersion'],
  );
};

export const ORDER_TRACE_PHRASES = {
  'order.shortfall_reported': shortfallReported,
  'order.shortfall_letter_sent': shortfallLetterSent,
  'delivery_note.printed': notePrinted,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
