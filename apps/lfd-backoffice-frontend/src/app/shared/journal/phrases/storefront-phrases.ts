import type { JournalFactType } from '@lfd/contracts/journal-facts';

import { strings } from '../payload-read';
import { byActor, countOf, text, value, type Phrase, type Segment } from '../phrase';

/**
 * **La vitrine** — un enregistrement de la composition des pages de la
 * boutique (`storefront.saved`, famille `commerce`,
 * `documentation/order/plan-vitrine-enregistrement.md`, D6).
 *
 * Enregistrer publie, et ce fait est la SEULE trace de qui a vidé un rayon :
 * la phrase dit donc ce qui a bougé, en comptes. Les objets n'ont pas de nom
 * (une forme et une place), et les rayons ne sont portés que par leur
 * identifiant de famille : on les COMPTE, on ne les nomme pas — un identifiant
 * présenté comme un nom est ce que le guide du registre interdit.
 */

const KEYS = ['subjectLabel', 'revision', 'added', 'moved', 'archived', 'shelves'];

/** Ce qui a bougé, dans l'ordre où la phrase le dit. */
const MOVES = [
  ['added', 'objet ajouté', 'objets ajoutés'],
  ['moved', 'objet déplacé', 'objets déplacés'],
  ['archived', 'objet retiré', 'objets retirés'],
] as const;

/** « 1 objet ajouté, 2 objets déplacés » — seulement ce qui n'est pas nul. */
function movements(payload: Readonly<Record<string, unknown>>): Segment[] {
  const parts = MOVES.flatMap(([key, one, many]) => {
    const size = strings(payload[key]).length;
    const segment = size === 0 ? null : countOf(size, one, many);
    return segment === null ? [] : [segment];
  });
  return parts.flatMap((part, index) => (index === 0 ? [part] : [text(', '), part]));
}

/**
 * « Colette Martin a enregistré la vitrine (version 4) : 1 objet ajouté,
 * 1 objet retiré, sur 2 rayons » ; rien de changé : « … sans rien y changer ».
 */
const saved: Phrase = (fact) => {
  const revision = typeof fact.payload['revision'] === 'number' ? fact.payload['revision'] : null;
  const moves = movements(fact.payload);
  const shelves = countOf(strings(fact.payload['shelves']).length, 'rayon', 'rayons');
  return byActor(
    fact,
    [
      text('a enregistré la vitrine'),
      ...(revision === null ? [] : [text(' (version '), value(String(revision)), text(')')]),
      ...(moves.length === 0
        ? [text(', sans rien y changer')]
        : [text(' : '), ...moves, ...(shelves === null ? [] : [text(', sur '), shelves])]),
    ],
    KEYS,
  );
};

const PUBLISHED_KEYS = ['subjectLabel', 'version', 'changes'];

/** Les textes publiés, triés : remplacés par un nouveau texte, ou rendus au code. */
function publishedChanges(raw: unknown): { readonly rewritten: number; readonly restored: number } {
  const changes = Array.isArray(raw) ? raw : [];
  const restored = changes.filter(
    (change: unknown) =>
      typeof change === 'object' && change !== null && 'after' in change && change.after === null,
  ).length;
  return { rewritten: changes.length - restored, restored };
}

/**
 * **Les textes de la boutique publiés** (`shop_copy.published`,
 * `documentation/contenu-ecommerce/plan-textes-de-la-boutique.md`, §10).
 *
 * « Colette Martin a publié les textes de la boutique (version 3) : 2 textes
 * modifiés, 1 texte rendu à l'original ». La charge porte chaque texte avant
 * et après ; la phrase les COMPTE — une clé de manifeste n'est pas un nom.
 */
const shopCopyPublished: Phrase = (fact) => {
  const version = typeof fact.payload['version'] === 'number' ? fact.payload['version'] : null;
  const { rewritten, restored } = publishedChanges(fact.payload['changes']);
  const parts = [
    rewritten === 0 ? null : countOf(rewritten, 'texte modifié', 'textes modifiés'),
    restored === 0
      ? null
      : countOf(restored, 'texte rendu à l’original', 'textes rendus à l’original'),
  ].flatMap((part) => (part === null ? [] : [part]));
  const listed = parts.flatMap((part, index) => (index === 0 ? [part] : [text(', '), part]));
  return byActor(
    fact,
    [
      text('a publié les textes de la boutique'),
      ...(version === null ? [] : [text(' (version '), value(String(version)), text(')')]),
      ...(listed.length === 0 ? [text(', sans rien changer à l’écran')] : [text(' : '), ...listed]),
    ],
    PUBLISHED_KEYS,
  );
};

export const STOREFRONT_PHRASES = {
  'storefront.saved': saved,
  'shop_copy.published': shopCopyPublished,
} as const satisfies Partial<Record<JournalFactType, Phrase>>;
