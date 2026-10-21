import {
  IncompleteResupplyLineError,
  InvalidRequestedQuantityError,
} from "./site-resupply-errors.js";

/**
 * **Une ligne demandée** : un article du catalogue publié (SKU produit), son
 * libellé FIGÉ au geste, la quantité demandée. Aucun montant : un réassort est
 * un mouvement interne, jamais une vente.
 */
export class SiteResupplyLine {
  private constructor(
    readonly sku: string,
    readonly label: string,
    readonly quantity: number,
  ) {}

  /** Refusée si l'article manque ou si la quantité n'est pas un entier > 0. */
  static of(input: {
    readonly sku: string;
    readonly label: string;
    readonly quantity: number;
  }): SiteResupplyLine {
    const sku = input.sku.trim();
    const label = input.label.trim();
    if (sku === "" || label === "") {
      throw new IncompleteResupplyLineError();
    }
    if (!Number.isInteger(input.quantity) || input.quantity < 1) {
      throw new InvalidRequestedQuantityError(input.quantity);
    }
    return new SiteResupplyLine(sku, label, input.quantity);
  }
}
