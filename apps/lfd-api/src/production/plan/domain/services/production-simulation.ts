import type { ProductionGrouping, WorkshopGroupKind } from "@lfd/contracts";

import type { ProductionLineSnapshot, ProductionOrderSnapshot } from "../../../day/index.js";
import { groupingOf, type GroupingSource } from "../../../shared/print/index.js";

/**
 * **La simulation du catalogue en production** (plan
 * `fournil/plan-postes-du-fournil.md`, § 3.11) : une pièce de chaque article
 * vendable, dans UNE commande fictive, rangée dans le mode demandé par le
 * rangement même du dossier (`groupingOf`).
 *
 * 🔴 **Jamais persistée** : aucune journée ne la porte, aucun papier n'est
 * archivé ni envoyé. Fonctions pures — l'appelant lit les articles et ce que
 * le rangement demande.
 */

/** Un article à simuler : sa référence de déclinaison, et le nom qui s'imprime. */
export interface SimulatedArticle {
  readonly sku: string;
  readonly name: string;
}

/** L'identifiant de la commande fictive — aucune commande réelle ne le porte. */
export const SIMULATION_ORDER_ID = "simulation-order";

/** Une pièce par article, chaque référence une seule fois, dans l'ordre reçu. */
export function simulationLinesOf(
  articles: readonly SimulatedArticle[],
): readonly ProductionLineSnapshot[] {
  const bySku = new Map<string, ProductionLineSnapshot>();
  for (const article of articles) {
    if (!bySku.has(article.sku)) {
      bySku.set(article.sku, {
        sku: article.sku,
        productName: article.name,
        quantity: 1,
        saleUnit: "piece",
      });
    }
  }
  return [...bySku.values()];
}

/** La commande fictive qui porte ces lignes. */
export function simulationOrderOf(
  lines: readonly ProductionLineSnapshot[],
): ProductionOrderSnapshot {
  return {
    packed: null,
    orderId: SIMULATION_ORDER_ID,
    rank: 1,
    reference: "SIMULATION",
    customerLabel: "SIMULATION — ne pas produire",
    fulfillmentMethod: "pickup",
    destination: "SIMULATION",
    dueAt: null,
    clientele: null,
    siteId: null,
    lines,
    sheetDetails: null,
  };
}

/** Un groupe de la couverture : son titre, sa nature, son nombre de lignes. */
export interface SimulationCoverGroup {
  readonly title: string;
  readonly kind: WorkshopGroupKind;
  readonly lineCount: number;
}

/** Ce que la couverture de la simulation affirme. */
export interface SimulationCover {
  readonly mode: ProductionGrouping;
  readonly lineCount: number;
  readonly groups: readonly SimulationCoverGroup[];
  /** Les articles sans poste en mode prod, par nom ; toujours vide en mode boutique. */
  readonly unplaced: readonly string[];
}

/** La couverture : les lignes comptées par groupe, et les articles « à ranger » nommés. */
export function simulationCoverOf(
  lines: readonly ProductionLineSnapshot[],
  source: GroupingSource,
): SimulationCover {
  const groups = groupingOf(lines, (line) => line.sku, source);
  const unplaced = groups
    .filter((group) => group.unplaced)
    .flatMap((group) => group.lines.map((line) => line.productName))
    .sort((left, right) => left.localeCompare(right, "fr"));
  return {
    mode: source.mode,
    lineCount: lines.length,
    groups: groups.map((group) => ({
      title: group.title,
      kind: group.kind,
      lineCount: group.lines.length,
    })),
    unplaced,
  };
}
