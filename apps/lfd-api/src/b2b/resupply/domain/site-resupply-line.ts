import type { SaleUnit } from "./resupply-sale-unit.js";
import {
  IncompleteResupplyLineError,
  InvalidRequestedQuantityError,
} from "./site-resupply-errors.js";

/**
 * **Une ligne demandée** : un article du catalogue publié (SKU produit), son
 * libellé et son unité FIGÉS au geste, la quantité demandée — des pièces, ou
 * des GRAMMES si l'unité est `weight` (L2b-1). Aucun montant : un
 * réassort est un mouvement interne, jamais une vente.
 */
export class SiteResupplyLine {
  private constructor(
    readonly sku: string,
    readonly label: string,
    readonly quantity: number,
    readonly saleUnit: SaleUnit,
  ) {}

  /** Refusée si l'article manque ou si la quantité n'est pas un entier > 0 (pièces ou grammes). */
  static of(input: {
    readonly sku: string;
    readonly label: string;
    readonly quantity: number;
    readonly saleUnit: SaleUnit;
  }): SiteResupplyLine {
    const sku = input.sku.trim();
    const label = input.label.trim();
    if (sku === "" || label === "") {
      throw new IncompleteResupplyLineError();
    }
    if (!Number.isInteger(input.quantity) || input.quantity < 1) {
      throw new InvalidRequestedQuantityError(input.quantity);
    }
    return new SiteResupplyLine(sku, label, input.quantity, input.saleUnit);
  }

  /** La même ligne, une autre quantité dans la MÊME unité. */
  withQuantity(quantity: number): SiteResupplyLine {
    return SiteResupplyLine.of({ ...this, quantity });
  }
}
