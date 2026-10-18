import type { ContentLocale, ShopCopyAdminView } from '@lfd/contracts';

/**
 * La clé du libellé de la pastille. Elle garde son nom d'avant « les
 * incontournables » (2026-10-18) : une valeur n'est pas un nom.
 */
export const BADGE_COPY_KEY = 'product.bestSeller';

/** Le libellé de la pastille, langue par langue, tel que la boutique le sert. */
export interface BadgeCopy {
  readonly texts: Readonly<Record<ContentLocale, string>>;
  /** Une modification est en brouillon : elle ne se voit qu'après Publier. */
  readonly pendingDraft: boolean;
}

const LOCALES: readonly ContentLocale[] = ['fr', 'en', 'it'];

/**
 * Lu dans la vue de Textes de la boutique — la SEULE source : le texte publié
 * s'il y en a un, l'original du code sinon. `null` si la clé n'y est pas.
 */
export function badgeCopyOf(view: ShopCopyAdminView): BadgeCopy | null {
  const entry = view.entries.find((candidate) => candidate.key === BADGE_COPY_KEY);
  if (entry === undefined) {
    return null;
  }
  const textOf = (locale: ContentLocale): string =>
    entry.locales[locale].publishedText ?? entry.locales[locale].original ?? '';
  return {
    texts: { fr: textOf('fr'), en: textOf('en'), it: textOf('it') },
    pendingDraft: LOCALES.some((locale) => entry.locales[locale].draftState !== 'unchanged'),
  };
}
