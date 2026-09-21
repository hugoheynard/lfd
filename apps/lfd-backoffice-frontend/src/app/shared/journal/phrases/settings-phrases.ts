import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { optional, recordOf } from '../payload-read';
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

/** Une clientèle de la livraison : sa case dans la charge, et comment elle se dit. */
interface Clientele {
  readonly key: 'openToB2b' | 'openToB2c';
  readonly to: string;
}

const CLIENTELES: readonly Clientele[] = [
  { key: 'openToB2b', to: 'aux professionnels' },
  { key: 'openToB2c', to: 'aux particuliers' },
];

/** Une clientèle, son état d'avant et d'après. */
interface Opening {
  readonly to: string;
  readonly before: boolean;
  readonly after: boolean;
}

/** L'avant et l'après de chaque clientèle, ou `null` si la charge ne les porte pas tous. */
function openings(fact: PhraseFact): readonly Opening[] | null {
  const previous = recordOf(fact.payload['previous']);
  const read = CLIENTELES.map(({ key, to }) => ({
    to,
    before: previous?.[key],
    after: fact.payload[key],
  }));
  return read.every(
    (entry) => typeof entry.before === 'boolean' && typeof entry.after === 'boolean',
  )
    ? read.map(({ to, before, after }) => ({ to, before: before === true, after: after === true }))
    : null;
}

/** « aux professionnels et aux particuliers ». */
function toAll(entries: readonly Opening[]): string {
  return entries.map((entry) => entry.to).join(' et ');
}

/** « ouverte aux professionnels, fermée aux particuliers » — l'état de chacune. */
function states(entries: readonly Opening[]): string {
  const open = entries.filter((entry) => entry.after);
  const closed = entries.filter((entry) => !entry.after);
  return [
    ...(open.length === 0 ? [] : [`ouverte ${toAll(open)}`]),
    ...(closed.length === 0 ? [] : [`fermée ${toAll(closed)}`]),
  ].join(', ');
}

/**
 * « a ouvert la livraison aux particuliers et l’a fermée aux professionnels »,
 * « a fermé la livraison aux professionnels ; elle reste ouverte aux
 * particuliers » — ce qui a changé d'abord, ce qui n'a pas bougé ensuite : la
 * charge porte l'avant et l'après de chaque clientèle, la phrase dit les deux
 * et le détail n'a plus rien à ajouter.
 */
function deliveryAvailability(fact: PhraseFact): Segment[] {
  const entries = openings(fact);
  if (entries === null) {
    return [text('a réglé l’ouverture de la livraison par clientèle')];
  }
  const opened = entries.filter((entry) => !entry.before && entry.after);
  const closed = entries.filter((entry) => entry.before && !entry.after);
  const kept = entries.filter((entry) => entry.before === entry.after);
  if (opened.length === 0 && closed.length === 0) {
    return [text(`a réglé la livraison sans la changer : ${states(entries)}`)];
  }
  const changes = [
    ...(opened.length === 0 ? [] : [`a ouvert la livraison ${toAll(opened)}`]),
    ...(closed.length === 0
      ? []
      : [
          opened.length === 0
            ? `a fermé la livraison ${toAll(closed)}`
            : `l’a fermée ${toAll(closed)}`,
        ]),
  ].join(' et ');
  return [text(kept.length === 0 ? changes : `${changes} ; elle reste ${states(kept)}`)];
}

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
    byActor(
      fact,
      deliveryAvailability(fact),
      openings(fact) === null ? [] : ['openToB2b', 'openToB2c', 'previous'],
    ),
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
