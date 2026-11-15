import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/** Une ligne du plan : la commande qui la porte et son article. */
export interface PlannedOrderLineRef {
  readonly orderId: string;
  readonly sku: string;
}

/**
 * **« Lesquelles de ces commandes portent, au plan de cette journée, l'un de
 * ces articles ? »** — les lignes de `production_order_line` filtrées en base
 * par la journée, les commandes et les articles, sans relire la journée
 * entière. La retenue au retrait de la qualité la lit quand un blocage de
 * ligne est courant.
 */
export abstract class PlannedOrderLinesReader {
  abstract linesOf(
    day: ServiceDay,
    orderIds: readonly string[],
    skus: readonly string[],
  ): Promise<readonly PlannedOrderLineRef[]>;
}
