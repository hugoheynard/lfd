import { estimateStock } from "./estimated-stock.js";
import { expectedLinesOf, type ResupplyReceipt } from "./resupply-receipt.js";
import type { ResupplyOrigin } from "./resupply-origin.js";
import type { PlacedSiteResupplySnapshot, ResupplyTarget } from "./site-resupply.js";
import type { StockAlertLevel, StockAlertSnapshot } from "./stock-alert.js";

/** Où en est un réassort du jour, du moins avancé au plus avancé. */
export type DayStockResupplyState = "sent" | "frozen" | "arrived" | "received";

/** Un réassort du jour, au point. */
export interface DayStockResupply {
  readonly resupplyId: string;
  readonly name: string | null;
  readonly target: ResupplyTarget;
  readonly origin: ResupplyOrigin;
  readonly state: DayStockResupplyState;
  readonly pieces: number;
}

/** Un produit du point : reçu, alerte vivante, attendu non réceptionné. */
export interface DayStockProduct {
  readonly sku: string;
  readonly label: string;
  readonly stock: number;
  readonly alert: StockAlertLevel | null;
  readonly expected: number;
}

/** La journée de stock d'un point. */
export interface DayStock {
  readonly resupplies: readonly DayStockResupply[];
  readonly products: readonly DayStockProduct[];
}

/** Ce qu'il faut d'un point pour sa journée de stock. */
export interface DayStockInput {
  /** Ses réassorts envoyés pour la journée, annulés compris, dans l'ordre d'envoi. */
  readonly resupplies: readonly PlacedSiteResupplySnapshot[];
  /** Ses reçus de la journée, réassort sans commande compris. */
  readonly receipts: readonly ResupplyReceipt[];
  /** Ses alertes vivantes. */
  readonly alerts: readonly StockAlertSnapshot[];
  /** L'emballé au colisage par réassort, quand la fiche est close (R3b). */
  readonly packed: ReadonlyMap<string, ReadonlyMap<string, number> | null>;
  /** Le plan de la journée est-il arrêté ? Un « pour demain » y est alors figé. */
  readonly planStopped: boolean;
}

/**
 * **La journée de stock d'un point** (lot S1, l'onglet Stock de la
 * Supervision) : ses réassorts et l'état de chacun, puis ses produits.
 *
 * - Un réassort annulé n'y est que s'il avait été réceptionné : ce qui est
 *   arrivé reste arrivé (même règle que la page de réception).
 * - Le stock est celui de `estimateStock` — la somme des reçus RÉCEPTIONNÉS ;
 *   l'attendu, l'emballé (sinon le demandé) des réassorts non annulés pas
 *   encore réceptionnés. Le stock ne monte jamais à l'envoi.
 * - Un produit n'y est que s'il a un reçu, une alerte ou un attendu ; tri :
 *   alertes, puis attendus, puis le reste, par libellé à rang égal.
 */
export function dayStockOf(input: DayStockInput): DayStock {
  const byResupply = new Map(
    input.receipts.flatMap((receipt) =>
      receipt.resupplyId === null ? [] : [[receipt.resupplyId, receipt] as const],
    ),
  );
  const isReceived = (id: string): boolean => byResupply.get(id)?.status === "received";
  const shown = input.resupplies.filter((r) => r.cancelled === null || isReceived(r.id));
  const resupplies = shown.map((resupply) =>
    resupplyOf(resupply, isReceived(resupply.id), input.planStopped),
  );
  const pending = shown.filter((r) => r.cancelled === null && !isReceived(r.id));
  return { resupplies, products: productsOf(input, pending) };
}

function resupplyOf(
  resupply: PlacedSiteResupplySnapshot,
  received: boolean,
  planStopped: boolean,
): DayStockResupply {
  return {
    resupplyId: resupply.id,
    name: resupply.name,
    target: resupply.target,
    origin: resupply.origin,
    state: stateOf(resupply, received, planStopped),
    pieces: resupply.lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}

function stateOf(
  resupply: PlacedSiteResupplySnapshot,
  received: boolean,
  planStopped: boolean,
): DayStockResupplyState {
  if (received) {
    return "received";
  }
  if (resupply.arrived !== null) {
    return "arrived";
  }
  return resupply.target === "tomorrow" && planStopped ? "frozen" : "sent";
}

interface ProductTally {
  label: string;
  stock: number;
  alert: StockAlertLevel | null;
  expected: number;
}

function productsOf(
  input: DayStockInput,
  pending: readonly PlacedSiteResupplySnapshot[],
): readonly DayStockProduct[] {
  const tallies = new Map<string, ProductTally>();
  const tallyOf = (sku: string, label: string): ProductTally => {
    const known = tallies.get(sku) ?? { label, stock: 0, alert: null, expected: 0 };
    tallies.set(sku, known);
    return known;
  };
  for (const line of estimateStock(input.receipts)) {
    tallyOf(line.sku, line.label).stock += line.estimatedStock;
  }
  for (const resupply of pending) {
    for (const line of expectedLinesOf(resupply, input.packed.get(resupply.id) ?? null)) {
      tallyOf(line.sku, line.label).expected += line.quantity;
    }
  }
  for (const alert of input.alerts) {
    tallyOf(alert.sku, alert.label).alert = alert.level;
  }
  // Seuls entrent ceux qu'un reçu, un attendu ou une alerte a nommés : un
  // reçu corrigé à zéro reste un reçu, il est donc montré à 0.
  return [...tallies]
    .map(([sku, tally]) => ({ sku, ...tally }))
    .sort((a, b) => rankOf(a) - rankOf(b) || a.label.localeCompare(b.label, "fr"));
}

/** Alertes d'abord, puis attendus, puis le reste. */
function rankOf(product: DayStockProduct): number {
  if (product.alert !== null) {
    return 0;
  }
  return product.expected > 0 ? 1 : 2;
}
