import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { nameOf, optional } from '../payload-read';
import {
  byActor,
  cite,
  name,
  subject,
  subjectLabelOf,
  text,
  value,
  whatChanged,
  type Noun,
  type Phrase,
  type PhraseFact,
  type Said,
  type Segment,
} from '../phrase';
import { formatNumber } from '../units';

import {
  onSubject,
  onSubjectChanges,
  saidName,
  theSubject,
  unchanged,
  untranslated,
} from './referential-support';

/**
 * **La provenance et les allergènes du référentiel** — appellations,
 * ingrédients, catégories d'allergènes, allergènes (famille
 * `referentialSettings`, lot D du plan des phrases, 2026-09-19). Réunies dans
 * `referential-settings-phrases.ts`, que le registre lit.
 */

const APPELLATION: Noun = { the: 'l’appellation', a: 'une appellation' };
const INGREDIENT: Noun = { the: 'l’ingrédient', a: 'un ingrédient' };
const OF_INGREDIENT: Noun = { the: 'de l’ingrédient', a: 'd’un ingrédient' };
const ALLERGEN_CATEGORY: Noun = {
  the: 'la catégorie d’allergènes',
  a: 'une catégorie d’allergènes',
};
const ALLERGEN: Noun = { the: 'l’allergène', a: 'un allergène' };

// ─── La provenance : appellations, ingrédients ────────────────────────────

/** « a créé l'appellation « Comté » (AOP) ». Le code reste au détail. */
function appellationCreated(fact: PhraseFact): Said {
  const scheme = optional(fact.payload['scheme']);
  return byActor(
    fact,
    [
      text('a créé '),
      ...theSubject(fact, APPELLATION, nameOf(fact.payload['label'])),
      ...(scheme === null ? [] : [text(` (${scheme})`)]),
    ],
    ['subjectLabel', ...saidName(fact.payload, 'label'), ...(scheme === null ? [] : ['scheme'])],
  );
}

/**
 * « a créé l'ingrédient « Beurre » (origine : Charentes), sous l'appellation
 * « Beurre Charentes-Poitou » ». D'avant le lot B, l'appellation n'est que son
 * code : « sous une appellation (identifiant BCP) » (D5).
 */
function ingredientCreated(fact: PhraseFact): Said {
  const p = fact.payload;
  const origin = optional(p['origin']);
  const appellation = p['appellation'];
  const claimed = appellation !== null && appellation !== undefined;
  return byActor(
    fact,
    [
      text('a créé '),
      ...theSubject(fact, INGREDIENT, nameOf(p['name'])),
      ...(origin === null ? [] : [text(` (origine : ${origin})`)]),
      ...(claimed
        ? [
            text(', '),
            ...cite({ the: 'sous l’appellation', a: 'sous une appellation' }, appellation),
          ]
        : []),
    ],
    [
      'subjectLabel',
      ...saidName(p, 'name'),
      ...(origin === null ? [] : ['origin']),
      ...(claimed ? ['appellation'] : []),
    ],
  );
}

/** « a modifié les allergènes de l'ingrédient « Lait » » — les codes, avant et après, au détail. */
function ingredientAllergens(fact: PhraseFact): Said {
  return byActor(
    fact,
    [
      text('a modifié les allergènes '),
      ...theSubject(fact, OF_INGREDIENT),
      ...unchanged(fact.payload['changes']),
    ],
    ['subjectLabel'],
  );
}

// ─── Les allergènes ───────────────────────────────────────────────────────

/** « a renommé la catégorie d'allergènes « Céréales » en « Céréales à gluten » ». */
function allergenCategoryRenamed(fact: PhraseFact): Said {
  const p = fact.payload;
  const before = nameOf(p['from']);
  const after = subjectLabelOf(fact) ?? nameOf(p['to']);
  if (before === null || after === null) {
    return byActor(
      fact,
      [text('a renommé '), ...theSubject(fact, ALLERGEN_CATEGORY)],
      ['subjectLabel'],
    );
  }
  return byActor(
    fact,
    [
      text('a renommé la catégorie d’allergènes « '),
      name(before),
      text(' » en « '),
      subject(fact, after),
      text(' »'),
    ],
    ['subjectLabel', ...(untranslated(p['from']) && untranslated(p['to']) ? ['from', 'to'] : [])],
  );
}

/**
 * « a déplacé la catégorie d'allergènes « Céréales » de la position 10 à la
 * position 20 ». Une position est une clé de tri, pas un rang : elle se dit
 * telle quelle.
 */
function allergenCategoryReordered(fact: PhraseFact): Said {
  const at = (raw: unknown): Segment => value(typeof raw === 'number' ? formatNumber(raw) : '—');
  return byActor(
    fact,
    [
      text('a déplacé '),
      ...theSubject(fact, ALLERGEN_CATEGORY, nameOf(fact.payload['name'])),
      text(' de la position '),
      at(fact.payload['from']),
      text(' à la position '),
      at(fact.payload['to']),
    ],
    ['subjectLabel', 'from', 'to'],
  );
}

/**
 * « a créé l'allergène « Lait » dans la catégorie « Produits laitiers » ». Le
 * code GS1 reste au détail. D'avant le lot B, la catégorie n'est que sa clé.
 */
function allergenEntryCreated(fact: PhraseFact): Said {
  const p = fact.payload;
  const category = p['category'];
  const filed = category !== null && category !== undefined;
  return byActor(
    fact,
    [
      text('a créé '),
      ...theSubject(fact, ALLERGEN, nameOf(p['name'])),
      ...(filed
        ? [text(' '), ...cite({ the: 'dans la catégorie', a: 'dans une catégorie' }, category)]
        : []),
    ],
    ['subjectLabel', ...saidName(p, 'name'), ...(filed ? ['category'] : [])],
  );
}

/**
 * « a modifié l'allergène « Lait » : nom, catégorie ». D'avant le lot B, la
 * catégorie s'appelait `categoryId` — que le dictionnaire commun dit
 * « famille », le mot des fiches : ce type le surcharge (`KEY_LABELS_BY_TYPE`),
 * et la phrase comme le détail disent « catégorie ».
 */
function allergenEntryUpdated(fact: PhraseFact): Said {
  return byActor(
    fact,
    [
      text('a modifié '),
      ...theSubject(fact, ALLERGEN),
      ...whatChanged(fact.payload['changes'], fact.type),
    ],
    ['subjectLabel'],
  );
}

export const REFERENTIAL_PROVENANCE_PHRASES = {
  'appellation.created': appellationCreated,
  'appellation.updated': onSubjectChanges(APPELLATION),
  'appellation.deleted': onSubject('a supprimé', APPELLATION, 'label'),
  'ingredient.created': ingredientCreated,
  'ingredient.updated': onSubjectChanges(INGREDIENT),
  'ingredient.deleted': onSubject('a supprimé', INGREDIENT, 'name'),
  'ingredient.allergens_saved': ingredientAllergens,
  'allergen_category.created': onSubject('a créé', ALLERGEN_CATEGORY, 'name'),
  'allergen_category.renamed': allergenCategoryRenamed,
  'allergen_category.reordered': allergenCategoryReordered,
  'allergen_category.archived': onSubject('a archivé', ALLERGEN_CATEGORY, 'name'),
  'allergen_category.restored': onSubject('a restauré', ALLERGEN_CATEGORY, 'name'),
  'allergen_entry.created': allergenEntryCreated,
  'allergen_entry.updated': allergenEntryUpdated,
  'allergen_entry.archived': onSubject('a archivé', ALLERGEN, 'name'),
  'allergen_entry.restored': onSubject('a restauré', ALLERGEN, 'name'),
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
