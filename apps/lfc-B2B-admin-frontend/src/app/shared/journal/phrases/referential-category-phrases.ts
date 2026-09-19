import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { nameOf, optional, recordOf } from '../payload-read';
import {
  byActor,
  cite,
  citedName,
  countOf,
  name,
  subject,
  subjectLabelOf,
  text,
  whatChanged,
  type Noun,
  type Phrase,
  type PhraseFact,
  type Said,
  type Segment,
} from '../phrase';
import { joined, saidName, theSubject, unchanged, untranslated } from './referential-support';

/**
 * **Le référentiel — les familles et les révisions du catalogue** (famille
 * `referentialCatalogue`, lot D du plan des phrases, 2026-09-19). Réunies dans
 * `referential-phrases.ts`, que le registre lit.
 */

const FAMILY: Noun = { the: 'la famille', a: 'une famille' };
const OF_FAMILY: Noun = { the: 'de la famille', a: 'd’une famille' };
const UNDER_FAMILY: Noun = { the: 'sous la famille', a: 'sous une famille' };

/** Le niveau racine d'un réordonnancement : il n'est pas une famille (`reorder-categories.ts`). */
const ROOT_LEVEL = 'root';

/** La famille d'une ligne d'avant le lot B se nomme par son nom français, s'il y est. */
function theFamily(fact: PhraseFact, noun: Noun): Segment[] {
  return theSubject(fact, noun, nameOf(fact.payload['name']));
}

/** « a <verbe> la famille « Tartes » » — le nom traduisible consommé s'il n'a rien d'autre à dire. */
function onFamily(verb: string): Phrase {
  return (fact) =>
    byActor(
      fact,
      [text(`${verb} `), ...theFamily(fact, FAMILY)],
      ['subjectLabel', ...saidName(fact.payload, 'name')],
    );
}

/** « a modifié <section> de la famille « Tartes » ». */
function sectionSaved(section: string, fields: 'names' | 'none'): Phrase {
  return (fact) =>
    byActor(
      fact,
      [
        text(`a modifié ${section} `),
        ...theSubject(fact, OF_FAMILY),
        ...(fields === 'names'
          ? whatChanged(fact.payload['changes'])
          : unchanged(fact.payload['changes'])),
      ],
      ['subjectLabel'],
    );
}

/**
 * « a créé la famille « Tartes » sous la famille « Pâtisserie » ». Une famille
 * de premier niveau (`parent: null`) ne le dit pas : le détail le dit
 * (« Famille parente : aucun »).
 */
function categoryCreated(fact: PhraseFact): Said {
  const p = fact.payload;
  const parentKey = p['parent'] === undefined ? 'parentId' : 'parent';
  const parent = p[parentKey];
  const under =
    parent === null || parent === undefined ? [] : [text(' '), ...cite(UNDER_FAMILY, parent)];
  return byActor(
    fact,
    [text('a créé '), ...theFamily(fact, FAMILY), ...under],
    ['subjectLabel', ...saidName(p, 'name'), ...(under.length === 0 ? [] : [parentKey])],
  );
}

/** « a renommé la famille « Tartes » en « Tartes et tourtes » ». */
function categoryRenamed(fact: PhraseFact): Said {
  const change = recordOf(recordOf(fact.payload['changes'])?.['name']);
  const before = nameOf(change?.['from']);
  const after = subjectLabelOf(fact) ?? nameOf(change?.['to']);
  if (before === null || after === null) {
    return byActor(fact, [text('a renommé '), ...theSubject(fact, FAMILY)], ['subjectLabel']);
  }
  const whole = change !== null && untranslated(change['from']) && untranslated(change['to']);
  return byActor(
    fact,
    [
      text('a renommé la famille « '),
      name(before),
      text(' » en « '),
      subject(fact, after),
      text(' »'),
    ],
    ['subjectLabel', ...(whole ? ['changes'] : [])],
  );
}

/** « sous la famille « Pâtisserie » », ou « au premier niveau du catalogue ». */
function place(raw: unknown): Segment[] {
  return raw === null || raw === undefined
    ? [text('au premier niveau du catalogue')]
    : cite(UNDER_FAMILY, raw);
}

/**
 * « a déplacé la famille « Tartes » sous la famille « Pâtisserie » (elle était
 * au premier niveau du catalogue) ». Une ligne d'avant le lot B ne cite les
 * parents que par leur id : la phrase dit le geste, le détail les deux ids.
 */
function categoryMoved(fact: PhraseFact): Said {
  const parent = recordOf(fact.payload['parent']);
  if (parent === null) {
    return byActor(fact, [text('a déplacé '), ...theSubject(fact, FAMILY)], ['subjectLabel']);
  }
  return byActor(
    fact,
    [
      text('a déplacé '),
      ...theSubject(fact, FAMILY),
      text(' '),
      ...place(parent['to']),
      text(' (elle était '),
      ...place(parent['from']),
      text(')'),
    ],
    ['subjectLabel', 'parent'],
  );
}

/**
 * « a réordonné les sous-familles de « Pâtisserie » : Tartes, Entremets ». Le
 * sujet est le NIVEAU (`root` pour le premier). L'ordre se dit quand chaque
 * famille y est nommée ; d'avant le lot B, il n'a que des ids : au détail.
 */
