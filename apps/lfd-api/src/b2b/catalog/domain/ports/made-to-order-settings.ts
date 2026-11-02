import type { ReservedVisibility } from "@lfd/contracts";

/**
 * Port d'**écriture** de la visibilité d'un article réservé (plan
 * `documentation/catalogue/plan-articles-sur-mesure.md`, § 4, lot L1a).
 *
 * Une colonne écrite à partir de primitives, et c'est voulu : aucune règle ne
 * peut refuser cette écriture (« CRUD, pas d'agrégat », § 4). L'existence de
 * l'article se vérifie AVANT, par `CatalogItemRepository.load`.
 *
 * Elle n'appartient pas à l'agrégat des décisions (`CatalogItem`) : son
 * écriture ne la touche pas, et celle-ci ne touche pas les siennes. Le
 * marqueur « sur mesure » que ce port écrivait aussi est sorti par R3-1
 * (2026-11-02, § 13) : c'est un fait de la fiche du référentiel.
 */
export abstract class MadeToOrderSettings {
  /** @returns vrai si la valeur a changé — un geste sans effet n'écrit pas de fait. */
  abstract setReservedVisibility(
    sku: string,
    visibility: ReservedVisibility,
    at: Date,
  ): Promise<boolean>;
}
