import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { optional, strings } from '../payload-read';
import { byActor, name, text, value, type Noun, type Phrase, type Segment } from '../phrase';

import { theSubject } from './referential-support';

/**
 * **Les options de commande du référentiel** — le groupe (`option_group.*`)
 * et son activation sur une fiche (`product.option_group_*`), famille
 * `referentialProductOptions` (`documentation/catalogue/plan-options-de-commande.md`,
 * § 3.1). Le groupe se dit par son nom et ses choix ; l'activation par le
 * groupe et les déclinaisons qu'elle vise.
 */

const GROUP: Noun = { the: 'le groupe d’options', a: 'un groupe d’options' };
const OF_PRODUCT: Noun = { the: 'sur', a: 'sur une fiche' };

/** « « Tranchage » », ou « un groupe d’options » sans nom. */
function groupNamed(raw: unknown): Segment[] {
  const label = optional(raw);
  return label === null
    ? [text(GROUP.a)]
    : [text('le groupe d’options « '), name(label), text(' »')];
}

/** « (Tranché, Tranché fin) » — rien quand la charge n'en porte pas. */
function choiceList(raw: unknown): Segment[] {
  const labels = strings(raw);
  return labels.length === 0 ? [] : [text(' ('), value(labels.join(', ')), text(')')];
}

/** « a créé le groupe d’options « Tranchage » (Tranché, Tranché fin) » — créer, réviser. */
function groupState(verb: string): Phrase {
  return (fact) =>
    byActor(
      fact,
      [text(`${verb} `), ...theSubject(fact, GROUP), ...choiceList(fact.payload['choices'])],
      ['subjectLabel', 'name', 'choices'],
    );
}

/** « a archivé le groupe d’options « Tranchage » » — archiver, restaurer. */
function groupGesture(verb: string): Phrase {
  return (fact) =>
    byActor(fact, [text(`${verb} `), ...theSubject(fact, GROUP)], ['subjectLabel', 'name']);
}

/** « pour toutes ses déclinaisons », « pour « 500 g », « 1 kg » ». */
function variantScope(raw: unknown): Segment[] {
  if (raw === null) {
    return [text(' pour toutes ses déclinaisons')];
  }
  const names = strings(raw);
  return names.length === 0 ? [] : [text(' pour '), value(names.map((n) => `« ${n} »`).join(', '))];
}

/** « a activé le groupe d’options « Tranchage » sur « Pain de campagne » pour toutes ses déclinaisons ». */
const activated: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a activé '),
      ...groupNamed(fact.payload['name']),
      text(' '),
      ...theSubject(fact, OF_PRODUCT),
      ...variantScope(fact.payload['variants']),
    ],
    ['subjectLabel', 'name', 'variants'],
  );

/** « a retiré le groupe d’options « Tranchage » de « Pain de campagne » ». */
const deactivated: Phrase = (fact) =>
  byActor(
    fact,
    [
      text('a retiré '),
      ...groupNamed(fact.payload['name']),
      text(' '),
      ...theSubject(fact, { the: 'de', a: 'd’une fiche' }),
    ],
    ['subjectLabel', 'name'],
  );

export const REFERENTIAL_PRODUCT_OPTION_PHRASES = {
  'option_group.created': groupState('a créé'),
  'option_group.revised': groupState('a modifié'),
  'option_group.archived': groupGesture('a archivé'),
  'option_group.restored': groupGesture('a restauré'),
  'product.option_group_activated': activated,
  'product.option_group_deactivated': deactivated,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
