import {
  InvalidSubscriptionLineError,
  WeightArticleInSubscriptionError,
} from "../errors/subscription-errors.js";

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

  /**
   * **Une ligne qu'on demande d'ajouter**, avec l'unité dans laquelle
   * l'article se vend : un article au poids est refusé — un panier récurrent
   * ne compte que des pièces (`plan-vente-au-poids.md`, §2). La relecture
   * passe par {@link create} : ce qui est écrit a déjà été jugé.
   *
   * @throws {WeightArticleInSubscriptionError} l'article se vend au poids.
   * @throws {InvalidSubscriptionLineError} SKU vide, quantité invalide.
   */
  static requested(sku: string, quantity: number, saleUnit: "piece" | "weight"): SubscriptionLine {
    if (saleUnit === "weight") {
      throw new WeightArticleInSubscriptionError(sku.trim());
    }
    return SubscriptionLine.create(sku, quantity);
  }
}
