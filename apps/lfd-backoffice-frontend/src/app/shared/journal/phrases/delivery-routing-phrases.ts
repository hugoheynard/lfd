import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { count, entries, recordOf } from '../payload-read';
import {
  byActor,
  cite,
  inSentence,
  inUnit,
  subject,
  subjectLabelOf,
  text,
  value,
  valueIn,
  type Phrase,
  type Segment,
} from '../phrase';

import { PROPOSAL_MODE } from '../values/orders-values';

import { orderList } from './delivery-round-phrases';

/**
 * **Le calculateur de tournée** (`plan-preparation-de-tournee.md`, lot 7) — le
 * miroir de `DELIVERY_ROUTING_FACTS` dans `@lfd/contracts`.
 *
 * Les réglages se disent en entier, avant et après : cinq nombres tiennent en
 * une phrase. Une proposition appliquée dit chaque tournée touchée, ses arrêts
 * avant et après — c'est tout ce que le fait porte.
 */

const PERCENT = 100;

/** « ×1,4 » à partir de 140. */
function detour(raw: unknown): Segment {
  const percent = count(raw);
  return value(
    percent === null
      ? '—'
      : `×${(percent / PERCENT).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}`,
  );
}

/** Le mode de « Proposer » par défaut ; rien sur une charge d'avant les modes. */
function modeTerms(raw: unknown): Segment[] {
  return raw === 'insert' || raw === 'new_rounds'
    ? [text(', par défaut : '), valueIn(PROPOSAL_MODE, raw, { inSentence: true })]
    : [];
}

function passagesTerms(raw: unknown): Segment[] {
  if (typeof raw !== 'boolean') {
    return [];
  }
  return [text(raw ? ', plusieurs passages par véhicule' : ', un seul passage par véhicule')];
}

/** « détour ×1,4, 35 km/h, départ au plus tôt 07:00, 240 min au plus par tournée, 5 min par arrêt ». */
function settingsTerms(raw: unknown): Segment[] {
  const settings = recordOf(raw);
  if (settings === null) {
    return [text('les valeurs par défaut')];
  }
  const speed = count(settings['averageSpeedKmh']);
  return [
    text('détour '),
    detour(settings['detourPercent']),
    text(', '),
    value(speed === null ? '—' : `${String(speed)} km/h`),
    text(', départ au plus tôt '),
    inUnit('clockTime', settings['earliestDeparture']),
    text(', '),
    inUnit('minutes', settings['maxRoundMinutes']),
    text(' au plus par tournée, '),
    inUnit('minutes', settings['stopMinutes']),
    text(' par arrêt'),
    ...modeTerms(settings['defaultMode']),
    ...passagesTerms(settings['multiplePassages']),
  ];
}

/** « la tournée « Kangoo », passage 2 (ouverte) : de CMD-1 à CMD-2, CMD-1 ». */
function appliedRound(raw: unknown): Segment[] {
  const round = recordOf(raw) ?? {};
  const passage = count(round['passage']);
  const opened = round['opened'] === true;
  const before: readonly unknown[] = Array.isArray(round['before']) ? round['before'] : [];
  return [
    ...cite({ the: 'la tournée', a: 'une tournée' }, round['round']),
    ...(passage === null || passage <= 1 ? [] : [text(', passage '), value(String(passage))]),
    ...(opened ? [text(' (ouverte)')] : []),
    text(' : '),
    ...(opened && before.length === 0
      ? orderList(round['after'])
      : [text('de '), ...orderList(before), text(' à '), ...orderList(round['after'])]),
  ];
}

export const DELIVERY_ROUTING_PHRASES = {
  'delivery_routing.settings_updated': (fact) => {
    const label = subjectLabelOf(fact);
    const before = fact.payload['before'];
    return byActor(
      fact,
      [
        text('a réglé '),
        ...(label === null
          ? [text('le calcul des tournées')]
          : [text('le '), subject(fact, inSentence(label))]),
        text(' : '),
        ...settingsTerms(fact.payload['after']),
        text(' ; c’étaient '),
        ...(recordOf(before) === null ? [text('les valeurs par défaut')] : settingsTerms(before)),
      ],
      ['subjectLabel', 'before', 'after'],
    );
  },
  // UN fait pour toute la proposition : le sujet est le jour.
  'delivery_round.proposal_applied': (fact) => {
    const rounds = entries(fact.payload['rounds']);
    return byActor(
      fact,
      [
        text('a appliqué une proposition du calculateur pour le '),
        inUnit('day', fact.payload['day']),
        ...rounds.flatMap((round, index) => [
          text(index === 0 ? ' — ' : ' ; '),
          ...appliedRound(round),
        ]),
      ],
      ['subjectLabel', 'day', 'rounds'],
    );
  },
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
