import type { JournalFactType } from '@lfd/contracts/journal-facts';
import { ORDER_TIME_LIMIT_SCOPE_LABELS } from '@lfd/pim-contracts';

import { optional } from '../payload-read';
import {
  byActor,
  cite,
  citedName,
  countOf,
  inSentence,
  inUnit,
  subject,
  subjectLabelOf,
  text,
  value,
  valueIn,
  type Noun,
  type Phrase,
  type PhraseFact,
  type Said,
  type Segment,
} from '../phrase';
import { formatNumber } from '../units';
import { POINT_OF_SALE_KIND, PRO_PRICE_METHOD } from '../values/referential-values';

import { REFERENTIAL_PROVENANCE_PHRASES } from './referential-provenance-phrases';
import { joined, onSubjectChanges, theSubject } from './referential-support';

/**
 * **Ce qui règle le référentiel** — règles comptables, points et contextes de
 * vente, heures limites (famille `referentialSettings` du catalogue des faits,
 * hors `vat_rate.*`, déjà dans `referential-phrases.ts`) ; la provenance et
 * les allergènes ont leur fichier, réuni ici : le registre n'en connaît qu'un.
 * Valeurs : `values/referential-values.ts`.
 *
 * Écrites au lot D du plan des phrases (2026-09-19), selon le guide en tête de
 * `phrase-registry.ts`.
 */

const POINT_OF_SALE: Noun = { the: 'le point de vente', a: 'un point de vente' };
const OF_POINT_OF_SALE: Noun = { the: 'du point de vente', a: 'd’un point de vente' };
const SALES_CONTEXT: Noun = { the: 'le contexte de vente', a: 'un contexte de vente' };

// ─── Les règles comptables ────────────────────────────────────────────────

/** « les règles comptables », en gras quand la ligne a figé leur libellé. */
function theRules(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  return [
    text('les '),
    label === null ? text('règles comptables') : subject(fact, inSentence(label)),
  ];
}

/** « a changé, dans les règles comptables, la méthode du prix professionnel de « A » à « B » ». */
function methodChanged(fact: PhraseFact): Said {
  const method = (raw: unknown): Segment[] => [
    text('« '),
    valueIn(PRO_PRICE_METHOD, raw),
    text(' »'),
  ];
  return byActor(
    fact,
    [
      text('a changé, dans '),
      ...theRules(fact),
      text(', la méthode du prix professionnel de '),
      ...method(fact.payload['from']),
      text(' à '),
      ...method(fact.payload['to']),
    ],
    ['subjectLabel', 'from', 'to'],
  );
}

/**
 * « a passé, dans les règles comptables, le prix professionnel de 90 % à 88 %
 * du prix public » — « a fixé … à 90 % » au premier réglage (`from: null`).
 */
function proRatioChanged(fact: PhraseFact): Said {
  const from = fact.payload['from'];
  const to = inUnit('basisPoints', fact.payload['to']);
  const change =
    from === null || from === undefined
      ? [text(' le prix professionnel à '), to]
      : [text(' le prix professionnel de '), inUnit('basisPoints', from), text(' à '), to];
  return byActor(
    fact,
    [
      text(from === null || from === undefined ? 'a fixé, dans ' : 'a passé, dans '),
      ...theRules(fact),
      text(','),
      ...change,
      text(' du prix public'),
    ],
    ['subjectLabel', 'from', 'to'],
  );
}

// ─── Les points de vente ──────────────────────────────────────────────────

/** Le libellé en clair d'un point de vente est son libellé figé : consommé s'il le redit. */
function sameLabel(fact: PhraseFact): string[] {
  const label = optional(fact.payload['label']);
  const frozen = subjectLabelOf(fact);
  return label !== null && (frozen === null || frozen === label) ? ['label'] : [];
}

/** « , avec 12 tables », « , sans table » — rien si la ligne n'a pas figé de compte. */
function tables(raw: unknown): Segment[] {
  if (raw === 0) {
    return [text(', sans table')];
  }
  const counted = countOf(raw, 'table', 'tables');
  return counted === null ? [] : [text(', avec '), counted];
}

/**
 * « a créé le point de vente « Gare » (boutique), qui offre « À emporter » et
 * « Sur place », avec 12 tables ». Les contextes d'avant le lot B ne sont que
 * des clés : au détail.
 */
function pointOfSaleCreated(fact: PhraseFact): Said {
  const p = fact.payload;
  const kind = optional(p['kind']);
  const contexts = Array.isArray(p['contexts']) ? p['contexts'] : null;
  const named =
    contexts !== null && contexts.every((context: unknown) => citedName(context) !== null);
  const offers =
    contexts === null || !named
      ? []
      : contexts.length === 0
        ? [text(', qui n’offre aucun contexte de vente')]
        : [
            text(', qui offre '),
            ...joined(contexts.map((context: unknown) => cite({ the: '', a: '' }, context))),
          ];
  return byActor(
    fact,
    [
      text('a créé '),
      ...theSubject(fact, POINT_OF_SALE, optional(p['label'])),
      ...(kind === null
        ? []
        : [text(' ('), valueIn(POINT_OF_SALE_KIND, kind, { inSentence: true }), text(')')]),
      ...offers,
      ...tables(p['tableCount']),
    ],
    [
      'subjectLabel',
      ...sameLabel(fact),
      'kind',
      ...(named ? ['contexts'] : []),
      ...(typeof p['tableCount'] === 'number' ? ['tableCount'] : []),
    ],
  );
}

