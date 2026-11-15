import type { SaleUnit } from "@lfd/money";

import type { ServiceRange } from "../value-objects/service-range.value-object.js";

/** Une ligne d'un compte à produire arrêté, ou d'un réassort d'une journée arrêtée. */
export interface ArrestedPlanLine {
  readonly serviceDay: string;
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
  readonly saleUnit: SaleUnit;
}

/**
 * **« Que portent les plans arrêtés de cette plage ? »** — les lignes du
 * compte à produire et des réassorts des seules journées CLOSES, et le nombre
 * de feuilles d'atelier de chaque journée. Une requête par question sur toute
 * la plage : le prévisionnel du plan les regroupe lui-même.
 */
export abstract class ArrestedPlanLinesReader {
  /** Le compte à produire des journées closes, par jour puis article. */
  abstract countLinesBetween(range: ServiceRange): Promise<readonly ArrestedPlanLine[]>;

  /** Les lignes de réassort des journées closes, par article. */
  abstract resupplyLinesBetween(range: ServiceRange): Promise<readonly ArrestedPlanLine[]>;

  /** Le nombre de feuilles d'atelier de chaque journée de la plage. */
  abstract orderCountsBetween(range: ServiceRange): Promise<ReadonlyMap<string, number>>;
}
