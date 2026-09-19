import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { nameOf, text as orDash } from '../payload-read';
import { name, said, subject, text, value, type Phrase } from '../phrase';
import { formatUnit } from '../units';

/**
 * **Le référentiel** — les phrases reprises de `shared/journal-fact.ts`
 * (`factSentence`, plan des phrases, lot C, 2026-09-19) : mêmes mots, en
 * segments. Les autres types du référentiel ont le repli honnête du moteur
 * jusqu'au lot D.
 */

/** « 5,5 % ». Un taux absent rend `—` plutôt qu'un `NaN %`. */
function percent(raw: unknown): string {
  return formatUnit('percent', raw) ?? '—';
}

/**
 * Le nom de la fiche : son libellé figé (D6) quand la ligne en porte un, sinon
 * le nom de la charge — une chaîne, ou le français d'un texte traduisible.
 */
function productName(payload: Readonly<Record<string, unknown>>): string {
  return nameOf(payload['subjectLabel']) ?? nameOf(payload['name']) ?? '—';
}

/** Mis en vente, ou retiré : la fiche en sujet (liée), et son SKU. */
function onSale(verb: string): Phrase {
  return (fact) =>
    said(
      [
        text('Produit « '),
        subject(fact, productName(fact.payload)),
        text(` » ${verb} (${orDash(fact.payload['sku'])})`),
      ],
      ['subjectLabel', 'name', 'sku'],
    );
}

export const REFERENTIAL_PHRASES = {
  'vat_rate.created': (fact) =>
    said(
      [
        text('Taux de TVA « '),
        name(orDash(fact.payload['name'])),
        text(' » créé à '),
        value(percent(fact.payload['percent'])),
      ],
      ['subjectLabel', 'name', 'percent'],
    ),
  'vat_rate.rate_changed': (fact) =>
    said(
      [
        text('Taux de « '),
        name(orDash(fact.payload['name'])),
        text(' » passé de '),
        value(percent(fact.payload['from'])),
        text(' à '),
        value(percent(fact.payload['to'])),
      ],
      ['subjectLabel', 'name', 'from', 'to'],
    ),
  'vat_rate.renamed': (fact) =>
    said(
      [
        text('Taux « '),
        name(orDash(fact.payload['from'])),
        text(' » renommé « '),
        name(orDash(fact.payload['to'])),
        text(' »'),
      ],
      ['subjectLabel', 'from', 'to'],
    ),
  'vat_rate.deleted': (fact) =>
    said(
      [
        text('Taux de TVA « '),
        name(orDash(fact.payload['name'])),
        text(' » supprimé ('),
        value(percent(fact.payload['percent'])),
        text(')'),
      ],
      ['subjectLabel', 'name', 'percent'],
    ),
  // La famille se nomme par le repli du moteur (« — Tartes ») : la phrase de
  // `factSentence` ne la nommait pas, et le lot D la réécrira entière.
  'product_category.vat_changed': () => said([text('Taux de TVA d’une famille modifiés')], []),
  'product.published': onSale('publié au catalogue'),
  'product.unpublished': onSale('retiré de la vente'),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
