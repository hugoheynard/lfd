import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { count, optional, recordOf, text as orDash } from '../payload-read';
import {
  byActor,
  cite,
  countOf,
  fromTo,
  inUnit,
  name,
  said,
  subject,
  subjectLabelOf,
  text,
  value,
  type Noun,
  type Phrase,
  type PhraseFact,
  type Said,
  type Segment,
} from '../phrase';
import { formatCount, formatUnit } from '../units';

/**
 * **La vie d'une commande et la journée du fournil** — la passation, reprise de
 * `factSentence` (plan des phrases, lot C, 2026-09-19), le colisage et le
 * retrait, les dérogations d'heure limite et la surtaxe qu'elles déclenchent,
 * le plan d'une journée et le contenant d'un article (lot D).
 */

/**
 * Qui a fait le geste d'une commande, quand la charge cite la fiche staff
 * (`readyBy`, `handedOverBy`) : son nom du moment (lot B) en sujet de la
 * phrase. Les lignes d'avant ne la citent que par son identifiant — et c'est
 * alors **l'auteur de la ligne** qui la nomme : le fait s'écrit dans le
 * contexte de la requête du geste. L'identifiant nu reste au détail
 * (« (identifiant …) ») : c'est lui qui départage le cas du rescan, où l'auteur
 * n'est pas celui qui a colisé.
 */
function staffGesture(
  fact: PhraseFact,
  byKey: string,
  rest: readonly Segment[],
  consumed: readonly string[],
): Said {
  const cited = recordOf(fact.payload[byKey]);
  const by = cited === null ? null : optional(cited['name']);
  if (by !== null) {
    return said([name(by), ...rest], [...consumed, byKey]);
  }
  return { ...said([text(fact.actor), ...rest], consumed), namesActor: true };
}

/**
 * Le colisage : « Cécile Martin a déclaré la commande ORD-142 prête ».
 *
 * Le fait s'écrit dans le contexte de la requête du scan (`POST
 * …/sheets/:reference/packed` → `OrderPackedEvent` → `MarkOrderReadyCommand` →
 * `OrderReadyEvent` → `OnOrderReady`, tout en processus, sans quitter le
 * contexte de requête ; vérifié le 2026-09-19). Seule réserve : un rescan qui
 * rattrape un abonné en échec écrit la ligne sous le nom de celui qui a
 * RESCANNÉ, `readyBy` restant celui du premier scan.
 */
function orderReady(fact: PhraseFact): Said {
  return staffGesture(
    fact,
    'readyBy',
    [text(' a déclaré la commande '), name(orDash(fact.payload['orderNumber'])), text(' prête')],
    ['orderNumber'],
  );
}

/** Comment le retrait a été validé, en fin de phrase ; une valeur inconnue reste au détail. */
const HANDOVER_HOW: Readonly<Record<string, string>> = {
  scan: ' en scannant le QR du client',
  manual: ' à la main, sans le QR',
};

/**
 * Le retrait : « Cécile Martin a validé le retrait de la commande ORD-142 en
 * scannant le QR du client ». Mêmes règles d'auteur que le colisage : le fait
 * s'écrit dans la requête qui confirme le retrait (`ConfirmHandoverHandler` →
 * `OrderHandedOverEvent` du retrait → `MarkOrderFulfilledCommand` →
 * `OrderHandedOverEvent` du commerce → `OnOrderHandedOver` du journal, tout en
 * processus ; lu le 2026-09-19).
 * « Retrait » et non « remise » : ce mot-là est réservé à la réduction de prix
 * (CLAUDE.md racine, §8).
 */
function orderHandedOver(fact: PhraseFact): Said {
  const via = optional(fact.payload['via']);
  const how = via !== null && Object.hasOwn(HANDOVER_HOW, via) ? HANDOVER_HOW[via] : undefined;
  return staffGesture(
    fact,
    'handedOverBy',
    [
      text(' a validé le retrait de la commande '),
      name(orDash(fact.payload['orderNumber'])),
      ...(how === undefined ? [] : [text(how)]),
    ],
    how === undefined ? ['orderNumber'] : ['orderNumber', 'via'],
  );
}

/** Le client d'une dérogation : nommé depuis le lot B, par son seul id avant. */
const TO_CLIENT: Noun = { the: 'au client', a: 'à un client' };

/** « au client « Café des Halles » pour le 19 septembre 2026 » — la forme courante ou d'avant. */
function waiverTarget(fact: PhraseFact): Segment[] {
  const day = fact.payload['fulfillmentDate'];
  return [
    text(' '),
    ...cite(TO_CLIENT, fact.payload['company'] ?? fact.payload['companyId']),
    ...(typeof day === 'string' ? [text(' pour le '), inUnit('day', day)] : []),
  ];
}

/** Ce qu'une dérogation dit toujours : le client (nommé ou non) et la journée. Le motif reste au détail. */
const WAIVER_CONSUMED = ['company', 'companyId', 'fulfillmentDate'];

/**
 * « 5,00 € HT (TVA 20 %) », « 10 % du sous-total (TVA 20 %) » — un réglage de
 * surtaxe, comme la page du réglage le récapitule. Le montant fixe est en
 * centimes **HT** (`cartAdjustmentSchema`, `@lfd/contracts`).
 */
