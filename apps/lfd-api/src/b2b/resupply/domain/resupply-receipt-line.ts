import {
  IncompleteReceiptLineError,
  InvalidReceivedQuantityError,
} from "./resupply-receipt-errors.js";

/** Une ligne telle que l'adaptateur la relit. */
export interface ResupplyReceiptLineSnapshot {
  readonly sku: string;
  readonly label: string;
  readonly expectedQuantity: number | null;
  readonly receivedQuantity: number | null;
}

/**
 * **Une ligne d'un reçu** : un article (SKU produit), son libellé FIGÉ, ce qui
 * était **attendu** et ce qui a été **reçu** (lot R2,
 * `reassort-boutiques/plan-reapprovisionnement.md` §12). Aucun montant : un
 * réapprovisionnement est un mouvement interne, jamais une vente.
 *
 * - L'attendu est la quantité DEMANDÉE au réassort (la quantité emballée la
 *   remplacera en R3) ; `null` sur un réassort sans commande, où rien n'était
 *   attendu.
 * - Le reçu est `null` tant que le comptoir n'a pas réceptionné : seul le
 *   reçu fait le stock.
 */
export class ResupplyReceiptLine {
  private constructor(
    readonly sku: string,
    readonly label: string,
    readonly expectedQuantity: number | null,
    readonly receivedQuantity: number | null,
  ) {}

  /** Une ligne attendue d'un réassort, pas encore reçue. */
  static expected(input: {
    readonly sku: string;
    readonly label: string;
    readonly quantity: number;
  }): ResupplyReceiptLine {
    return ResupplyReceiptLine.of({
      sku: input.sku,
      label: input.label,
      expectedQuantity: input.quantity,
      receivedQuantity: null,
    });
  }

  /** Une ligne reçue sans rien d'attendu : le réassort sans commande. */
  static unordered(input: {
    readonly sku: string;
    readonly label: string;
    readonly quantity: number;
  }): ResupplyReceiptLine {
    return ResupplyReceiptLine.of({
      sku: input.sku,
      label: input.label,
      expectedQuantity: null,
      receivedQuantity: input.quantity,
    });
  }

  /** La ligne revalidée : article et libellé présents, quantités entières ≥ 0. */
  static of(input: ResupplyReceiptLineSnapshot): ResupplyReceiptLine {
    const sku = input.sku.trim();
    const label = input.label.trim();
    if (sku === "" || label === "") {
      throw new IncompleteReceiptLineError();
    }
    if (input.expectedQuantity !== null) {
      assertQuantity(input.expectedQuantity);
    }
    if (input.receivedQuantity !== null) {
      assertQuantity(input.receivedQuantity);
    }
    return new ResupplyReceiptLine(sku, label, input.expectedQuantity, input.receivedQuantity);
  }

  /** « Réceptionner » : l'attendu devient le reçu, tel quel. */
  receivedAsExpected(): ResupplyReceiptLine {
    return new ResupplyReceiptLine(
      this.sku,
      this.label,
      this.expectedQuantity,
      this.expectedQuantity ?? 0,
    );
  }

  /** La même ligne, reçu corrigé (un écart). L'attendu et le libellé ne bougent pas. */
  withReceived(quantity: number): ResupplyReceiptLine {
    assertQuantity(quantity);
    return new ResupplyReceiptLine(this.sku, this.label, this.expectedQuantity, quantity);
  }
}

function assertQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new InvalidReceivedQuantityError(quantity);
  }
}
