import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { nameOf, optional, recordOf } from '../payload-read';
import {
  byActor,
  cite,
  inUnit,
  name,
  text,
  valueIn,
  type Noun,
  type Phrase,
  type PhraseFact,
  type Said,
  type Segment,
} from '../phrase';
import { VARIANT_ASPECT } from '../values/referential-values';

import { saidName, skuAside, theSubject, untranslated } from './referential-support';

/**
 * **Le référentiel — les déclinaisons d'une fiche** (famille
 * `referentialCatalogue`, lot D du plan des phrases, 2026-09-19). Le sujet de
 * ces lignes est la FICHE (`subjectType: product`) : la déclinaison est dans
 * la charge, et la phrase la nomme en complément.
 *
 * Réunies dans `referential-phrases.ts`, que le registre lit.
 */

const OF_PRODUCT: Noun = { the: 'de', a: 'd’une fiche' };
const TO_PRODUCT: Noun = { the: 'à', a: 'à une fiche' };
const VARIANT: Noun = { the: 'la déclinaison', a: 'une déclinaison' };

/**
 * Ce qu'une déclinaison aligne sur le défaut, avec son article — puis ce
 * qu'elle reprend quand elle s'en détache. Une section inconnue se dit par son
 * mot du dictionnaire (`VARIANT_ASPECT`), entre guillemets.
 */
const ASPECTS: Readonly<Record<string, { readonly aligned: string; readonly own: string }>> = {
  // `regulatory` est l'ANCIENNE section entière, et elle reste : des faits la
  // portent déjà. Elle vaut `allergens` depuis le 2026-09-22 — la fiche
  // s'aligne par moitié —, mais les phrases passées disaient bien « la fiche
  // réglementaire », et les relire autrement serait leur faire dire ce qu'on
  // n'a pas écrit ce jour-là.
  regulatory: { aligned: 'la fiche réglementaire', own: 'sa propre fiche réglementaire' },
  allergens: { aligned: 'les allergènes', own: 'ses propres allergènes' },
  nutrition: { aligned: 'les valeurs nutritionnelles', own: 'ses propres valeurs nutritionnelles' },
  pricing: { aligned: 'le tarif', own: 'son propre tarif' },
};

function aspectWords(raw: unknown): { readonly aligned: Segment[]; readonly own: Segment[] } {
  const known = typeof raw === 'string' && Object.hasOwn(ASPECTS, raw) ? ASPECTS[raw] : undefined;
  if (known !== undefined) {
    return { aligned: [text(known.aligned)], own: [text(known.own)] };
  }
  const word = [text('« '), valueIn(VARIANT_ASPECT, raw), text(' »')];
  return { aligned: [text('la section '), ...word], own: [text('sa propre section '), ...word] };
}

/**
 * « a aligné le tarif de la déclinaison TAR-001-6 de « Tarte citron » sur la
 * déclinaison par défaut », ou « a rendu à la déclinaison TAR-001-6 de « Tarte
 * citron » son propre tarif ». La charge ne nomme la déclinaison que par son
 * SKU : il la désigne, faute d'autre chose.
 */
function variantAligned(fact: PhraseFact, aspect: unknown, consumed: readonly string[]): Said {
  const p = fact.payload;
  const sku = optional(p['sku']);
  const variant = [text(sku === null ? 'une déclinaison' : `la déclinaison ${sku}`)];
  const product =
    fact.payload['subjectLabel'] === undefined ? [] : [text(' '), ...theSubject(fact, OF_PRODUCT)];
  const words = aspectWords(aspect);
  if (p['aligned'] === false) {
    return byActor(
      fact,
      [text('a rendu à '), ...variant, ...product, text(' '), ...words.own],
      ['subjectLabel', 'sku', 'aligned', ...consumed],
    );
  }
  const verb = p['aligned'] === true ? 'a aligné ' : 'a changé l’alignement de ';
  return byActor(
    fact,
    [
      text(verb),
      ...words.aligned,
      text(' de '),
      ...variant,
      ...product,
      text(' sur la déclinaison par défaut'),
    ],
    ['subjectLabel', 'sku', ...(typeof p['aligned'] === 'boolean' ? ['aligned'] : []), ...consumed],
  );
}

/** « a ajouté la déclinaison « 6 parts » (TAR-001-6) à « Tarte citron » ». */
function variantAdded(fact: PhraseFact): Said {
  const p = fact.payload;
  const called = nameOf(p['name']);
  return byActor(
    fact,
    [
      text('a ajouté '),
      ...(called === null
        ? [text('une déclinaison')]
        : [text('la déclinaison « '), name(called), text(' »')]),
      ...skuAside(p['sku']),
      text(' '),
      ...theSubject(fact, TO_PRODUCT),
    ],
    ['subjectLabel', 'sku', ...saidName(p, 'name')],
  );
}

/**
 * « a renommé la déclinaison « Petite » de « Tarte citron » en « 6 parts » ».
 * Les deux noms viennent du diff, qui existe sous les deux formes ; la
 * déclinaison citée (`variant`, sous son nom d'après) n'apprend rien de plus.
 * Sur une ligne d'avant le lot B, `variantId` reste au détail.
 */
