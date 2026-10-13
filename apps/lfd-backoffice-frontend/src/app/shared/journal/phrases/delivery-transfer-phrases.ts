import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { count, optional, recordOf } from '../payload-read';
import {
  byActor,
  cite,
  inUnit,
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
 * **Le transfert interne** (plan du transfert interne, lot T1, 2026-10-13) —
 * le miroir de `DELIVERY_TRANSFER_FACTS` dans `@lfd/contracts`.
 *
 * Le sujet d'un `internal_transfer.*` est le transfert, nommé par le site
 * qu'il sert ; celui d'un `delivery_round.transfer_stop_*` est la tournée,
 * qui cite le transfert par son site.
 */

const ROUND: Noun = { the: 'la tournée', a: 'une tournée' };
const TRANSFER: Noun = { the: 'le transfert vers', a: 'un transfert' };

/** Pourquoi un transfert reste sans arrêt. */
const UNPLACED_CAUSE: Readonly<Record<string, string>> = {
  no_vehicle: 'aucune tournée ni véhicule libre',
  site_not_located: 'le site n’a pas de point GPS',
};

/** Pourquoi une commande quitte son transfert. */
const LEAVE_CAUSE: Readonly<Record<string, string>> = {
  cancelled: 'annulée',
  moved: 'changée de jour ou de site',
};

const ORDER: Noun = { the: 'la commande', a: 'une commande' };
const BIN: Noun = { the: '', a: 'un bac' };
const BIN_TYPE: Noun = { the: 'de type', a: 'd’un type' };

/** « , 3 bacs » — les bacs comptés à la réception (lot T3) ; rien avant T3. */
function binsOf(raw: unknown): Segment[] {
  const bins = count(raw);
  return bins === null ? [] : [text(', '), value(`${String(bins)} bac${bins > 1 ? 's' : ''}`)];
}

/** « « ABC234 », « ABC235 » » — les bacs créés, par leur code. */
function binList(raw: readonly unknown[]): Segment[] {
  return raw.flatMap((entry, index) => {
    const said = cite(BIN, entry);
    return index === 0 ? said : [text(', '), ...said];
  });
}

/** « (annulée) » — rien pour une cause inconnue. */
function causeOf(fact: PhraseFact): Segment[] {
  const cause = LEAVE_CAUSE[optional(fact.payload['cause']) ?? ''];
  return cause === undefined ? [] : [text(' ('), value(cause), text(')')];
}

/** « , passage 2 » — rien au premier passage, comme l'écran. */
function passageOf(raw: unknown): Segment[] {
  const passage = count(raw);
  return passage === null || passage <= 1 ? [] : [text(', passage '), value(String(passage))];
}

/** « du 1 octobre 2026 » — rien sans jour. */
function dayOf(fact: PhraseFact): Segment[] {
  const day = optional(fact.payload['day']);
  return day === null ? [] : [text(' du '), inUnit('day', day)];
}

/** « le transfert vers « Val Village » du 1 octobre 2026 ». */
function transfer(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return [
    ...(label === null
      ? [text('un transfert')]
      : [text('le transfert vers « '), subject(fact, label), text(' »')]),
    ...dayOf(fact),
  ];
}

/** « du transfert vers « Val Village » du 1 octobre 2026 » — la contraction que « de » demande. */
function fromTransfer(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return [
    ...(label === null
      ? [text(' d’un transfert')]
      : [text(' du transfert vers « '), subject(fact, label), text(' »')]),
    ...dayOf(fact),
  ];
}

/** « la tournée « Kangoo » du 1 octobre 2026, passage 2 ». */
function round(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return [
    ...(label === null
      ? [text('une tournée')]
      : [text('la tournée « '), subject(fact, label), text(' »')]),
    ...dayOf(fact),
    ...passageOf(fact.payload['passage']),
  ];
}

const TRANSFER_KEYS = ['subjectLabel', 'day'] as const;
const ROUND_KEYS = ['subjectLabel', 'day', 'passage'] as const;

export const DELIVERY_TRANSFER_PHRASES = {
  'internal_transfer.opened': (fact) =>
    byActor(fact, [text('a ouvert '), ...transfer(fact)], TRANSFER_KEYS),
  'internal_transfer.placed': (fact) =>
    byActor(
      fact,
      [
        text('a placé '),
        ...transfer(fact),
        text(' dans '),
        ...cite(ROUND, fact.payload['round']),
        ...passageOf(fact.payload['passage']),
        ...(fact.payload['dedicated'] === true ? [text(', tournée dédiée')] : []),
      ],
      [...TRANSFER_KEYS, 'round', 'passage', 'dedicated'],
    ),
  'internal_transfer.unplaced': (fact) =>
    byActor(
      fact,
      [
        text('n’a placé '),
        ...transfer(fact),
        text(' dans aucune tournée : '),
        value(UNPLACED_CAUSE[optional(fact.payload['cause']) ?? ''] ?? 'raison inconnue'),
      ],
      [...TRANSFER_KEYS, 'cause'],
    ),
  'delivery_round.transfer_stop_moved': (fact) => {
    const from = recordOf(fact.payload['from']);
    const position = count(fact.payload['position']);
    return byActor(
      fact,
      [
        text('a déplacé '),
        ...cite(TRANSFER, fact.payload['transfer']),
        text(' de '),
        ...cite(ROUND, from?.['round']),
        ...passageOf(from?.['passage']),
        text(' vers '),
        ...round(fact),
        ...(position === null ? [] : [text(' en position '), value(String(position))]),
      ],
      [...ROUND_KEYS, 'transfer', 'from', 'position'],
    );
  },
  'delivery_round.transfer_stop_removed': (fact) =>
    byActor(
      fact,
      [
        text('a retiré '),
        ...cite(TRANSFER, fact.payload['transfer']),
        text(' de '),
        ...round(fact),
      ],
      [...ROUND_KEYS, 'transfer'],
    ),
  'internal_transfer.received': (fact) => {
    const reason = optional(fact.payload['reason']);
    return byActor(
      fact,
      [
        text(fact.payload['via'] === 'site_drop' ? 'a remis au site ' : 'a réceptionné '),
        ...transfer(fact),
        ...(fact.payload['manual'] === true ? [text(', sans tournée')] : []),
        ...binsOf(fact.payload['bins']),
        ...(reason === null ? [] : [text(' : '), value(reason)]),
      ],
      [...TRANSFER_KEYS, 'via', 'manual', 'reason', 'bins'],
    );
  },
  'internal_transfer.bins_declared': (fact) => {
    const bins: readonly unknown[] = Array.isArray(fact.payload['bins'])
      ? fact.payload['bins']
      : [];
    const bags = count(fact.payload['innerBags']);
    return byActor(
      fact,
      [
        text(`a déclaré ${bins.length > 1 ? `${String(bins.length)} bacs` : 'un bac'} `),
        ...cite(BIN_TYPE, fact.payload['binType']),
        text(' pour '),
        ...transfer(fact),
        ...(bags === null || bags === 0
          ? []
          : [text(', '), value(`${String(bags)} sac${bags > 1 ? 's' : ''}`), text(' dans chacun')]),
        ...(bins.length === 0 ? [] : [text(' : '), ...binList(bins)]),
      ],
      [...TRANSFER_KEYS, 'binType', 'innerBags', 'bins'],
    );
  },
  'internal_transfer.order_detached': (fact) =>
    byActor(
      fact,
      [
        text('a retiré '),
        ...cite(ORDER, fact.payload['order']),
        ...causeOf(fact),
        ...fromTransfer(fact),
      ],
      [...TRANSFER_KEYS, 'order', 'cause'],
    ),
  'internal_transfer.order_kept': (fact) =>
    byActor(
      fact,
      [
        text('n’a pas retiré '),
        ...cite(ORDER, fact.payload['order']),
        ...causeOf(fact),
        ...fromTransfer(fact),
        text(fact.payload['state'] === 'received' ? ', déjà reçu' : ', déjà parti'),
        text(' : le manifeste reste inchangé'),
      ],
      [...TRANSFER_KEYS, 'order', 'cause', 'state'],
    ),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
