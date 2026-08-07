import { InvalidOrderLineError } from "../errors/order-errors.js";

/** Ce que le catalogue résout pour une ligne (déjà autoritaire côté serveur). */
export interface OrderLineInput {
  readonly sku: string;
  readonly productName: string;
  /** Prix unitaire **HT**, en centimes. */
  readonly unitPriceCents: number;
  /** Taux de TVA du produit en %, ex. 5.5 ou 20. */
  readonly vatRate: number;
  readonly quantity: number;
}

/** Une ligne prête à persister (snapshots figés + total calculé). */
export interface OrderLineSnapshot extends OrderLineInput {
  /** Total **HT** de la ligne = prix unitaire × quantité, en centimes. */
  readonly lineTotalCents: number;
}

/**
 * Une **ligne de commande** — snapshot du catalogue (nom, prix HT, taux) au
 * moment de commander, et son total. Value-object : la quantité est strictement
 * positive, le prix non négatif, et `lineTotalCents` **dérive** du reste (jamais
 * fourni par l'appelant, jamais désynchronisé).
 */
export class OrderLine {
  private constructor(
    readonly sku: string,
    readonly productName: string,
    readonly unitPriceCents: number,
    readonly vatRate: number,
    readonly quantity: number,
    readonly lineTotalCents: number,
  ) {}

  static create(input: OrderLineInput): OrderLine {
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new InvalidOrderLineError(input.sku, "quantité entière strictement positive attendue");
    }
    if (!Number.isInteger(input.unitPriceCents) || input.unitPriceCents < 0) {
      throw new InvalidOrderLineError(input.sku, "prix unitaire en centimes ≥ 0 attendu");
    }
    return new OrderLine(
      input.sku,
      input.productName,
      input.unitPriceCents,
      input.vatRate,
      input.quantity,
      input.unitPriceCents * input.quantity,
    );
  }

  toSnapshot(): OrderLineSnapshot {
    return {
      sku: this.sku,
      productName: this.productName,
      unitPriceCents: this.unitPriceCents,
      vatRate: this.vatRate,
      quantity: this.quantity,
      lineTotalCents: this.lineTotalCents,
    };
  }
}
