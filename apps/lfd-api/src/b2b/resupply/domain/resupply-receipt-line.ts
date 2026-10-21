import {
  IncompleteReceiptLineError,
  InvalidReceivedQuantityError,
} from "./resupply-receipt-errors.js";

/**
 * **Une ligne reçue** : un article du catalogue publié (SKU produit), son
 * libellé FIGÉ au moment de la saisie, la quantité reçue. Aucun montant : un
 * réapprovisionnement est un mouvement interne, jamais une vente.
 */
export class ResupplyReceiptLine {
  private constructor(
    readonly sku: string,
    readonly label: string,
    readonly quantity: number,
  ) {}

  /** La ligne, refusée si l'article manque ou si la quantité n'est pas un entier ≥ 0. */
  static of(input: {
    readonly sku: string;
    readonly label: string;
    readonly quantity: number;
  }): ResupplyReceiptLine {
    const sku = input.sku.trim();
    const label = input.label.trim();
    if (sku === "" || label === "") {
      throw new IncompleteReceiptLineError();
    }
    assertReceivedQuantity(input.quantity);
    return new ResupplyReceiptLine(sku, label, input.quantity);
  }

  /** La même ligne, quantité corrigée. Le libellé reste celui figé à la saisie. */
  withQuantity(quantity: number): ResupplyReceiptLine {
    assertReceivedQuantity(quantity);
    return new ResupplyReceiptLine(this.sku, this.label, quantity);
  }
}

function assertReceivedQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new InvalidReceivedQuantityError(quantity);
  }
}
