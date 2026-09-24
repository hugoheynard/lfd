import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { optional, recordOf, strings } from '../payload-read';
import {
  byActor,
  inUnit,
  name,
  said,
  subject,
  subjectLabelOf,
  text,
  value,
  valueIn,
  type Phrase,
  type PhraseFact,
  type Segment,
} from '../phrase';
import { APPOINTMENT_CHANNEL, LEAD_STATUS, PLAY } from '../values/commerce-values';

/**
 * **Le commerce** — catalogue vendu aux pros, prospects, rendez-vous,
 * recommandations du cockpit (famille `commerce` du catalogue des faits, lot D
 * du plan des phrases, 2026-09-19). Guide : en tête de `phrase-registry.ts`.
 *
 * Un article se dit par son nom, le SKU à côté : « « Tarte citron »
 * (TAR-001) » ; une ligne d'avant le lot B, sans nom, le dit par son SKU seul —
 * c'est le sujet de la ligne, et le mot du métier.
 */

/** « « Tarte citron » (TAR-001) », ou « l'article TAR-001 » sans nom figé. */
function article(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  const sku = optional(fact.payload['sku']) ?? optional(fact.subjectId);
  if (label === null) {
    return sku === null ? [text('un article')] : [text('l’article '), subject(fact, sku)];
  }
  return [
    text('« '),
    subject(fact, label),
    text(' »'),
    ...(sku === null ? [] : [text(' ('), value(sku), text(')')]),
  ];
}

const ARTICLE_KEYS = ['subjectLabel', 'sku'];

/** « l'opération « Noël 2026 » », ou « l'opération noel-2026 » sans nom figé. */
function operation(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact);
  if (label === null) {
    return [text('l’opération '), subject(fact, optional(fact.subjectId) ?? '')];
  }
  return [text('l’opération « '), subject(fact, label), text(' »')];
}

/** « … a masqué « Tarte citron » (TAR-001) du catalogue professionnel ». */
function onArticle(before: string, after: string): Phrase {
  return (fact) => byActor(fact, [text(before), ...article(fact), text(after)], ARTICLE_KEYS);
}

/** « 9,00 € HT » — un prix professionnel unitaire, figé en millicentimes. */
function price(raw: unknown): Segment[] {
  return [inUnit('millicents', recordOf(raw)?.['priceMillicents']), text(' HT')];
}

/**
 * « 2,99 € TTC » — l'étiquette PUBLIQUE, figée en centimes.
 *
 * ⚠️ Jumelle de {@link price} et distincte à dessein : l'unité diffère, et
 * réutiliser l'autre relirait 299 comme des millicentimes — « 0,00299 € » sur
 * un croissant à 2,99 €. Et c'est bien « TTC » qui se dit, pas « HT » : c'est
 * ce qui différencie les deux lignes quand elles se suivent au journal.
 */
function publicPrice(raw: unknown): Segment[] {
  return [inUnit('cents', recordOf(raw)?.['ttcCents']), text(' TTC')];
}

/**
 * « … a fixé le prix professionnel de « Tarte citron » (TAR-001) de 8,18182 € HT
 * à 9,00 € HT » ; sans prix d'avant (le premier) : « … à 9,00 € HT ».
 */
const priceSet: Phrase = (fact) => {
  const before = recordOf(fact.payload['before']);
  return byActor(
    fact,
    [
      text('a fixé le prix professionnel de '),
      ...article(fact),
      ...(before === null ? [] : [text(' de '), ...price(before)]),
      text(' à '),
      ...price(fact.payload['after']),
    ],
    [...ARTICLE_KEYS, 'before', 'after'],
  );
};

/** Au-delà, la phrase compte les articles écartés et laisse leur liste au détail. */
const LISTED_SKUS = 5;

/**
 * « … a accepté une arrivée du référentiel, en écartant 2 articles : TAR-001,
 * TAR-002 ». Ni l'arrivée, ni la révision, ni la version n'ont de nom : leurs
 * identifiants restent au détail.
 */
const deliveryAccepted: Phrase = (fact) => {
  const skus = strings(fact.payload['excludedSkus']);
  const listed = skus.length <= LISTED_SKUS;
  const excluded =
    skus.length === 0
      ? [text(', sans écarter d’article')]
      : [
          text(', en écartant '),
          value(`${skus.length} ${skus.length > 1 ? 'articles' : 'article'}`),
          ...(listed ? [text(' : '), value(skus.join(', '))] : []),
        ];
  return byActor(
    fact,
    [text('a accepté une arrivée du référentiel'), ...excluded],
    listed ? ['excludedSkus'] : [],
  );
};