function lateFeeTerms(raw: unknown): Segment[] {
  const setting = recordOf(raw);
  const fee = recordOf(setting?.['fee']);
  const bp = count(fee?.['bp']);
  const cents = count(fee?.['cents']);
  const amount =
    bp !== null
      ? [inUnit('basisPoints', bp), text(' du sous-total')]
      : cents !== null
        ? [inUnit('cents', cents), text(' HT')]
        : [value('—')];
  const vat = setting?.['vatRatePercent'];
  return [
    ...amount,
    ...(typeof vat === 'number' ? [text(' (TVA '), inUnit('percent', vat), text(')')] : []),
  ];
}

/**
 * « 12 unités par plaque » — un contenant, tel que la fiche d'atelier l'annonce
 * au four. Le pluriel ne s'ajoute que s'il ne se devine pas (« tourneau »,
 * « tourneaux ») : c'est le seul cas où il apprend quelque chose.
 */
function containerTerms(raw: unknown): Segment[] {
  const rule = recordOf(raw);
  const units = count(rule?.['unitsPerContainer']);
  const singular = optional(rule?.['singular']);
  const plural = optional(rule?.['plural']);
  if (units === null || singular === null) {
    return [value('—')];
  }
  const irregular = plural !== null && plural !== `${singular}s`;
  return [
    value(formatCount(units, 'unité', 'unités')),
    text(` par ${singular}${irregular ? ` (au pluriel « ${plural} »)` : ''}`),
  ];
}

/**
 * L'article d'un contenant, par son SKU : la production ne lit pas le
 * référentiel, le SKU est le nom le plus lisible qu'elle connaisse. Il est
 * aussi l'identifiant du sujet (`subjectId`), ce qui nomme les lignes d'avant
 * le lot B, sans `subjectLabel`.
 */
function containerArticle(fact: PhraseFact): Segment[] {
  const sku = subjectLabelOf(fact) ?? optional(fact.subjectId);
  return sku === null ? [text('d’un article')] : [text('de l’article '), subject(fact, sku)];
}

/**
 * « du 19 septembre 2026 » — la journée par sa date de service. Le libellé
 * (`subjectLabel`) EST cette date en ISO : le dire tel quel afficherait
 * `2026-09-19`.
 */
function serviceDay(fact: PhraseFact): Segment[] {
  const day = optional(fact.payload['serviceDay']) ?? subjectLabelOf(fact);
  const formatted = day === null ? null : formatUnit('day', day);
  return formatted === null ? [text('d’une journée')] : [text('du '), subject(fact, formatted)];
}

function productionDay(verb: string, singular: string, plural: string): Phrase {
  return (fact) => {
    const absorbed = countOf(fact.payload['absorbed'], singular, plural);
    return byActor(
      fact,
      [
        text(`${verb} le plan `),
        ...serviceDay(fact),
        ...(absorbed === null ? [] : [text(' : '), absorbed]),
      ],
      ['subjectLabel', 'serviceDay', 'absorbed'],
    );
  };
}

export const ORDERS_PHRASES = {
  // Le NUMÉRO d'abord : c'est par lui qu'on retrouve une commande, pas par son
  // identifiant technique.
  'order.placed': (fact) =>
    said(
      [text('Commande '), name(orDash(fact.payload['orderNumber'])), text(' passée')],
      ['orderNumber'],
    ),
  'order.ready': orderReady,
  'order.handed_over': orderHandedOver,

  'order_cutoff_waiver.granted': (fact) =>
    byActor(
      fact,
      [text('a accordé une dérogation à l’heure limite'), ...waiverTarget(fact)],
      WAIVER_CONSUMED,
    ),
  'order_cutoff_waiver.revoked': (fact) =>
    byActor(
      fact,
      [text('a retiré la dérogation à l’heure limite accordée'), ...waiverTarget(fact)],
      WAIVER_CONSUMED,
    ),

  'order_late_fee.set': (fact) => {
    const before = fact.payload['before'];
    const after = lateFeeTerms(fact.payload['after']);
    return byActor(
      fact,
      recordOf(before) === null
        ? [text('a posé la surtaxe de retard : '), ...after]
        : [text('a passé la surtaxe de retard '), ...fromTo(lateFeeTerms(before), after)],
      ['before', 'after'],
    );
  },
  'order_late_fee.cleared': (fact) =>
    byActor(
      fact,
      [
        text('a retiré la surtaxe de retard, qui était de '),
        ...lateFeeTerms(fact.payload['before']),
        text(' : les dérogations ne coûtent plus rien'),
      ],
      ['before'],
    ),

  'production_day.closed': productionDay('a arrêté', 'commande inscrite', 'commandes inscrites'),
  'production_day.retaken': productionDay('a repris', 'commande ajoutée', 'commandes ajoutées'),

  'production_container.set': (fact) => {
    const before = fact.payload['before'];
    const after = containerTerms(fact.payload['after']);
    return byActor(
      fact,
      [
        text('a réglé le contenant '),
        ...containerArticle(fact),
        text(' : '),
        ...(recordOf(before) === null ? after : fromTo(containerTerms(before), after)),
      ],
      ['subjectLabel', 'before', 'after'],
    );
  },
  'production_container.removed': (fact) =>
    byActor(
      fact,
      [
        text('a retiré le contenant '),
        ...containerArticle(fact),
        text(', qui était de '),
        ...containerTerms(fact.payload['before']),
      ],
      ['subjectLabel', 'before'],
    ),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
