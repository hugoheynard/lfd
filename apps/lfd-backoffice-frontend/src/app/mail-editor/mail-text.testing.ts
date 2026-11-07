import type {
  ContentLocale,
  MailCopyLocaleView,
  MailCopyTextView,
  MailSectionTextView,
} from '@lfd/contracts';

/** Une langue jamais touchée : le texte du code, révision 0. */
export function mailLocaleView(
  text: string | null,
  overrides: Partial<MailCopyLocaleView> = {},
): MailCopyLocaleView {
  return {
    default: text,
    draftState: 'unchanged',
    draftText: null,
    publishedText: null,
    revision: 0,
    draftAt: null,
    draftBy: null,
    defaultChangedSince: null,
    ...overrides,
  };
}

/** Un texte et ses trois langues ; le texte du code est le même partout sauf mention. */
export function mailTextView(
  mail: string,
  path: string,
  text: string,
  overrides: {
    readonly variables?: readonly string[];
    readonly requiredVariables?: readonly string[];
    readonly locales?: Partial<Record<ContentLocale, Partial<MailCopyLocaleView>>>;
    readonly staleTranslations?: readonly ContentLocale[];
  } = {},
): MailCopyTextView {
  return {
    mail,
    path,
    variables: overrides.variables ?? [],
    requiredVariables: overrides.requiredVariables ?? [],
    locales: {
      fr: mailLocaleView(text, overrides.locales?.fr),
      en: mailLocaleView(text, overrides.locales?.en),
      it: mailLocaleView(text, overrides.locales?.it),
    },
    staleTranslations: overrides.staleTranslations ?? [],
  };
}

/** Un texte rangé dans une carte ; `variant` : quand il s'affiche. */
export function sectionText(path: string, variant: string | null = null): MailSectionTextView {
  return { path, variant };
}
