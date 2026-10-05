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
import { COLLECTION_FORM, FOLLOW_ASPECT } from '../values/accounts-values';

/**
 * **Les sous-comptes** — le lien d'un client vers son compte principal, et
 * les aspects qu'il en suit (plan `documentation/b2b/comptes-client/plan-sous-comptes.md`,
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

const OF_PARENT: Noun = { the: 'du compte principal', a: 'd’un compte principal' };
const A_SUB_ACCOUNT: Noun = { the: 'le sous-compte', a: 'un sous-compte' };

/**
 * **Le suivi d'une mercuriale**, au journal des prix (S3, T21) — écrit deux
 * fois par geste. Sur le sous-compte : « a aligné le tarif du client « X » sur
 * la mercuriale du compte principal « P » ». Sur le principal : « a aligné le
 * sous-compte « X » sur la mercuriale du client « P » ». La phrase figée
 * (`summary`) et les dates restent au détail.
 */
/** « du client « X » », lié à sa fiche — « d’un client » sans nom. */
function ofClient(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return label === null
    ? [text('d’un client')]
    : [text('du client « '), subject(fact, label), text(' »')];
}

function followOnChild(verb: string, preposition: string, moments: readonly string[]): Phrase {
  return (fact) =>
    byActor(
      fact,
      [
        text(`${verb} le tarif `),
        ...ofClient(fact),
        text(` ${preposition} la mercuriale `),
        ...cite(OF_PARENT, fact.payload['parent']),
      ],
      ['subjectLabel', 'parent', 'summary', 'reason', ...moments],
    );
}

function followOnParent(verb: string, preposition: string, moments: readonly string[]): Phrase {
  return (fact) =>
    byActor(
      fact,
      [
        text(`${verb} `),
        ...cite(A_SUB_ACCOUNT, fact.payload['child']),
        text(` ${preposition} la mercuriale `),
        ...ofClient(fact),
      ],
      ['subjectLabel', 'child', 'summary', 'reason', ...moments],
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

/** « a réglé le prélèvement du client « X » : mandat du site… » (S4, §2.1 ter). */
const collectionFormSet: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a réglé le prélèvement '),
      ...ofClient(fact),
      text(' : '),
      valueIn(COLLECTION_FORM, fact.payload['form'], { inSentence: true }),
    ],
    ['subjectLabel', 'form', 'since'],
  );

export const SUB_ACCOUNT_PHRASES = {
  'company.parent_attached': parentAttached,
  'company.parent_detached': parentDetached,
  'company.parent_followed': alignment('a aligné', 'since'),
  'company.parent_unfollowed': alignment('a désaligné', 'until'),
  'company.group_without_delivery_set': groupWithoutDeliverySet,
  'company.collection_form_set': collectionFormSet,
  'pricing_follow.started': followOnChild('a aligné', 'sur', ['validFrom']),
  'pricing_follow.ended': followOnChild('a désaligné', 'de', ['validFrom', 'validTo']),
  'pricing_follower.joined': followOnParent('a aligné', 'sur', ['validFrom']),
  'pricing_follower.left': followOnParent('a désaligné', 'de', ['validFrom', 'validTo']),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
