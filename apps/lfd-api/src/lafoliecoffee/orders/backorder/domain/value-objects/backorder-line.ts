import { InvalidBackorderLineError } from "../errors/backorder-errors.js";

/** L'unité de la quantité, figée sur la ligne d'origine : des pièces, ou des grammes. */
export type BackorderSaleUnit = "piece" | "weight";

const SALE_UNITS: readonly BackorderSaleUnit[] = ["piece", "weight"];

/**
 * **Une ligne du reliquat** : un article, ce qui en reste, et l'unité de ce
 * reste — des pièces, ou des GRAMMES au poids (`saleUnit = weight`), comme
 * `order_line.quantity`. Pas de prix : il se relit sur la commande d'origine.
 */
export class BackorderLine {
  private constructor(
    readonly sku: string,
    readonly quantity: number,
    readonly saleUnit: BackorderSaleUnit,
  ) {}

  /** @throws {InvalidBackorderLineError} article vide, quantité non entière ou ≤ 0, unité inconnue. */
  static of(input: {
    readonly sku: string;
    readonly quantity: number;
    readonly saleUnit: string;
  }): BackorderLine {
    const sku = input.sku.trim();
    if (sku === "") {
      throw new InvalidBackorderLineError(input.sku, "l'article est vide");
    }
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new InvalidBackorderLineError(
        sku,
        `la quantité ${String(input.quantity)} n'est pas un entier positif`,
      );
    }
    const saleUnit = SALE_UNITS.find((unit) => unit === input.saleUnit);
    if (saleUnit === undefined) {
      throw new InvalidBackorderLineError(sku, `l'unité « ${input.saleUnit} » est inconnue`);
    }
    return new BackorderLine(sku, input.quantity, saleUnit);
  }
}
