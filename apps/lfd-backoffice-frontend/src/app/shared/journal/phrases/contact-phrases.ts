import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { text as orDash } from '../payload-read';
import {
  byActor,
  name,
  subjectLabelOf,
  text,
  type Phrase,
  type PhraseFact,
  type Said,
  type Segment,
} from '../phrase';

/** Ce qu'on a traité, selon le type de la demande. */
const WHAT: Readonly<Record<string, string>> = {
  contact: 'un message de contact',
  order_problem: 'un problème de commande',
  order_change: 'une demande de modification',
};

/**
 * **Les demandes clients** (`documentation/demandes-client/demandes-clients.md`)
 * — le miroir de `customer_request.handled` dans `@lfd/contracts`, qui a
 * remplacé `contact_message.handled`. La charge ne porte que le motif, figé à
 * la réception, et le type : ni l'auteur ni le texte, que l'anonymisation
 * viderait de toute façon.
 */
function handled(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  const kind = fact.payload['kind'];
  const what = (typeof kind === 'string' ? WHAT[kind] : undefined) ?? 'une demande client';
  return [
    text(label === null ? `a marqué traité ${what}` : `a marqué traité ${what} « ${label} »`),
  ];
}

/** Ce que la demande de modification a en commun : la commande nommée par son numéro. */
const CHANGE_CONSUMED = ['subjectLabel', 'orderNumber'];

/**
 * **La demande de modification d'une commande** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M4) : « Jean D. a
 * demandé une modification de la commande ORD-7 », puis « Marie D. a
 * appliqué… » ou « … a refusé… ». La demande, la révision de départ, la
 * révision produite et le mot du refus restent au détail.
 */
function changeGesture(fact: PhraseFact, verb: string): Said {
  return byActor(
    fact,
    [
      text(`${verb} la modification demandée de la commande `),
      name(orDash(fact.payload['orderNumber'])),
    ],
    CHANGE_CONSUMED,
  );
}

export const CONTACT_PHRASES = {
  'customer_request.handled': (fact) => byActor(fact, handled(fact), ['subjectLabel', 'kind']),
  'order.change_requested': (fact) =>
    byActor(
      fact,
      [
        text('a demandé une modification de la commande '),
        name(orDash(fact.payload['orderNumber'])),
      ],
      CHANGE_CONSUMED,
    ),
  'order.change_applied': (fact) => changeGesture(fact, 'a appliqué'),
  'order.change_refused': (fact) => changeGesture(fact, 'a refusé'),
} satisfies Partial<Record<JournalFactType, Phrase>>;
