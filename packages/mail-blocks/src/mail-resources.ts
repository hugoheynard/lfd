import type { ModelSectionId } from "./model-sections.js";

/**
 * **Les ressources d'un e-mail** (plan `plan-editeur-par-blocs.md`, § 24,
 * lot R1) : ce que l'envoi fournit pour CHAQUE destinataire et que personne
 * n'écrit — des valeurs, des liens, des blocs de données. Une couche de
 * lecture pour la personne qui prépare l'e-mail : ce qui s'enregistre et ce
 * qui part ne change pas (`{ref}` reste `{ref}` dans le dictionnaire).
 */

/** La fiche d'une ressource : ce que l'écran montre au lieu du nom technique. */
export interface MailResourceCard {
  /** Le nom lisible (« Référence de commande »). */
  readonly label: string;
  /** Ce que c'est, du point de vue du destinataire, en une phrase. */
  readonly description: string;
}

/** Une valeur qu'un texte peut porter (`{ref}`), et sa fiche dans CET e-mail. */
export interface MailValueResource extends MailResourceCard {
  /** Le nom technique, celui qui s'écrit entre accolades. */
  readonly name: string;
  /** Une valeur d'exemple, tirée des données d'exemple de l'e-mail. */
  readonly example: string;
  /** Les phrases (chemins du dictionnaire) qui ont le droit de la porter. */
  readonly phrases: readonly string[];
}

/**
 * Où se pose un lien : le bouton du modèle (`cta`), ou le lien secondaire
 * qui le suit — les deux vivent dans le bloc du modèle `cta`.
 */
export type MailLinkSlot = "cta" | "secondaryLink";

/** Les emplacements de lien, dans l'ordre de la coquille. */
export const MAIL_LINK_SLOTS: readonly MailLinkSlot[] = ["cta", "secondaryLink"];

/** Un lien que l'e-mail fournit, calculé à l'envoi : il ne s'écrit pas. */
export interface MailLinkResource extends MailResourceCard {
  readonly slot: MailLinkSlot;
}

/** Les blocs du modèle qui affichent de la donnée : ils se placent, ils ne s'écrivent pas. */
export type MailDataBlockId = Extract<ModelSectionId, "summary" | "image" | "itinerary">;

/** Les blocs de données, dans l'ordre de la coquille. */
export const MAIL_DATA_BLOCK_IDS: readonly MailDataBlockId[] = ["summary", "image", "itinerary"];

/** Un bloc de données de l'e-mail, et ce qu'il montre dans CET e-mail. */
export interface MailDataBlockResource extends MailResourceCard {
  readonly block: MailDataBlockId;
  /**
   * **Quand le bloc s'affiche** (§ 24, conditions d'affichage, 2026-11-07) :
   * une phrase lue dans le code qui en décide (« Seulement pour un
   * retrait… »). Absent : le bloc s'affiche toujours. L'écran grise un bloc
   * absent de l'aperçu d'après cette phrase.
   */
  readonly condition?: string | undefined;
}

/**
 * **La situation de l'aperçu** (§ 24, 2026-11-07) : l'exemple rendu en
 * retrait ou en livraison, pour un e-mail dont un bloc en dépend
 * (`MailEditorView.situations`).
 */
export const MAIL_PREVIEW_SITUATIONS = ["pickup", "delivery"] as const;
export type MailPreviewSituation = (typeof MAIL_PREVIEW_SITUATIONS)[number];

/** Les ressources d'un e-mail, rangées par sorte. */
export interface MailEditorResources {
  readonly values: readonly MailValueResource[];
  readonly links: readonly MailLinkResource[];
  readonly dataBlocks: readonly MailDataBlockResource[];
}
