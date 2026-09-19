import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { nameOf, optional, recordOf } from '../payload-read';
import {
  byActor,
  cite,
  citedName,
  fromTo,
  NO_CHANGE,
  subject,
  text,
  valueIn,
  whatChanged,
  type Noun,
  type Phrase,
  type PhraseFact,
  type Said,
  type Segment,
} from '../phrase';
import { PRODUCT_KIND } from '../values/referential-values';

import { REFERENTIAL_CATEGORY_PHRASES } from './referential-category-phrases';
import { REFERENTIAL_VARIANT_PHRASES } from './referential-variant-phrases';
import { REFERENTIAL_VAT_PHRASES } from './referential-vat-phrases';
import { joined, saidName, shift, skuAside, theSubject, unchanged } from './referential-support';

/**
 * **Le référentiel — les fiches** (famille `referentialCatalogue` du catalogue
 * des faits). Les taux de TVA, les déclinaisons, les familles et les révisions
 * ont chacun leur fichier, réuni ici : le registre n'en connaît qu'un.
 *
 * Toutes à la voix active, l'auteur en sujet (lot D, 2026-09-19) — la mise en
 * vente comprise, reprise au passif de `shared/journal-fact.ts` au lot C.
 */

/**
 * Le nom de la fiche : son libellé figé (D6) quand la ligne en porte un, sinon
 * le nom de la charge — une chaîne, ou le français d'un texte traduisible.
 */
function productName(payload: Readonly<Record<string, unknown>>): string {
  return nameOf(payload['subjectLabel']) ?? nameOf(payload['name']) ?? '—';
}

/**
 * « a publié la fiche « Tarte citron » (TAR-001) au catalogue », « a retiré de
 * la vente la fiche … » : la fiche en sujet (liée), et son SKU à côté.
 */
function onSale(verb: string, end: string): Phrase {
  return (fact) =>
    byActor(
      fact,
      [
        text(`${verb} la fiche « `),
        subject(fact, productName(fact.payload)),
        text(' »'),
        ...skuAside(fact.payload['sku']),
        text(end),
      ],
      ['subjectLabel', 'name', 'sku'],
    );
}

/** La fiche en complément : « « Tarte citron » », sinon « une fiche ». */
const PRODUCT: Noun = { the: 'la fiche', a: 'une fiche' };
const OF_PRODUCT: Noun = { the: 'de', a: 'd’une fiche' };
const TO_PRODUCT: Noun = { the: 'à', a: 'à une fiche' };
const IN_FAMILY: Noun = { the: 'dans la famille', a: 'dans une famille' };
const FAMILY: Noun = { the: 'la famille', a: 'une famille' };

/** La fiche d'une ligne d'avant le lot B se nomme par son nom français, s'il y est. */
function theProduct(fact: PhraseFact, noun: Noun): Segment[] {
  return theSubject(fact, noun, nameOf(fact.payload['name']));
}

/** « a <verbe> la fiche « Tarte citron » (TAR-001) » : cycle de vie d'une fiche. */
function onProduct(verb: string, end = ''): Phrase {
  return (fact) =>
    byActor(
      fact,
      [
        text(`${verb} `),
        ...theProduct(fact, PRODUCT),
        ...skuAside(fact.payload['sku']),
        ...(end === '' ? [] : [text(end)]),
      ],
      ['subjectLabel', 'sku', ...saidName(fact.payload, 'name')],
    );
}

/** « a modifié <section> de « Tarte citron » : description courte, accord ». */
function sectionSaved(section: string, noun: Noun, fields: 'names' | 'none'): Phrase {
  return (fact) =>
    byActor(
      fact,
      [
        text(`a modifié ${section} `),
        ...theSubject(fact, noun),
        ...(fields === 'names'
          ? whatChanged(fact.payload['changes'], fact.type)
          : unchanged(fact.payload['changes'])),
      ],
      ['subjectLabel'],
    );
}

function productCreated(fact: PhraseFact): Said {
  const p = fact.payload;
  const categoryKey = p['category'] === undefined ? 'categoryId' : 'category';
  const kind = optional(p['kind']);
  const declared = p['declared'];
  const declaration =
    typeof declared === 'boolean'
      ? [text(declared ? ', avec sa fiche réglementaire' : ', sans fiche réglementaire')]
      : [];
  return byActor(
    fact,
    [
      text('a créé '),
      ...theProduct(fact, PRODUCT),
      ...skuAside(p['sku']),
      ...(kind === null ? [] : [text(', '), valueIn(PRODUCT_KIND, kind, { inSentence: true })]),
      ...(p[categoryKey] === undefined ? [] : [text(', '), ...cite(IN_FAMILY, p[categoryKey])]),
      ...declaration,
    ],
    ['subjectLabel', 'sku', 'kind', categoryKey, 'declared', ...saidName(p, 'name')],
  );
}

/**
 * « a fait passer « Tarte citron » de la famille « Tartes » à la famille
 * « Entremets » ». Une ligne d'avant le lot B ne cite les familles que par leur
 * id : la phrase ne récite pas deux identifiants, le détail les dit (D5).
 */
