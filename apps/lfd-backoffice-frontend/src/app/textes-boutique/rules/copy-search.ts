import type { ShopCopyEntryView } from '@lfd/contracts';

import { COPY_LOCALES } from './copy-text';

/**
 * La recherche plein texte (plan §7) : par texte affiché, dans les trois
 * langues — l'original, le publié et le brouillon, parce qu'on cherche ce qu'on
 * a vu à l'écran, quel que soit l'état où il se trouve. La clé compte aussi :
 * c'est ce qu'un développeur cite.
 */
export function matchesSearch(entry: ShopCopyEntryView, query: string): boolean {
  const needle = normalize(query);
  if (needle === '') {
    return true;
  }
  if (normalize(entry.key).includes(needle)) {
    return true;
  }
  return COPY_LOCALES.some((locale) => {
    const view = entry.locales[locale];
    return [view.original, view.publishedText, view.draftText].some(
      (text) => text !== null && normalize(text).includes(needle),
    );
  });
}

/** Sans casse ni accents : « reglement » trouve « Règlement ». */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr').trim();
}
