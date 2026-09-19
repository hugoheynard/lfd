import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { optional } from '../payload-read';
import {
  byActor,
  cite,
  countOf,
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
 * **Les réglages qui décident du prix de livraison, du retrait et des heures
 * limites**, et les engagements de volume — à la voix active, l'auteur en
 * sujet (lot D du plan des phrases, 2026-09-19). Ils étaient repris tels quels
 * de `factSentence` au lot C, au passif et sans auteur.
 */

const ZONE: Noun = { the: 'la zone de livraison', a: 'une zone de livraison' };
const PICKUP: Noun = { the: 'le point de retrait', a: 'un point de retrait' };
const OF_PICKUP: Noun = { the: 'du point de retrait', a: 'd’un point de retrait' };
const WITH_CLIENT: Noun = { the: 'avec le client', a: 'avec un client' };
const OF_CLIENT: Noun = { the: 'du client', a: 'd’un client' };

/**
 * « la zone de livraison « Paris » » — le sujet sous son libellé figé (D6),
 * sinon sous le `label` de la charge (forme d'avant le lot B), sinon « une
 * zone de livraison ».
 */
function setting(fact: PhraseFact, noun: Noun): Segment[] {
  const label = subjectLabelOf(fact) ?? optional(fact.payload['label']);
  return label === null
    ? [text(noun.a)]
    : [text(`${noun.the} « `), subject(fact, label), text(' »')];
}

/** « … a <verbe> la zone de livraison « Paris » ». */
function onSetting(verb: string, noun: Noun): Phrase {
  return (fact) =>
    byActor(fact, [text(`${verb} `), ...setting(fact, noun)], ['subjectLabel', 'label']);
}

/** « 17:30 », ou rien si la charge ne porte pas d'heure. */
function cutoffTime(fact: PhraseFact): Segment[] {
  const time = optional(fact.payload['time']);
  return time === null ? [] : [value(time)];
}

/** Le client engagé : cité nommé, ou par son seul id sur la forme d'avant le lot B. */
function engaged(fact: PhraseFact, noun: Noun): Segment[] {
  return cite(noun, fact.payload['company'] ?? fact.payload['companyId']);
}

const COMMITMENT_CLIENT_KEYS = ['subjectLabel', 'company', 'companyId'];

export const SETTINGS_PHRASES = {
  'delivery_zone.created': onSetting('a créé', ZONE),
  'delivery_zone.updated': onSetting('a modifié', ZONE),
  'delivery_zone.removed': onSetting('a supprimé', ZONE),
  'pickup_address.created': onSetting('a créé', PICKUP),
  'pickup_address.updated': onSetting('a modifié', PICKUP),
  'pickup_address.removed': onSetting('a supprimé', PICKUP),
  'pickup_address.default_set': (fact) =>
    byActor(
      fact,
      [text('a désigné '), ...setting(fact, PICKUP), text(' comme point par défaut')],
      ['subjectLabel'],
    ),
  // Le nombre de plages dit l'essentiel : passer de zéro à une ouvre les
  // créneaux publics du point, et c'est ce qu'un visiteur verra changer.
  'public_pickup_schedule.updated': (fact) => {
    const rules = countOf(fact.payload['ruleCount'], 'plage', 'plages');
    return byActor(
      fact,
      [
        text('a réglé les créneaux publics '),
        ...setting(fact, OF_PICKUP),
        ...(rules === null ? [] : [text(' ('), rules, text(')')]),
      ],
      ['subjectLabel', 'label', 'ruleCount'],
    );
  },
  'delivery_availability.updated': (fact) =>
    byActor(fact, [text('a réglé l’ouverture de la livraison par clientèle')], []),
  'order_cutoff.created': (fact) =>
    byActor(fact, [text('a posé une heure limite à '), ...cutoffTime(fact)], ['time']),
  'order_cutoff.updated': (fact) =>
    byActor(fact, [text('a porté une heure limite à '), ...cutoffTime(fact)], ['time']),
  // La forme courante emporte la règle effacée ; celle d'avant, rien.
  'order_cutoff.removed': (fact) => {
    const time = cutoffTime(fact);
    return byActor(
      fact,
      time.length === 0
        ? [text('a supprimé une heure limite')]
        : [text('a supprimé l’heure limite de '), ...time],
      ['time'],
    );
  },
  // Une quantité est un NOMBRE : la lire comme une chaîne la rendrait « — », et
  // un engagement sans volume promis ne veut rien dire.
  'volume_commitment.signed': (fact) => {
    const promised = fact.payload['promisedQuantity'];
    return byActor(
      fact,
      [
        text('a signé un engagement de volume '),
        ...engaged(fact, WITH_CLIENT),
        ...(typeof promised === 'number'
          ? [text(' (quantité promise : '), value(promised.toString()), text(')')]
          : []),
      ],
      [...COMMITMENT_CLIENT_KEYS, 'promisedQuantity'],
    );
  },
  'volume_commitment.closed': (fact) => {
    const reason = optional(fact.payload['reason']);
    return byActor(
      fact,
      [
        text('a clos l’engagement de volume '),
        ...engaged(fact, OF_CLIENT),
        ...(reason === null ? [] : [text(` — motif : ${reason}`)]),
      ],
      [...COMMITMENT_CLIENT_KEYS, 'reason'],
    );
  },
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
