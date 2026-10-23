import type {
  ContentLocale,
  MailAudience,
  MailCopyAdminView,
  MailCopyLocaleView,
  MailCopyMailView,
  MailCopyPreviewView,
  MailCopyTextView,
  MailFamily,
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

export function mailView(
  mail: string,
  texts: readonly MailCopyTextView[],
  overrides: {
    readonly audience?: MailAudience;
    readonly family?: MailFamily;
    readonly followsLocale?: boolean;
  } = {},
): MailCopyMailView {
  return {
    mail,
    audience: overrides.audience ?? 'customer',
    family: overrides.family ?? 'order',
    followsLocale: overrides.followsLocale ?? true,
    pendingCount: 0,
    texts,
  };
}

export function mailAdminView(
  mails: readonly MailCopyMailView[],
  orphans: readonly MailCopyTextView[] = [],
): MailCopyAdminView {
  return { version: 3, publishedAt: null, publishedBy: null, pendingCount: 0, mails, orphans };
}

export function previewView(overrides: Partial<MailCopyPreviewView> = {}): MailCopyPreviewView {
  return {
    mail: 'customer.order-placed',
    locale: 'fr',
    source: 'draft',
    subject: 'Commande EXEMPLE-1 reçue',
    html: '<p>Bonjour EXEMPLE</p>',
    attachments: [],
    ...overrides,
  };
}
