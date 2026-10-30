import type { ReservedVisibility } from "@lfd/contracts";

/**
 * Port d'**écriture** du marqueur « sur mesure » et de la visibilité d'un
 * article réservé (plan `documentation/catalogue/plan-articles-sur-mesure.md`,
 * § 4, lot L1a).
 *
 * Deux colonnes écrites à partir de primitives, et c'est voulu : aucune règle
 * ne peut refuser ces écritures (« CRUD, pas d'agrégat », § 4). L'existence de
 * l'article se vérifie AVANT, par `CatalogItemRepository.load`.
 *
 * Ni l'une ni l'autre n'appartient à l'agrégat des décisions (`CatalogItem`) :
 * son écriture ne les touche pas, et celle-ci ne touche pas les siennes.
 */
export abstract class MadeToOrderSettings {
  /** @returns vrai si la valeur a changé — un geste sans effet n'écrit pas de fait. */
  abstract setMadeToOrder(sku: string, madeToOrder: boolean, at: Date): Promise<boolean>;

  /** @returns vrai si la valeur a changé. */
  abstract setReservedVisibility(
    sku: string,
    visibility: ReservedVisibility,
    at: Date,
  ): Promise<boolean>;
}
