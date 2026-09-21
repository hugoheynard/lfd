import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { contextWord } from '../context-word';
import { recordOf, text as orDash } from '../payload-read';
import {
  byActor,
  cite,
  fromTo,
  inSentence,
  name,
  NO_CHANGE,
  text,
  value,
  type Noun,
  type Phrase,
  type Segment,
} from '../phrase';
import { formatUnit } from '../units';

import { theSubject } from './referential-support';

/**
 * **Les taux de TVA du référentiel** — les faits d'un taux (`vat_rate.*`,
 * famille `referentialSettings`) et le taux par contexte d'une fiche ou d'une
 * famille (`*.vat_changed`, famille `referentialCatalogue`). Réunis dans
 * `referential-phrases.ts`, qui tenait leur préfixe.
 *
 * Toutes à la voix active, l'auteur en sujet (lot D, 2026-09-19) : les faits
 * d'un taux, repris au lot C de `shared/journal-fact.ts` au passif, y sont
 * passés à leur tour. Les anciens noms d'un taux (`tax_regime.*`, retirés)
 * se disent comme lui.
 */

const RATE: Noun = { the: '', a: 'un taux' };
const OF_PRODUCT: Noun = { the: 'de', a: 'd’une fiche' };
const OF_FAMILY: Noun = { the: 'de la famille', a: 'd’une famille' };

/** « 5,5 % ». Un taux absent rend `—` plutôt qu'un `NaN %`. */
function percent(raw: unknown): string {
  return formatUnit('percent', raw) ?? '—';
}

/** Un nom en gras : le nom d'un taux, figé dans sa charge. */
function bold(raw: unknown): Segment {
  return name(orDash(raw));
}

/**
 * « à emporter », « brunch » — le mot du contexte (`contextWord`) en milieu de
 * phrase ; la clé telle quelle quand aucun mot n'existe.
 */
function contextIn(payload: Readonly<Record<string, unknown>>, key: string): Segment {
  const word = contextWord(payload, key);
  return value(word === null ? key : inSentence(word));
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
        ['subjectLabel', 'vatByContext', 'contextLabels'],
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
      contextIn(fact.payload, context),
      text(' '),
      ...(index === 0 ? [...theSubject(fact, of), text(' ')] : []),
      ...rateShift(change),
    ]);
    return byActor(fact, segments, ['subjectLabel', 'vatByContext', 'contextLabels']);
  };
}

/**
 * Les phrases d'un taux, partagées par `vat_rate.*` et par ses anciens noms
 * `tax_regime.*` (2026-08-21, retirés) : c'est le même geste sur le même
 * objet, il se dit de la même façon. `tax_regime.*` n'a jamais porté de
 * `subjectLabel` — le déclarer consommé n'y coûte rien.
 */
const rateCreated: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a créé le taux de TVA « '),
      bold(fact.payload['name']),
      text(' » à '),
      value(percent(fact.payload['percent'])),
    ],
    ['subjectLabel', 'name', 'percent'],
  );

const rateChanged: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a passé le taux de TVA « '),
      bold(fact.payload['name']),
      text(' » de '),
      value(percent(fact.payload['from'])),
      text(' à '),
      value(percent(fact.payload['to'])),
    ],
    // `contextLabels` ne sert qu'à nommer les contextes de la portée : la méta
    // et le détail de `blast` le lisent, il n'apprend rien par lui-même.
    ['subjectLabel', 'name', 'from', 'to', 'contextLabels'],
  );

const rateRenamed: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a renommé le taux de TVA « '),
      bold(fact.payload['from']),
      text(' » en « '),
      bold(fact.payload['to']),
      text(' »'),
    ],
    ['subjectLabel', 'from', 'to'],
  );

const rateDeleted: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a supprimé le taux de TVA « '),
      bold(fact.payload['name']),
      text(' » ('),
      value(percent(fact.payload['percent'])),
      text(')'),
    ],
    ['subjectLabel', 'name', 'percent'],
  );

export const REFERENTIAL_VAT_PHRASES = {
  'vat_rate.created': rateCreated,
  'vat_rate.rate_changed': rateChanged,
  'vat_rate.renamed': rateRenamed,
  'vat_rate.deleted': rateDeleted,
  // Les taux quand ils s'appelaient « régimes » (le 2026-08-21, base de dev) :
  // le `tag` (collection Shopify) et la portée d'août restent au détail.
  'tax_regime.created': rateCreated,
  'tax_regime.rate_changed': rateChanged,
  'tax_regime.renamed': rateRenamed,
  'tax_regime.deleted': rateDeleted,

  'product.vat_changed': vatChanged(OF_PRODUCT),
  'product_category.vat_changed': vatChanged(OF_FAMILY),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
