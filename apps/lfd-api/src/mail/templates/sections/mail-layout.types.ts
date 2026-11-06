import type { LayoutSectionId } from "@lfd/mailer";

import type { B2bMails } from "../mail-templates.js";

/**
 * **Les sections d'un e-mail, déclarées par gabarit** (plan
 * `documentation/contenu-ecommerce/plan-textes-des-e-mails.md`, E4, S1 et S6).
 *
 * Une déclaration dit, pour un e-mail du registre, quelles sections du corps
 * son gabarit peut rendre, et à quelle section appartient chacun de ses textes
 * du dictionnaire. L'ordre par défaut n'y est PAS écrit : c'est celui de la
 * coquille (`LAYOUT_SECTIONS`), le seul qui rende les mêmes octets
 * qu'avant les sections (S5).
 */

/**
 * La nature d'une section (S1) : `text` — ses textes la font, ils se
 * réécrivent ; `system` — les données la produisent (un QR, un montant, un
 * lien), et ses éventuels libellés seuls se réécrivent.
 */
export type MailSectionNature = "text" | "system";

/**
 * Un texte du dictionnaire rattaché à une section. `variant` : le nom lisible
 * qui dit QUAND ce texte s'affiche plutôt que ses voisins (S6, « Commande
 * payée par carte ») — absent pour un texte sans alternative.
 */
export interface MailSectionText {
  readonly path: string;
  readonly variant?: string;
}

/** Une section déclarée d'un e-mail. */
export interface MailSectionDeclaration {
  readonly id: LayoutSectionId;
  /** Le libellé propre à cet e-mail ; absent, celui de la section (`SECTION_LABELS`). */
  readonly label?: string;
  /** Absente, celle de la section (`SECTION_NATURES`). */
  readonly nature?: MailSectionNature;
  readonly texts: readonly MailSectionText[];
}

/**
 * Un e-mail : ses deux cadres — l'objet et l'en-tête, qui ne se déplacent
 * pas — et ses sections, dans l'ordre par défaut de la coquille. Le recours
 * (l'adresse de l'admin) n'a aucun texte au dictionnaire : il n'apparaît pas.
 */
export interface MailLayoutDeclaration {
  readonly subject: readonly MailSectionText[];
  readonly header: readonly MailSectionText[];
  readonly sections: readonly MailSectionDeclaration[];
}

/** Une déclaration par e-mail du registre — exhaustive par construction. */
export type MailLayouts = { readonly [K in keyof B2bMails]: MailLayoutDeclaration };

/** La nature par défaut de chaque section. */
export const SECTION_NATURES: Readonly<Record<LayoutSectionId, MailSectionNature>> = {
  title: "text",
  body: "text",
  summary: "system",
  image: "system",
  itinerary: "system",
  cta: "system",
  secondaryLink: "system",
  footer: "text",
};

/** Le libellé par défaut de chaque section, tel que l'écran le montre. */
export const SECTION_LABELS: Readonly<Record<LayoutSectionId, string>> = {
  title: "Titre",
  body: "Paragraphes",
  summary: "Récapitulatif",
  image: "Image",
  itinerary: "Itinéraire vers la boutique",
  cta: "Bouton",
  secondaryLink: "Lien secondaire",
  footer: "Pied",
};

/** Des textes sans alternative. */
export function texts(...paths: readonly string[]): readonly MailSectionText[] {
  return paths.map((path) => ({ path }));
}

/** Les variantes d'un texte : chemin → quand il s'affiche. */
export function variants(byPath: Readonly<Record<string, string>>): readonly MailSectionText[] {
  return Object.entries(byPath).map(([path, variant]) => ({ path, variant }));
}

/** Les variantes `prefix.<clé>` d'une famille, nommées par la même table. */
export function variantsOf(
  prefix: string,
  labels: Readonly<Record<string, string>>,
): readonly MailSectionText[] {
  return Object.entries(labels).map(([key, variant]) => ({ path: `${prefix}.${key}`, variant }));
}

/** Le titre « Bonjour {firstName} » et sa forme sans prénom. */
export const NAMED_TITLE: readonly MailSectionText[] = variants({
  title: "Prénom connu",
  titleWithoutName: "Prénom inconnu",
});

/** L'objet seul, en cadre ; l'en-tête seul, son sous-titre. */
export const SUBJECT: readonly MailSectionText[] = texts("subject");
export const KICKER: readonly MailSectionText[] = texts("kicker");