// ─── Les prospects ──────────────────────────────────────────────────────────

/** « le prospect « Café des Halles » », ou « un prospect » sans nom figé. */
function lead(fact: PhraseFact): Segment[] {
  const label = subjectLabelOf(fact) ?? optional(fact.payload['businessName']);
  return label === null
    ? [text('un prospect')]
    : [text('le prospect « '), subject(fact, label), text(' »')];
}

/**
 * « … a converti le prospect « X » en client » (à la main), ou « Le prospect
 * « X » a été rapproché de la personne qui s'est inscrite » : ce rapprochement
 * se fait à l'inscription, sans que l'auteur de la ligne l'ait décidé.
 */
const leadConverted: Phrase = (fact) => {
  if (fact.payload['via'] === 'registration') {
    const linked = optional(fact.payload['linkedUserId']);
    return said(
      [
        ...capitalized(lead(fact)),
        text(' a été rapproché d’une personne à son inscription'),
        ...(linked === null ? [] : [text(` (identifiant ${linked})`)]),
      ],
      ['subjectLabel', 'via', 'linkedUserId'],
    );
  }
  return byActor(
    fact,
    [text('a converti '), ...lead(fact), text(' en client')],
    ['subjectLabel', 'via'],
  );
};

/** La première lettre d'une phrase passive qui commence par un nom commun. */
function capitalized(segments: readonly Segment[]): Segment[] {
  const [first, ...rest] = segments;
  if (first === undefined || first.kind !== 'text') {
    return [...segments];
  }
  return [text(`${first.text.charAt(0).toUpperCase()}${first.text.slice(1)}`), ...rest];
}

// ─── Les rendez-vous ────────────────────────────────────────────────────────

/** Comment le sujet d'une ligne se dit quand ce n'est pas une personne. */
const NAMED_SUBJECTS: Readonly<Record<string, string>> = {
  company: 'le client',
  lead: 'le prospect',
};

/**
 * Avec qui : le client, le prospect (« le prospect « X » »), ou la personne
 * par son nom, sans guillemets — rien sur une ligne qui n'en porte pas.
 */
function withWhom(fact: PhraseFact, joint: string): Segment[] {
  const label = subjectLabelOf(fact);
  if (label === null) {
    return [];
  }
  const noun = Object.hasOwn(NAMED_SUBJECTS, fact.subjectType)
    ? NAMED_SUBJECTS[fact.subjectType]
    : undefined;
  return noun === undefined
    ? [text(`${joint} `), subject(fact, label)]
    : [text(`${joint} ${noun} « `), subject(fact, label), text(' »')];
}

/** « du 19 septembre 2026 à 10:00 » — ou rien, si l'instant n'a pas été figé. */
function when(raw: unknown): Segment[] {
  return optional(raw) === null ? [] : [text(' du '), inUnit('instant', raw)];
}

/**
 * « … a demandé un rendez-vous pour le 19 septembre 2026 à 10:00 (visio), avec
 * le client « X » ».
 */
const appointmentRequested: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a demandé un rendez-vous pour le '),
      inUnit('instant', fact.payload['startAt']),
      text(' ('),
      valueIn(APPOINTMENT_CHANNEL, fact.payload['channel'], { inSentence: true }),
      text(')'),
      ...withWhom(fact, ', avec'),
    ],
    ['subjectLabel', 'startAt', 'channel'],
  );

/**
 * « … a annulé le rendez-vous avec le client « X » (motif : …) ». `via` redit
 * l'auteur : le client annule sans motif, l'équipe avec le sien.
 */
const appointmentCancelled: Phrase = (fact) => {
  const reason = optional(fact.payload['reason']);
  return byActor(
    fact,
    [
      text('a annulé le rendez-vous'),
      ...withWhom(fact, ' avec'),
      ...(reason === null ? [] : [text(' (motif : '), name(reason), text(')')]),
    ],
    ['subjectLabel', 'via', 'reason'],
  );
};

/**
 * Un rendez-vous tenu ou manqué. La forme d'avant le lot B portait un `reason`
 * toujours vide (il recopiait le motif d'annulation) : la phrase le consomme
 * vide, et le laisse au détail s'il porte quelque chose.
 */
function appointmentOutcome(end: string): Phrase {
  return (fact) =>
    byActor(
      fact,
      [text('a noté que le rendez-vous'), ...withWhom(fact, ' avec'), text(end)],
      ['subjectLabel', 'via', ...(optional(fact.payload['reason']) === null ? ['reason'] : [])],
    );
}

