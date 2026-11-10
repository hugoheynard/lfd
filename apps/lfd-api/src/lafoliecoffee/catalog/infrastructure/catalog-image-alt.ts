import { isDescriptiveAltText } from "@lfd/pim-contracts";

/**
 * L'alternative d'une copie `catalog_items`, telle que le commerce la SERT.
 *
 * Jusqu'au 2026-10-26, le contrat de la médiathèque repliait une alternative
 * absente sur l'URL du fichier, et l'envoi du catalogue a recopié ce repli
 * dans `image_alt` / `thumbnail_alt`. Les copies ne sont pas réécrites
 * (`documentation/mediatheque/plan-alternatives-urls.md`) : une alternative
 * qui ne décrit rien — URL, chemin, nom de fichier — est donc lue comme
 * absente, avec la forme vide que le commerce sert déjà pour l'absence.
 *
 * La règle est celle du contrat (`isDescriptiveAltText`), importée plutôt que
 * recopiée : la médiathèque (`storedAlt`) et le commerce lisent la même.
 */
export function servedImageAlt(stored: string | null): string {
  return isDescriptiveAltText(stored) ? stored : "";
}
