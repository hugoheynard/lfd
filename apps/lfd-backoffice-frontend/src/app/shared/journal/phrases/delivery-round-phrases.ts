import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { count, optional, recordOf } from '../payload-read';
import {
  byActor,
  cite,
  citePerson,
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
 * **La composition des tournées** (`plan-preparation-de-tournee.md`, lot 3,
 * C7) — le miroir de `DELIVERY_ROUND_FACTS` dans `@lfd/contracts`.
 *
 * Le sujet est la tournée, nommée par son véhicule ; le jour et le passage la
 * distinguent d'une autre tournée du même véhicule (Q13). Une commande est
 * citée par son numéro, ou par son seul identifiant quand le commerce ne la
 * connaît plus.
 */

const ORDER: Noun = { the: 'la commande', a: 'une commande' };
const ROUND: Noun = { the: 'la tournée', a: 'une tournée' };

/** « passage 2 » — rien au premier passage, comme l'écran. */
function passageOf(raw: unknown): Segment[] {
  const passage = count(raw);
  return passage === null || passage <= 1 ? [] : [text(', passage '), value(String(passage))];
}

/** « la tournée « Kangoo » du 1 octobre 2026, passage 2 ». */
function round(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  const day = optional(fact.payload['day']);
  return [
    ...(label === null
      ? [text('une tournée')]
      : [text('la tournée « '), subject(fact, label), text(' »')]),
    ...(day === null ? [] : [text(' du '), inUnit('day', day)]),
    ...passageOf(fact.payload['passage']),
  ];
}

const ROUND_KEYS = ['subjectLabel', 'day', 'passage'] as const;

/** « en position 3 » — rien si la charge n'a pas figé de rang. */
function atPosition(raw: unknown): Segment[] {
  const position = count(raw);
  return position === null ? [] : [text(' en position '), value(String(position))];
}

/** « CMD-1, CMD-2 » — les commandes dans l'ordre, par leur numéro ou leur identifiant. */
export function orderList(raw: unknown): Segment[] {
  const orders: readonly unknown[] = Array.isArray(raw) ? raw : [];
  if (orders.length === 0) {
    return [text('—')];
  }
  return orders.flatMap((order, index) => {
    const cited = cite({ the: '', a: 'une commande' }, order);
    return index === 0 ? cited : [text(', '), ...cited];
  });
}

/** La famille d'un problème signalé, dans la phrase (`plan-a-la-porte.md`, § 3). */
const INCIDENT_FAMILY: Readonly<Record<string, string>> = {
  doorstep: 'un problème à la remise',
  technical: 'un problème technique',
  road: 'un problème routier',
};

/** Les motifs, tels que le livreur les a choisis (§ 3). */
const INCIDENT_REASON: Readonly<Record<string, string>> = {
  nobody_present: 'personne pour réceptionner',
  refused: 'refus',
  address_not_found: 'adresse introuvable',
  access_impossible: 'accès impossible',
  goods_damaged: 'marchandise abîmée',
  vehicle_breakdown: 'panne du véhicule',
  cold_failure: 'froid défaillant',
  phone_or_app: 'téléphone ou application',
  bin_damaged: 'bac endommagé',
  road_closed: 'route fermée',
  accident: 'accident',
  weather_conditions: 'conditions (neige, verglas)',
  traffic_jam: 'bouchon',
  other: 'autre',
};

export const DELIVERY_ROUND_PHRASES = {
  'delivery_round.opened': (fact) => byActor(fact, [text('a ouvert '), ...round(fact)], ROUND_KEYS),
  'delivery_round.stop_assigned': (fact) =>
    byActor(
      fact,
      [
        text('a affecté '),
        ...cite(ORDER, fact.payload['order']),
        text(' à '),
        ...round(fact),
        ...atPosition(fact.payload['position']),
      ],
      [...ROUND_KEYS, 'order', 'position'],
    ),
  // UN fait pour un déplacement (C7) : le sujet est la tournée d'arrivée.
  'delivery_round.stop_moved': (fact) => {
    const from = recordOf(fact.payload['from']);
    return byActor(
      fact,
      [
        text('a déplacé '),
        ...cite(ORDER, fact.payload['order']),
        text(' de '),
        ...cite(ROUND, from?.['round']),
        ...passageOf(from?.['passage']),
        text(' vers '),
        ...round(fact),
        ...atPosition(fact.payload['position']),
      ],
      [...ROUND_KEYS, 'order', 'from', 'position'],
    );
  },
  'delivery_round.stop_removed': (fact) =>
    byActor(
      fact,
      [text('a retiré '), ...cite(ORDER, fact.payload['order']), text(' de '), ...round(fact)],
      [...ROUND_KEYS, 'order'],
    ),
  'delivery_round.reordered': (fact) =>
    byActor(
      fact,
      [
        text('a réordonné '),
        ...round(fact),
        text(' : de '),
        ...orderList(fact.payload['before']),
        text(' à '),
        ...orderList(fact.payload['after']),
      ],
      [...ROUND_KEYS, 'before', 'after'],
    ),
  // Plan « Ma tournée », MT-D2 : le livreur, cité par son nom, ou son identifiant.
  'delivery_round.driver_assigned': (fact) => {
    const previous = fact.payload['previous'];
    return byActor(
      fact,
      [
        text('a affecté '),
        ...citePerson(fact.payload['driver'], 'un livreur'),
        text(' à '),
        ...round(fact),
        ...(previous === null || previous === undefined
          ? []
          : [text(' à la place de '), ...citePerson(previous, 'un livreur')]),
      ],
      [...ROUND_KEYS, 'driver', 'previous'],
    );
  },
  'delivery_round.driver_unassigned': (fact) =>
    byActor(
      fact,
      [
        text('a retiré le livreur '),
        ...citePerson(fact.payload['previous'], 'un livreur'),
        text(' de '),
        ...round(fact),
      ],
      [...ROUND_KEYS, 'previous'],
    ),
  // « Tournée terminée » (parcours-du-livreur.md, PL2) : les bacs vides sont rentrés.
  'delivery_round.returned': (fact) => {
    const open = count(fact.payload['openStops']);
    return byActor(
      fact,
      [
        text('a déclaré rentrée '),
        ...round(fact),
        ...(open === null || open === 0
          ? []
          : [text(', '), value(`${String(open)} arrêt${open > 1 ? 's' : ''} non remis`)]),
      ],
      [...ROUND_KEYS, 'openStops'],
    );
  },
  // Plan « À la porte », lot A : les gestes du livreur sur un arrêt.
  'delivery_round.stop_arrived': (fact) =>
    byActor(
      fact,
      [
        text('est arrivé chez '),
        ...cite(ORDER, fact.payload['order']),
        text(' ('),
        ...round(fact),
        text(')'),
      ],
      [...ROUND_KEYS, 'order'],
    ),
  'delivery_round.incident_reported': (fact) => {
    const order = fact.payload['order'];
    return byActor(
      fact,
      [
        text(
          `a signalé ${INCIDENT_FAMILY[optional(fact.payload['family']) ?? ''] ?? 'un problème'}`,
        ),
        ...(order === null || order === undefined ? [] : [text(' pour '), ...cite(ORDER, order)]),
        text(' sur '),
        ...round(fact),
        text(' : '),
        value(INCIDENT_REASON[optional(fact.payload['reason']) ?? ''] ?? 'motif inconnu'),
        ...(fact.payload['withPhoto'] === true ? [text(', photo jointe')] : []),
      ],
      [...ROUND_KEYS, 'order', 'family', 'reason', 'withPhoto'],
    );
  },
  'delivery_round.stop_closed_without_handover': (fact) =>
    byActor(
      fact,
      [
        text('a clos sans remise l’arrêt de '),
        ...cite(ORDER, fact.payload['order']),
        text(' sur '),
        ...round(fact),
        text(
          fact.payload['cause'] === 'cancelled'
            ? ' : commande annulée'
            : ' : commande déjà retirée',
        ),
      ],
      [...ROUND_KEYS, 'order', 'cause'],
    ),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
