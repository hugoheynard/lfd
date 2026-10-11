import type { ContentLocale, ShopCopyEntryView } from '@lfd/contracts';

import { copyName } from './copy-labels';

/**
 * La recherche plein texte (plan §7) : par texte affiché, dans la langue
 * affichée — l'original, le publié et le brouillon, parce qu'on cherche ce qu'on
 * a vu à l'écran, quel que soit l'état où il se trouve. La clé et son libellé
 * comptent aussi : c'est ce qu'un développeur cite, et ce que l'écran nomme.
 */
export function matchesSearch(
  entry: ShopCopyEntryView,
  query: string,
  locale: ContentLocale,
): boolean {
  const needle = normalize(query);
  if (needle === '') {
    return true;
  }
  const view = entry.locales[locale];
  return [entry.key, copyName(entry).label, view.original, view.publishedText, view.draftText].some(
    (text) => text !== null && normalize(text).includes(needle),
  );
}

/** Sans casse ni accents : « reglement » trouve « Règlement ». */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr').trim();
}