function categoriesReordered(fact: PhraseFact): Said {
  const order = fact.payload['order'];
  const names = Array.isArray(order) ? order.map((family: unknown) => citedName(family)) : [];
  const listed = names.length > 0 && names.every((called): called is string => called !== null);
  const level =
    fact.subjectId === ROOT_LEVEL
      ? [text('les familles du premier niveau du catalogue')]
      : [text('les sous-familles '), ...theSubject(fact, { the: 'de', a: 'd’une famille' })];
  return byActor(
    fact,
    [
      text('a réordonné '),
      ...level,
      ...(listed ? [text(' : '), ...joined(names.map((called) => [name(called)]))] : []),
    ],
    ['subjectLabel', ...(listed ? ['order'] : [])],
  );
}

/**
 * « a posé la révision « Rentrée » du catalogue ». Sans nom, son libellé figé
 * est son empreinte, que le détail dit déjà : la phrase dit « sans nom ».
 */
function revisionTaken(fact: PhraseFact): Said {
  const p = fact.payload;
  const label = optional(p['label']);
  if (label !== null) {
    return byActor(
      fact,
      [text('a posé la révision « '), subject(fact, label), text(' » du catalogue')],
      ['subjectLabel', 'label'],
    );
  }
  return byActor(
    fact,
    [
      text(
        p['label'] === null
          ? 'a posé une révision du catalogue, sans nom'
          : 'a posé une révision du catalogue',
      ),
    ],
    ['subjectLabel', 'label'],
  );
}

/** « a nommé « Rentrée » la révision R-7WT4NA ». */
function revisionNamed(fact: PhraseFact): Said {
  const p = fact.payload;
  const reference = optional(p['reference']);
  const revision = [text(reference === null ? 'une révision' : `la révision ${reference}`)];
  const label = optional(p['label']);
  if (label === null) {
    return byActor(
      fact,
      [text('a retiré son nom à '), ...revision],
      ['subjectLabel', 'reference', 'label'],
    );
  }
  return byActor(
    fact,
    [text('a nommé « '), subject(fact, label), text(' » '), ...revision],
    ['subjectLabel', 'reference', 'label'],
  );
}

/** Le canal vers lequel une révision part, avec son article. */
const CHANNELS: Readonly<Record<string, string>> = { b2b: 'la plateforme professionnelle' };

/**
 * « a envoyé la révision « Rentrée » (R-7WT4NA) vers la plateforme
 * professionnelle : 40 articles candidats, 2 écartés ». Une simulation ne
 * s'appelle pas un envoi : « a simulé l'envoi de … ».
 */
function revisionPushed(fact: PhraseFact): Said {
  const p = fact.payload;
  const label = subjectLabelOf(fact);
  const reference = optional(p['reference']);
  // « a envoyé la révision … », « a simulé l'envoi de la révision … » — et
  // l'élision devant l'indéfini : « d'une révision », jamais « de une ».
  const dryRun = p['mode'] === 'dry-run';
  const of = dryRun ? 'de ' : '';
  const revision =
    label === null
      ? [
          text(
            reference === null
              ? `${dryRun ? 'd’' : ''}une révision`
              : `${of}la révision ${reference}`,
          ),
        ]
      : [
          text(`${of}la révision « `),
          subject(fact, label),
          text(reference === null || reference === label ? ' »' : ` » (${reference})`),
        ];
  const channel = optional(p['channel']);
  const toward =
    channel === null
      ? null
      : Object.hasOwn(CHANNELS, channel)
        ? (CHANNELS[channel] ?? null)
        : `le canal « ${channel} »`;
  const target = toward === null ? [] : [text(` vers ${toward}`)];
  const counts = [
    countOf(p['candidates'], 'article candidat', 'articles candidats'),
    countOf(p['excluded'], 'écarté', 'écartés'),
  ].filter((segment): segment is Segment => segment !== null);
  // Le mode n'a que deux valeurs au catalogue : une autre, la phrase ne la
  // prétend pas dite, et le détail la rend.
  const mode = p['mode'];
  return byActor(
    fact,
    [
      text(dryRun ? 'a simulé l’envoi ' : 'a envoyé '),
      ...revision,
      ...target,
      ...(counts.length === 0 ? [] : [text(' : '), ...joined(counts.map((count) => [count]))]),
    ],
    [
      'subjectLabel',
      'reference',
      'channel',
      'candidates',
      'excluded',
      ...(mode === 'dry-run' || mode === 'live' ? ['mode'] : []),
    ],
  );
}

export const REFERENTIAL_CATEGORY_PHRASES = {
  'product_category.created': categoryCreated,
  'product_category.renamed': categoryRenamed,
  'product_category.moved': categoryMoved,
  'product_category.archived': onFamily('a archivé'),
  'product_category.reordered': categoriesReordered,
  'product_category.channels_changed': sectionSaved('les canaux de vente', 'none'),
  'product_category.editorial_saved': sectionSaved('les textes', 'names'),
  'product_category.media_saved': sectionSaved('les visuels', 'none'),

  'catalog_revision.taken': revisionTaken,
  'catalog_revision.named': revisionNamed,
  'catalog_revision.pushed': revisionPushed,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
