/**
 * Les langues dans lesquelles un e-mail peut partir — celles de la vitrine.
 *
 * Recopiées de `contentLocales` (`@lfd/contracts`) plutôt qu'importées : ce
 * paquet est une feuille, et le baril des contrats embarque zod. Un test côté
 * API (`mail-block-declarations.spec.ts`) échoue si les deux listes divergent.
 */
export const MAIL_LOCALES = ["fr", "en", "it"] as const;

/** Une langue d'e-mail. */
export type MailLocale = (typeof MAIL_LOCALES)[number];

/** Un texte par langue. Les langues exigées sont celles que le modèle déclare. */
export type Localized<T> = { readonly [L in MailLocale]?: T };
