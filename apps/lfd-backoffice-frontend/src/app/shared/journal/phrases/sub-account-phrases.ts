import type { JournalFactType } from '@lfd/contracts/journal-facts';

import {
  byActor,
  cite,
  subject,
  subjectLabelOf,
  text,
  valueIn,
  type Noun,
  type Phrase,
  type PhraseFact,
  type Segment,
} from '../phrase';
import { FOLLOW_ASPECT } from '../values/accounts-values';

/**
 * **Les sous-comptes** — le lien d'un client vers son compte principal, et
 * les aspects qu'il en suit (plan `documentation/b2b/plan-sous-comptes.md`,
 * lot S1, 2026-10-05). Le sujet est toujours le SOUS-COMPTE ; le principal
 * est cité sous son nom du moment.
 */

/** « le client « Chalet Edelweiss » », lié à sa fiche — « un client » sans nom. */
function subAccount(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null
    ? [text('un client')]
    : [text('le client « '), subject(fact, label), text(' »')];
}

const TO_PARENT: Noun = { the: 'au compte principal', a: 'à un compte principal' };
const FROM_PARENT: Noun = { the: 'du compte principal', a: 'd’un compte principal' };
const ON_PARENT: Noun = { the: 'sur le compte principal', a: 'sur un compte principal' };

const parentAttached: Phrase = (fact) =>
  byActor(
    fact,
    [
      text(fact.payload['via'] === 'created' ? 'a créé ' : 'a rattaché '),
      ...subAccount(fact),
      text(fact.payload['via'] === 'created' ? ', sous-compte rattaché ' : ' '),
      ...cite(TO_PARENT, fact.payload['parent']),
    ],
    ['subjectLabel', 'parent', 'via'],
  );

/** « — suivis clos : facturation, tarif », ou rien quand il n'en suivait aucun. */
function closedAspects(raw: unknown): Segment[] {
  const aspects = Array.isArray(raw) ? raw : [];
  if (aspects.length === 0) {
    return [];
  }
  return [
    text(' — suivis clos : '),
    ...aspects.flatMap((aspect, index) => [
      ...(index === 0 ? [] : [text(', ')]),
      valueIn(FOLLOW_ASPECT, aspect, { inSentence: true }),
    ]),
  ];
}

const parentDetached: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a détaché '),
      ...subAccount(fact),
      text(' '),
      ...cite(FROM_PARENT, fact.payload['parent']),
      ...closedAspects(fact.payload['closedAspects']),
    ],
    ['subjectLabel', 'parent', 'closedAspects'],
  );

/** « a aligné le client « X » sur le compte principal « P » : tarif ». */
function alignment(verb: string, moment: 'since' | 'until'): Phrase {
  return (fact) =>
    byActor(
      fact,
      [
        text(`${verb} `),
        ...subAccount(fact),
        text(' '),
        ...cite(ON_PARENT, fact.payload['parent']),
        text(' : '),
        valueIn(FOLLOW_ASPECT, fact.payload['aspect'], { inSentence: true }),
      ],
      ['subjectLabel', 'parent', 'aspect', moment],
    );
}

const groupWithoutDeliverySet: Phrase = (fact) =>
  byActor(
    fact,
    [
      text(
        fact.payload['enabled'] === true
          ? 'a coché « Compte de groupe, sans livraison » pour '
          : 'a décoché « Compte de groupe, sans livraison » pour ',
      ),
      ...subAccount(fact),
    ],
    ['subjectLabel', 'enabled'],
  );

export const SUB_ACCOUNT_PHRASES = {
  'company.parent_attached': parentAttached,
  'company.parent_detached': parentDetached,
  'company.parent_followed': alignment('a aligné', 'since'),
  'company.parent_unfollowed': alignment('a désaligné', 'until'),
  'company.group_without_delivery_set': groupWithoutDeliverySet,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
