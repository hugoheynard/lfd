import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { recordOf, text as orDash } from '../payload-read';
import {
  byActor,
  cite,
  fromTo,
  name,
  NO_CHANGE,
  said,
  text,
  value,
  valueIn,
  type Noun,
  type Phrase,
  type Segment,
} from '../phrase';
import { formatUnit } from '../units';
import { SALES_CONTEXT } from '../values/referential-values';

import { theSubject } from './referential-support';

/**
 * **Les taux de TVA du référentiel** — les faits d'un taux (`vat_rate.*`,
 * famille `referentialSettings`) et le taux par contexte d'une fiche ou d'une
 * famille (`*.vat_changed`, famille `referentialCatalogue`). Réunis dans
 * `referential-phrases.ts`, qui tenait leur préfixe.
 *
 * Les phrases des taux sont reprises de `shared/journal-fact.ts` (lot C) et
 * restent à la tournure passive : deux écrans les citent mot pour mot
 * (`journal-line.spec.ts`, `product-history.spec.ts`). Les taux par contexte
 * sont à la voix active (lot D, 2026-09-19).
 */

const RATE: Noun = { the: '', a: 'un taux' };
const OF_PRODUCT: Noun = { the: 'de', a: 'd’une fiche' };
const OF_FAMILY: Noun = { the: 'de la famille', a: 'd’une famille' };

/** « 5,5 % ». Un taux absent rend `—` plutôt qu'un `NaN %`. */
function percent(raw: unknown): string {
  return formatUnit('percent', raw) ?? '—';
}

/** Un nom en gras, pour les phrases reprises du lot C. */
function bold(raw: unknown): Segment {
  return name(orDash(raw));
}

/** « de « Réduit » à « Normal » », « d’aucun taux à « Réduit » », « de « Normal » à aucun taux ». */
function rateShift(raw: unknown): Segment[] {
  const change = recordOf(raw) ?? {};
  const from = change['from'];
  const to = change['to'];
  if (from === null || from === undefined) {
    return [text('d’aucun taux à '), ...cite(RATE, to)];
  }
  if (to === null || to === undefined) {
    return [text('de '), ...cite(RATE, from), text(' à aucun taux')];
  }
  return fromTo(cite(RATE, from), cite(RATE, to));
}

/**
 * « a passé le taux à emporter de la famille « Tartes » de « Réduit » à
 * « Intermédiaire », et le taux sur place d’aucun taux à « Normal » ».
 *
 * La forme d'avant le lot B est un record à la racine, les taux par leur seul
 * id : la phrase dit le geste, le détail dit « À emporter : (identifiant
 * tva_1) → (identifiant tva_2) ».
 */
function vatChanged(of: Noun): Phrase {
  return (fact) => {
    const byContext = recordOf(fact.payload['vatByContext']);
    if (byContext === null) {
      return byActor(
        fact,
        [text('a changé les taux de TVA '), ...theSubject(fact, of)],
        ['subjectLabel'],
      );
    }
    const entries = Object.entries(byContext);
    if (entries.length === 0) {
      return byActor(
        fact,
        [text('a modifié les taux de TVA '), ...theSubject(fact, of), text(` (${NO_CHANGE})`)],
        ['subjectLabel', 'vatByContext'],
      );
    }
    const segments = entries.flatMap(([context, change], index) => [
      text(
        index === 0
          ? 'a passé le taux '
          : index === entries.length - 1
            ? ' et le taux '
            : ', le taux ',
      ),
      valueIn(SALES_CONTEXT, context, { inSentence: true }),
      text(' '),
      ...(index === 0 ? [...theSubject(fact, of), text(' ')] : []),
      ...rateShift(change),
    ]);
    return byActor(fact, segments, ['subjectLabel', 'vatByContext']);
  };
}

export const REFERENTIAL_VAT_PHRASES = {
  'vat_rate.created': (fact) =>
    said(
      [
        text('Taux de TVA « '),
        bold(fact.payload['name']),
        text(' » créé à '),
        value(percent(fact.payload['percent'])),
      ],
      ['subjectLabel', 'name', 'percent'],
    ),
  'vat_rate.rate_changed': (fact) =>
    said(
      [
        text('Taux de « '),
        bold(fact.payload['name']),
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
        bold(fact.payload['from']),
        text(' » renommé « '),
        bold(fact.payload['to']),
        text(' »'),
      ],
      ['subjectLabel', 'from', 'to'],
    ),
  'vat_rate.deleted': (fact) =>
    said(
      [
        text('Taux de TVA « '),
        bold(fact.payload['name']),
        text(' » supprimé ('),
        value(percent(fact.payload['percent'])),
        text(')'),
      ],
      ['subjectLabel', 'name', 'percent'],
    ),

  'product.vat_changed': vatChanged(OF_PRODUCT),
  'product_category.vat_changed': vatChanged(OF_FAMILY),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