function variantRenamed(fact: PhraseFact): Said {
  const p = fact.payload;
  const change = recordOf(recordOf(p['changes'])?.['name']);
  const before = nameOf(change?.['from']);
  const after = nameOf(change?.['to']);
  const product = [text(' '), ...theSubject(fact, OF_PRODUCT)];
  const variantKey = p['variant'] === undefined ? [] : ['variant'];
  const whole =
    change !== null && untranslated(change['from'] ?? '') && untranslated(change['to'] ?? '')
      ? ['changes']
      : [];
  if (before !== null && after !== null) {
    return byActor(
      fact,
      [
        text('a renommé la déclinaison « '),
        name(before),
        text(' »'),
        ...product,
        text(' en « '),
        name(after),
        text(' »'),
      ],
      ['subjectLabel', ...variantKey, ...whole],
    );
  }
  if (after !== null) {
    return byActor(
      fact,
      [text('a nommé « '), name(after), text(' » une déclinaison'), ...product],
      ['subjectLabel', ...variantKey, ...whole],
    );
  }
  if (before !== null) {
    return byActor(
      fact,
      [text('a retiré son nom à la déclinaison « '), name(before), text(' »'), ...product],
      ['subjectLabel', ...whole],
    );
  }
  const cited = p['variant'] ?? p['variantId'];
  return byActor(
    fact,
    [text('a renommé '), ...cite(VARIANT, cited), ...product],
    ['subjectLabel', p['variant'] === undefined ? 'variantId' : 'variant'],
  );
}

/**
 * « a pré-rempli le prix pro HT de la déclinaison « Boîte » de « Florentin »
 * à 24 € HT, depuis la remise » (lot P, P5). Le rapport et le taux restent au
 * détail : ce sont les matériaux du calcul, pas la phrase.
 */
function proPricePrefilled(fact: PhraseFact): Said {
  const p = fact.payload;
  return byActor(
    fact,
    [
      text('a pré-rempli le prix pro HT de '),
      ...cite(VARIANT, p['variant']),
      text(' '),
      ...theSubject(fact, OF_PRODUCT),
      text(' à '),
      inUnit('millicents', p['proPriceMillicents']),
      text(' HT, depuis la remise'),
    ],
    ['subjectLabel', 'variant', 'proPriceMillicents'],
  );
}

const PRODUCT: Noun = { the: 'le produit', a: 'un produit' };

/** « a archivé la déclinaison « 6 parts » (TAR-001-6) de « Tarte citron » ». */
function variantDiscontinued(fact: PhraseFact): Said {
  return variantGesture(fact, 'a archivé ');
}

/** « a désarchivé la déclinaison « 6 parts » (TAR-001-6) de « Tarte citron » ». */
function variantRestored(fact: PhraseFact): Said {
  return variantGesture(fact, 'a désarchivé ');
}

function variantGesture(fact: PhraseFact, verb: string): Said {
  const p = fact.payload;
  return byActor(
    fact,
    [
      text(verb),
      ...cite(VARIANT, p['variant']),
      ...skuAside(p['sku']),
      text(' '),
      ...theSubject(fact, OF_PRODUCT),
    ],
    ['subjectLabel', 'variant', 'sku'],
  );
}

/** « a fait de la déclinaison « 6 parts » de « Tarte citron » le produit « 6 parts » (P-…) ». */
function variantDetached(fact: PhraseFact): Said {
  const p = fact.payload;
  return byActor(
    fact,
    [
      text('a fait de '),
      ...cite(VARIANT, p['variant']),
      ...skuAside(p['sku']),
      text(' '),
      ...theSubject(fact, OF_PRODUCT),
      text(' '),
      ...cite(PRODUCT, p['product']),
      ...skuAside(p['productSku']),
    ],
    ['subjectLabel', 'variant', 'sku', 'product', 'productSku'],
  );
}

/** « a créé « 6 parts » (P-…) à partir d'une déclinaison (TAR-001-6) de « Tarte citron » ». */
function createdFromVariant(fact: PhraseFact): Said {
  const p = fact.payload;
  return byActor(
    fact,
    [
      text('a créé '),
      ...theSubject(fact, PRODUCT),
      ...skuAside(p['sku']),
      text(' à partir de la déclinaison'),
      ...skuAside(p['originVariantSku']),
      text(' '),
      ...cite({ the: 'de', a: 'd’une fiche' }, p['origin']),
    ],
    ['subjectLabel', 'sku', 'name', 'origin', 'originVariantSku'],
  );
}

/**
 * « a fait de la déclinaison « 6 parts » (TAR-001-2) la déclinaison par défaut
 * de « Tarte citron », à la place de « Entière » (TAR-001-1) » (G4).
 */
function defaultVariantChanged(fact: PhraseFact): Said {
  const p = fact.payload;
  return byActor(
    fact,
    [
      text('a fait de '),
      ...cite(VARIANT, p['variant']),
      ...skuAside(p['sku']),
      text(' la déclinaison par défaut '),
      ...theSubject(fact, OF_PRODUCT),
      text(', à la place de '),
      ...cite(VARIANT, p['previous']),
      ...skuAside(p['previousSku']),
    ],
    ['subjectLabel', 'variant', 'sku', 'previous', 'previousSku'],
  );
}

export const REFERENTIAL_VARIANT_PHRASES = {
  'product.default_variant_changed': defaultVariantChanged,
  'product.variant_discontinued': variantDiscontinued,
  'product.variant_restored': variantRestored,
  'product.variant_detached': variantDetached,
  'product.created_from_variant': createdFromVariant,
  'product.pro_price_prefilled': proPricePrefilled,
  'variant.added': variantAdded,
  'variant.aligned': (fact) => variantAligned(fact, fact.payload['aspect'], ['aspect']),
  'variant.renamed': variantRenamed,
  // Retiré le 2026-09-03 au profit de `variant.aligned` : c'était lui, sur la
  // seule fiche réglementaire.
  'variant.regulatory_aligned': (fact) => variantAligned(fact, 'regulatory', []),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
