/**
 * **Les sections d'un e-mail, telles que le code les déclare** (plan
 * `documentation/contenu-ecommerce/plan-textes-des-e-mails.md`, E4, S1).
 *
 * Le domaine ne connaît que des identifiants opaques : ce que chacun rend est
 * l'affaire de la coquille. Il sait seulement QUELLES sections un e-mail a,
 * dans quel ordre par défaut, et quels textes elles portent.
 */

/** `text` : ses textes la font ; `system` : les données la produisent (S1). */
export type MailSectionNature = "text" | "system";

/** Un texte rattaché à une section ou à un cadre ; `variant` dit quand il s'affiche (S6). */
export interface MailSectionTextDescription {
  readonly path: string;
  readonly variant: string | null;
}

/** Une section déclarée. */
export interface MailSectionDescription {
  readonly id: string;
  readonly label: string;
  readonly nature: MailSectionNature;
  readonly texts: readonly MailSectionTextDescription[];
}

/** Un e-mail : ses cadres immobiles et ses sections, dans l'ordre par défaut. */
export interface MailLayoutDescription {
  readonly mail: string;
  readonly subject: readonly MailSectionTextDescription[];
  readonly header: readonly MailSectionTextDescription[];
  readonly sections: readonly MailSectionDescription[];
}

/**
 * Les deux cadres d'un e-mail (S2) : le bandeau d'en-tête et le recours. Ils
 * ne sont pas des sections ; un ordre qui les nomme est refusé en le disant.
 */
export const MAIL_FRAMES = ["header", "support"] as const;

/** L'ordre par défaut d'un e-mail : celui du code, qui rend les octets d'avant (S5). */
export function defaultSectionOrder(layout: MailLayoutDescription): readonly string[] {
  return layout.sections.map((section) => section.id);
}
