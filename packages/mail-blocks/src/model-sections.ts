/**
 * **Les blocs du modèle** — ce que le code compose à partir des données (plan
 * `plan-editeur-par-blocs.md`, § 2). L'équipe les déplace et réécrit leurs
 * phrases ; elle ne les supprime pas.
 *
 * Ce sont les sections de la coquille (`LAYOUT_SECTIONS`, `@lfd/mailer`), dans
 * le même ordre, à une différence près : le bouton et son lien secondaire
 * forment UN bloc, `cta` — le lien n'est rendu qu'avec le bouton, et déplacé
 * seul il disparaîtrait (§ 11). En-tête, surtitre, logo, recours et pièces
 * jointes ne sont pas des blocs : ce sont des cadres fixes ou des données de
 * l'envoi.
 */
export const MODEL_SECTIONS = [
  "title",
  "body",
  "summary",
  "image",
  "itinerary",
  "cta",
  "footer",
] as const;

/** Un bloc du modèle. */
export type ModelSectionId = (typeof MODEL_SECTIONS)[number];

/** Un identifiant de bloc du modèle ? Une chaîne venue d'ailleurs ne l'est pas d'office. */
export function isModelSectionId(candidate: string): candidate is ModelSectionId {
  return MODEL_SECTIONS.some((id) => id === candidate);
}

/**
 * La section de la coquille qui se range dans le bloc d'une autre : le lien
 * secondaire suit son bouton.
 */
const ABSORBED_LAYOUT_SECTIONS: Readonly<Record<string, ModelSectionId>> = {
  secondaryLink: "cta",
};

/**
 * Le bloc du modèle qui porte une section de la coquille (`title`,
 * `secondaryLink`…), ou `null` pour un identifiant inconnu.
 */
export function modelSectionOfLayoutSection(layoutSection: string): ModelSectionId | null {
  if (isModelSectionId(layoutSection)) {
    return layoutSection;
  }
  return ABSORBED_LAYOUT_SECTIONS[layoutSection] ?? null;
}
