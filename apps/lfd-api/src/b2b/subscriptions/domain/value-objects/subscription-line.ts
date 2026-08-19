import { InvalidSubscriptionLineError } from "../errors/subscription-errors.js";

/**
 * Une ligne de gabarit : une **référence catalogue** (SKU) et une **quantité**.
 * Le prix n'y est pas — il est ré-résolu à chaque échéance par le planificateur,
 * jamais figé dans l'abonnement.
 */
export class SubscriptionLine {
  private constructor(
    readonly sku: string,
    readonly quantity: number,
  ) {}

  static create(sku: string, quantity: number): SubscriptionLine {
    const trimmed = sku.trim();
    if (trimmed === "") {
      throw new InvalidSubscriptionLineError(sku, "SKU vide");
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new InvalidSubscriptionLineError(
        trimmed,
        "quantité entière strictement positive attendue",
      );
    }
    return new SubscriptionLine(trimmed, quantity);
  }
}
