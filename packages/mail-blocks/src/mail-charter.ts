/**
 * **Les trois chartes** qui existent dans les faits (plan
 * `plan-editeur-par-blocs.md`, § 4) : `lfc` — les clients, « La Folie
 * Coffee » ; `lfd` — l'équipe, « La Folie Douce », avec son recours ;
 * `internal` — les e-mails internes sans marque. La charte vient du modèle,
 * jamais de l'écran. L'adresse de recours est une donnée de l'envoi, pas un
 * trait de la charte.
 */
export const MAIL_CHARTERS = ["lfc", "lfd", "internal"] as const;

/** Une charte d'e-mail. */
export type MailCharter = (typeof MAIL_CHARTERS)[number];
