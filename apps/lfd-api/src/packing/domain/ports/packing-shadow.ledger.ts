/** Une commande à coliser, telle que l'ombre l'inscrit. */
export interface ShadowOrderToDraw {
  readonly serviceDay: string;
  readonly orderId: string;
  readonly reference: string;
  readonly customerLabel: string;
  readonly fulfillmentMethod: "pickup" | "delivery";
  readonly dueAt: string | null;
  readonly drawnAt: Date;
  /** Additionnées par article : une ligne par SKU. */
  readonly lines: readonly {
    readonly sku: string;
    readonly productName: string;
    readonly quantity: number;
  }[];
}

/** Un fait reçu : une remise (`handoff`) ou un retour (`return`), une fois. */
export interface ShadowReceipt {
  /** `handoffId` ou `requestId` — la clé d'idempotence. */
  readonly id: string;
  readonly kind: "handoff" | "return";
  readonly serviceDay: string;
  readonly sku: string;
  /** Toujours positive : ce que la réserve gagne (`handoff`) ou rend (`return`). */
  readonly quantity: number;
  readonly receivedAt: Date;
}

/**
 * **L'ombre du colisage, en écriture** (plan `colisage/plan-domaine-colisage.md`,
 * K1, §12.2) — trois projections des faits du fournil.
 *
 * ⚠️ Des écritures ciblées, et c'est le cas que le §3.1 autorise : ce sont des
 * projections de faits durables, sans règle qui puisse les refuser. En K1 le
 * fournil a DÉJÀ décidé (une remise suit une fournée, un retour `legacy` suit
 * une annulation acceptée) ; l'ombre constate. L'agrégat — « au bac ≤ reçu −
 * rendu » — arrivera avec la mise au bac (K2), sur la ligne `packing_stock`.
 *
 * Chaque écriture est **commutative** : les faits arrivent dans le désordre
 * (§11, B3). Une remise reçue avant la liste est gardée dans la réserve.
 */
export abstract class PackingShadowLedger {
  /** Inscrit la commande et ses lignes si elles n'y sont pas ; ne réécrit jamais. */
  abstract drawOrder(order: ShadowOrderToDraw): Promise<void>;

  /**
   * Pose le reçu, puis — s'il est neuf — ajoute la quantité à la réserve
   * (`received` ou `returned`, selon `kind`). Un fait reçu deux fois ne compte
   * qu'une fois.
   *
   * @returns `false` si le reçu existait déjà.
   */
  abstract receive(receipt: ShadowReceipt): Promise<boolean>;
}