/** « a supprimé le point de vente « Gare » et ses 12 tables ». */
function pointOfSaleDeleted(fact: PhraseFact): Said {
  const count = fact.payload['tableCount'];
  const counted = countOf(count, 'table', 'tables');
  const rest =
    count === 0 ? [text(' (sans table)')] : counted === null ? [] : [text(' et ses '), counted];
  return byActor(
    fact,
    [
      text('a supprimé '),
      ...theSubject(fact, POINT_OF_SALE, optional(fact.payload['label'])),
      ...rest,
    ],
    ['subjectLabel', ...sameLabel(fact), ...(typeof count === 'number' ? ['tableCount'] : [])],
  );
}

/** « a généré le QR code de la table 4 du point de vente « Gare » ». */
function tableQr(verb: string): Phrase {
  return (fact) => {
    const table = fact.payload['table'];
    return byActor(
      fact,
      [
        text(`${verb} le QR code de `),
        ...(typeof table === 'number'
          ? [text('la table '), value(formatNumber(table))]
          : [text('une table')]),
        text(' '),
        ...theSubject(fact, OF_POINT_OF_SALE),
      ],
      ['subjectLabel', 'table'],
    );
  };
}

// ─── Les contextes de vente ───────────────────────────────────────────────

/** « a créé le contexte de vente « Livraison », actif ». La clé et Shopify restent au détail. */
function salesContextCreated(fact: PhraseFact): Said {
  const active = fact.payload['active'];
  return byActor(
    fact,
    [
      text('a créé '),
      ...theSubject(fact, SALES_CONTEXT, optional(fact.payload['label'])),
      ...(typeof active === 'boolean' ? [text(active ? ', actif' : ', inactif')] : []),
    ],
    ['subjectLabel', ...sameLabel(fact), ...(typeof active === 'boolean' ? ['active'] : [])],
  );
}

function salesContextDeleted(fact: PhraseFact): Said {
  return byActor(
    fact,
    [text('a supprimé '), ...theSubject(fact, SALES_CONTEXT, optional(fact.payload['label']))],
    ['subjectLabel', ...sameLabel(fact)],
  );
}

// ─── Les heures limites de commande ───────────────────────────────────────

/**
 * La portée d'une limite, en mots : son libellé figé (« Famille « Tartes » »,
 * lot B), sinon sa clé lue — `global:`, `category:<id>`… —, avec les mots de
 * l'écran des réglages et l'identifiant de la cible, jamais un nom inventé.
 */
function scopeOf(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  if (label !== null) {
    return [subject(fact, label)];
  }
  const scope = optional(fact.payload['scope']);
  if (scope === null) {
    return [text('une portée inconnue')];
  }
  const [type = '', ...rest] = scope.split(':');
  const id = rest.join(':');
  const kind = Object.hasOwn(ORDER_TIME_LIMIT_SCOPE_LABELS, type)
    ? ORDER_TIME_LIMIT_SCOPE_LABELS[type as keyof typeof ORDER_TIME_LIMIT_SCOPE_LABELS]
    : type;
  return [text(id === '' ? kind : `${kind} (identifiant ${id})`)];
}

/**
 * « 1 jour avant, à 17:30, 15 min de tolérance ». Une valeur `null` — « ce
 * rang ne se prononce pas » — n'est pas dite : le détail la rend.
 */
function limitValues(payload: Readonly<Record<string, unknown>>): {
  readonly segments: Segment[];
  readonly said: string[];
} {
  const parts: Segment[][] = [];
  const said: string[] = [];
  const days = payload['daysBefore'];
  if (typeof days === 'number') {
    parts.push(days === 0 ? [text('le jour même')] : [inUnit('days', days), text(' avant')]);
    said.push('daysBefore');
  }
  if (optional(payload['time']) !== null) {
    parts.push([text('à '), inUnit('clockTime', payload['time'])]);
    said.push('time');
  }
  if (typeof payload['graceMinutes'] === 'number') {
    parts.push([inUnit('minutes', payload['graceMinutes']), text(' de tolérance')]);
    said.push('graceMinutes');
  }
  const segments = parts.flatMap((part, index) => (index === 0 ? part : [text(', '), ...part]));
  return { segments: parts.length === 0 ? [] : [text(' : '), ...segments], said };
}

/** « a réglé l'heure limite de commande (Toute la production) : 1 jour avant, à 17:30 ». */
function timeLimitSet(fact: PhraseFact): Said {
  const values = limitValues(fact.payload);
  return byActor(
    fact,
    [text('a réglé l’heure limite de commande ('), ...scopeOf(fact), text(')'), ...values.segments],
    ['subjectLabel', 'scope', ...values.said],
  );
}

/** « a supprimé l'heure limite de commande (Famille « Tartes ») » — ce qu'elle valait, au détail. */
function timeLimitRemoved(fact: PhraseFact): Said {
  return byActor(
    fact,
    [text('a supprimé l’heure limite de commande ('), ...scopeOf(fact), text(')')],
    ['subjectLabel', 'scope'],
  );
}

export const REFERENTIAL_SETTINGS_PHRASES = {
  ...REFERENTIAL_PROVENANCE_PHRASES,

  'accounting_rules.method_changed': methodChanged,
  'accounting_rules.pro_ratio_changed': proRatioChanged,

  'point_of_sale.created': pointOfSaleCreated,
  'point_of_sale.updated': onSubjectChanges(POINT_OF_SALE),
  'point_of_sale.deleted': pointOfSaleDeleted,
  'point_of_sale.table_qr_generated': tableQr('a généré'),
  'point_of_sale.table_qr_removed': tableQr('a retiré'),

  'sales_context.created': salesContextCreated,
  'sales_context.updated': onSubjectChanges(SALES_CONTEXT),
  'sales_context.deleted': salesContextDeleted,

  'order_time_limit.set': timeLimitSet,
  'order_time_limit.removed': timeLimitRemoved,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