// ─── Le cockpit ─────────────────────────────────────────────────────────────

/**
 * « Coup « Verrouiller » recommandé pour le client « X » (score : 80 sur 100) ».
 * Au passif et sans agent : c'est le cockpit qui l'a affiché, pas l'auteur de
 * la ligne qui l'a choisi.
 */
const recoShown: Phrase = (fact) => {
  const score = fact.payload['score'];
  return said(
    [
      text('Coup « '),
      valueIn(PLAY, fact.payload['play']),
      text(' » recommandé'),
      ...withWhom(fact, ' pour'),
      ...(typeof score === 'number'
        ? [text(' (score : '), value(`${score} sur 100`), text(')')]
        : []),
    ],
    ['subjectLabel', 'play', 'score'],
  );
};

/**
 * « … a fixé le prix public de « Tarte citron » (TAR-001) de 2,50 € TTC à
 * 2,99 € TTC » ; sans prix d'avant : « … à 2,99 € TTC ».
 */
const publicPriceSet: Phrase = (fact) => {
  const before = recordOf(fact.payload['before']);
  return byActor(
    fact,
    [
      text('a fixé le prix public de '),
      ...article(fact),
      ...(before === null ? [] : [text(' de '), ...publicPrice(before)]),
      text(' à '),
      ...publicPrice(fact.payload['after']),
    ],
    [...ARTICLE_KEYS, 'before', 'after'],
  );
};

export const COMMERCE_PHRASES = {
  'catalog_item.b2b_price_set': priceSet,
  'catalog_item.public_price_set': publicPriceSet,
  'catalog_item.public_price_cleared': (fact) =>
    byActor(
      fact,
      [
        text('a retiré le prix public de '),
        ...article(fact),
        text(', qui était de '),
        ...publicPrice(fact.payload['before']),
      ],
      [...ARTICLE_KEYS, 'before'],
    ),
  'catalog_item.b2b_price_cleared': (fact) =>
    byActor(
      fact,
      [
        text('a retiré le prix professionnel de '),
        ...article(fact),
        text(', qui était de '),
        ...price(fact.payload['before']),
      ],
      [...ARTICLE_KEYS, 'before'],
    ),
  'catalog_item.hidden': onArticle('a masqué ', ' du catalogue professionnel'),
  'catalog_item.shown': onArticle('a remis ', ' au catalogue professionnel'),
  'catalog_item.hidden_public': onArticle('a masqué ', ' de la boutique publique'),
  'catalog_item.shown_public': onArticle('a remis ', ' en boutique publique'),
  'catalog_item.featured': onArticle('a mis en avant ', ' dans le catalogue professionnel'),
  'catalog_item.unfeatured': onArticle('a cessé de mettre en avant ', ''),
  'catalog_delivery.accepted': deliveryAccepted,
  // La surcharge d'une opération datée reçue (D9, lot 2 du plan des opérations
  // datées, 2026-09-24). Le détail dit ce qui est restreint.
  'catalog_operation.override_set': (fact) =>
    byActor(fact, [text('a restreint à la réception '), ...operation(fact)], ['subjectLabel']),

  'lead.captured': (fact) =>
    byActor(fact, [text('a saisi '), ...lead(fact)], ['subjectLabel', 'businessName']),
  'lead.stage_changed': (fact) =>
    byActor(
      fact,
      [
        text('a passé '),
        ...lead(fact),
        text(' à l’étape « '),
        valueIn(LEAD_STATUS, fact.payload['status']),
        text(' »'),
      ],
      ['subjectLabel', 'status'],
    ),
  'lead.converted': leadConverted,
  'lead.lost': (fact) =>
    byActor(fact, [text('a classé '), ...lead(fact), text(' comme perdu')], ['subjectLabel']),

  'appointment.requested': appointmentRequested,
  'appointment.confirmed': (fact) =>
    byActor(
      fact,
      [
        text('a confirmé le rendez-vous'),
        ...when(fact.payload['startAt']),
        ...withWhom(fact, ' avec'),
      ],
      ['subjectLabel', 'startAt', 'via'],
    ),
  'appointment.cancelled': appointmentCancelled,
  'appointment.honored': appointmentOutcome(' a bien eu lieu'),
  'appointment.no_show': appointmentOutcome(' n’a pas été honoré'),

  'reco.shown': recoShown,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
