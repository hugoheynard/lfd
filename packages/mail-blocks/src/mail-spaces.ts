import type { MailCharter } from "./mail-charter.js";

/**
 * **Les espaces des e-mails** (plan `plan-editeur-par-blocs.md`, § 25) : la
 * page « E-mails » s'ouvre sur deux espaces, chacun avec sa charte
 * graphique. `lfc` — « La Folie Coffee — clients » ; `lfd` — « La Folie
 * Douce — équipe », qui range aussi les e-mails internes.
 *
 * L'espace n'est pas une valeur rangée : il se LIT de la charte du modèle
 * (`MailCharter`, déclarée dans le code), sans renommer aucune valeur.
 */
export const MAIL_SPACES = ["lfc", "lfd"] as const;

/** Un espace d'e-mails. */
export type MailSpace = (typeof MAIL_SPACES)[number];

/** Le nom d'un espace, tel que l'écran l'affiche. */
export const MAIL_SPACE_LABELS: Readonly<Record<MailSpace, string>> = {
  lfc: "La Folie Coffee — clients",
  lfd: "La Folie Douce — équipe",
};

/** L'espace où chaque charte de modèle est rangée : les e-mails internes sont à La Folie Douce (Hugo, 2026-11-07). */
const SPACE_OF_CHARTER: Readonly<Record<MailCharter, MailSpace>> = {
  lfc: "lfc",
  lfd: "lfd",
  internal: "lfd",
};

/** L'espace d'un modèle, lu de sa charte. */
export function mailSpaceOfCharter(charter: MailCharter): MailSpace {
  return SPACE_OF_CHARTER[charter];
}

/** Un espace connu ? (un paramètre de route n'est qu'une chaîne). */
export function isMailSpace(candidate: string): candidate is MailSpace {
  return MAIL_SPACES.some((space) => space === candidate);
}