function productReclassified(fact: PhraseFact): Said {
  const p = fact.payload;
  if (citedName(p['from']) === null || citedName(p['to']) === null) {
    return byActor(
      fact,
      [text('a changé la famille '), ...theSubject(fact, OF_PRODUCT)],
      ['subjectLabel'],
    );
  }
  return byActor(
    fact,
    [
      text('a fait passer '),
      ...theSubject(fact, PRODUCT),
      text(' '),
      ...fromTo(cite(FAMILY, p['from']), cite(FAMILY, p['to'])),
    ],
    ['subjectLabel', 'from', 'to'],
  );
}

/** La déclinaison que cite un geste sur une fiche : `variant` (nommée), ou `variantId` d'avant. */
function variantOf(payload: Readonly<Record<string, unknown>>): {
  readonly key: string;
  readonly segments: Segment[];
} {
  const key = payload['variant'] === undefined ? 'variantId' : 'variant';
  return {
    key,
    segments:
      payload[key] === undefined
        ? []
        : cite({ the: ', déclinaison', a: ', une déclinaison' }, payload[key]),
  };
}

/** Les prix et poids qu'un diff de tarif sait dire, avec leur unité au catalogue. */
const PRICING_FIELDS = [
  ['priceCents', 'prix TTC', 'cents'],
  ['weightGrams', 'poids', 'grams'],
] as const;

/**
 * « a modifié le tarif de « Tarte citron », déclinaison « 6 parts » : prix TTC
 * de 12,00 € à 13,50 €, poids fixé à 450 g ». Le diff est dit en entier : il
 * n'a que ces deux champs.
 */
function pricingSaved(fact: PhraseFact): Said {
  const p = fact.payload;
  const variant = variantOf(p);
  const changes = recordOf(p['changes']) ?? {};
  const shifts = PRICING_FIELDS.map(([key, label, unit]) =>
    shift(label, unit, changes[key]),
  ).filter((segments): segments is Segment[] => segments !== null);
  const known = new Set<string>(PRICING_FIELDS.map(([key]) => key));
  const complete = Object.keys(changes).every((key) => known.has(key));
  const told = shifts.length === 0 ? [text(` (${NO_CHANGE})`)] : [text(' : '), ...joined(shifts)];
  return byActor(
    fact,
    [text('a modifié le tarif '), ...theSubject(fact, OF_PRODUCT), ...variant.segments, ...told],
    ['subjectLabel', variant.key, ...(complete ? ['changes'] : [])],
  );
}

/** « a modifié la fiche réglementaire de « Tarte citron », déclinaison « 6 parts » : allergènes ». */
function declarationSaved(fact: PhraseFact): Said {
  const variant = variantOf(fact.payload);
  return byActor(
    fact,
    [
      text('a modifié la fiche réglementaire '),
      ...theSubject(fact, OF_PRODUCT),
      ...variant.segments,
      ...whatChanged(fact.payload['changes'], fact.type),
    ],
    ['subjectLabel', variant.key],
  );
}

/**
 * Où la fiche se vend. Le côté `inherited` se dit (« sur les canaux de sa
 * famille ») et se consomme ; une matrice propre reste au détail, point de
 * vente par point de vente.
 */
function channelsChanged(fact: PhraseFact): Said {
  const p = fact.payload;
  if (p['to'] === 'inherited') {
    return byActor(
      fact,
      [
        text('a remis '),
        ...theSubject(fact, PRODUCT),
        text(' sur les canaux de vente de sa famille'),
      ],
      ['subjectLabel', 'to'],
    );
  }
  if (p['from'] === 'inherited') {
    return byActor(
      fact,
      [text('a donné '), ...theSubject(fact, TO_PRODUCT), text(' ses propres canaux de vente')],
      ['subjectLabel', 'from'],
    );
  }
  return byActor(
    fact,
    [text('a modifié les canaux de vente '), ...theSubject(fact, OF_PRODUCT)],
    ['subjectLabel'],
  );
}

/** Les ingrédients d'une fiche : ils ne nomment jamais la fiche (lot B), la phrase la lie. */
function ingredientsSaved(fact: PhraseFact): Said {
  return byActor(
    fact,
    [
      text('a modifié les ingrédients d’'),
      subject(fact, 'une fiche'),
      ...unchanged(fact.payload['changes']),
    ],
    [],
  );
}

export const REFERENTIAL_PHRASES = {
  ...REFERENTIAL_VAT_PHRASES,
  'product.created': productCreated,
  'product.identity_saved': sectionSaved('l’identité', OF_PRODUCT, 'names'),
  'product.reclassified': productReclassified,
  'product.pricing_saved': pricingSaved,
  'product.declaration_saved': declarationSaved,
  'product.editorial_saved': sectionSaved('les textes', OF_PRODUCT, 'names'),
  'product.media_saved': sectionSaved('les visuels', OF_PRODUCT, 'none'),
  'product.channels_changed': channelsChanged,
  'product.declared_ready': onProduct('a déclaré', ' prête à publier'),
  'product.published': onSale('a publié', ' au catalogue'),
  'product.unpublished': onSale('a retiré de la vente', ''),
  'product.archived': onProduct('a archivé'),
  'product.restored': onProduct('a restauré'),
  'product.ingredients_saved': ingredientsSaved,

  ...REFERENTIAL_VARIANT_PHRASES,
  ...REFERENTIAL_CATEGORY_PHRASES,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
