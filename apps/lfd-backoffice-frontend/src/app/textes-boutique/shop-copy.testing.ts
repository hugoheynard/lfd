import type {
  ContentLocale,
  ShopCopyAdminView,
  ShopCopyEntryView,
  ShopCopyLocaleView,
} from '@lfd/contracts';

/** Une langue jamais touchée : le texte du code, révision 0. */
export function localeView(
  original: string | null,
  overrides: Partial<ShopCopyLocaleView> = {},
): ShopCopyLocaleView {
  return {
    original,
    draftState: 'unchanged',
    draftText: null,
    publishedText: null,
    revision: 0,
    draftAt: null,
    draftBy: null,
    ...overrides,
  };
}

/** Une clé et ses trois langues ; le texte du code est le même partout sauf mention. */
export function entryView(
  key: string,
  space: string | null,
  original: string,
  overrides: {
    readonly variables?: readonly string[];
    readonly locales?: Partial<Record<ContentLocale, Partial<ShopCopyLocaleView>>>;
    readonly staleTranslations?: readonly ContentLocale[];
  } = {},
): ShopCopyEntryView {
  const text = space === null ? null : original;
  return {
    key,
    space,
    variables: overrides.variables ?? [],
    locales: {
      fr: localeView(text, overrides.locales?.fr),
      en: localeView(text, overrides.locales?.en),
      it: localeView(text, overrides.locales?.it),
    },
    staleTranslations: overrides.staleTranslations ?? [],
  };
}

export function adminView(
  entries: readonly ShopCopyEntryView[],
  orphans: readonly ShopCopyEntryView[] = [],
): ShopCopyAdminView {
  return {
    version: 3,
    publishedAt: null,
    publishedBy: null,
    pendingCount: 0,
    entries,
    orphans,
  };
}

/** Une valeur qu'un test sait présente : l'absence y est une panne du test. */
export function present<T>(value: T | null): T {
  if (value === null) {
    throw new Error('valeur attendue absente');
  }
  return value;
}
