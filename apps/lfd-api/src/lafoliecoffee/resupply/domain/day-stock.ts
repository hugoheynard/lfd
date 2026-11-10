import type { EstimatedStockLine } from "./estimated-stock.js";
import { StockTallies } from "./stock-tally.js";
import { expectedLinesOf, type PackedLines, type ResupplyReceipt } from "./resupply-receipt.js";
import type { ResupplyOrigin } from "./resupply-origin.js";
import type { SaleUnit } from "./resupply-sale-unit.js";
import type { PlacedSiteResupplySnapshot, ResupplyTarget } from "./site-resupply.js";
import type { StockAlertLevel, StockAlertSnapshot } from "./stock-alert.js";

/**
 * Où en est un réassort du jour, du moins avancé au plus avancé : envoyé ›
 * figé (« pour demain », plan arrêté) › lancé (« au plus tôt », R4a) › parti
 * (sa tournée, R4d) › arrivé › réceptionné.
 */
export type DayStockResupplyState =
  "sent" | "frozen" | "launched" | "departed" | "arrived" | "received";

/** Un réassort du jour, au point. */
export interface DayStockResupply {
  readonly resupplyId: string;
  readonly name: string | null;
  readonly target: ResupplyTarget;
  readonly origin: ResupplyOrigin;
  readonly state: DayStockResupplyState;
  /** La somme des lignes à la pièce. */
  readonly pieces: number;
  /** La somme des lignes au poids, en grammes (L2b-1). */
  readonly weightGrams: number;
}

/** Un produit du point : reçu, alerte vivante, attendu non réceptionné. */
export interface DayStockProduct {
  readonly sku: string;
  readonly label: string;
  /** L'unité de `stock` et `expected` ; `null` pour une alerte seule (aucune quantité). */
  readonly saleUnit: SaleUnit | null;
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
  /** Son reste du jour, calculé par `DayShelfStock` sur ces mêmes reçus (L2). */
  readonly stock: readonly EstimatedStockLine[];
  /** Ses alertes vivantes. */
  readonly alerts: readonly StockAlertSnapshot[];
  /** L'emballé au colisage par réassort, quand la fiche est close (R3b). */
  readonly packed: ReadonlyMap<string, PackedLines | null>;
  /** Le plan de la journée est-il arrêté ? Un « pour demain » y est alors figé. */
  readonly planStopped: boolean;
}

/**
 * **La journée de stock d'un point** (S1, l'onglet Stock de la
 * Supervision) : ses réassorts et l'état de chacun, puis ses produits.
 *
 * - Un réassort annulé n'y est que s'il avait été réceptionné : ce qui est
 *   arrivé reste arrivé (même règle que la page de réception).
 * - Le stock est le reste du jour reçu tout fait (`DayShelfStock`, le stock du jour décompté, L2) —
 *   les reçus RÉCEPTIONNÉS moins ce que les commandes sur stock en ont pris ;
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
    pieces: sumOf(resupply, "piece"),
    weightGrams: sumOf(resupply, "weight"),
  };
}

function sumOf(resupply: PlacedSiteResupplySnapshot, unit: SaleUnit): number {
  return resupply.lines
    .filter((line) => line.saleUnit === unit)
    .reduce((sum, line) => sum + line.quantity, 0);
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
  if ((resupply.departed ?? null) !== null) {
    return "departed";
  }
  if ((resupply.launched ?? null) !== null) {
    return "launched";
  }
  return resupply.target === "tomorrow" && planStopped ? "frozen" : "sent";
}

interface ProductTally {
  readonly sku: string;
  readonly saleUnit: SaleUnit | null;
  readonly label: string;
  stock: number;
  alert: StockAlertLevel | null;
  expected: number;
}

/** Un compte ouvert par un reçu ou un attendu : il a toujours son unité. */
interface CountedTally extends ProductTally {
  readonly saleUnit: SaleUnit;
}

/**
 * Par (article, unité) — jamais pièces et grammes ensemble (L2b-1). Une
 * alerte n'a pas d'unité : elle se pose sur chaque compte de l'article, ou
 * seule, sans unité, s'il n'en a aucun.
 */
function productsOf(
  input: DayStockInput,
  pending: readonly PlacedSiteResupplySnapshot[],
): readonly DayStockProduct[] {
  const tallies = new StockTallies<CountedTally>((identity) => ({
    ...identity,
    stock: 0,
    alert: null,
    expected: 0,
  }));
  for (const line of input.stock) {
    tallies.of(line).stock += line.estimatedStock;
  }
  for (const resupply of pending) {
    for (const line of expectedLinesOf(resupply, input.packed.get(resupply.id) ?? null)) {
      tallies.of(line).expected += line.quantity;
    }
  }
  const counted = tallies.values();
  const alertsAlone: ProductTally[] = [];
  for (const alert of input.alerts) {
    const named = counted.filter((tally) => tally.sku === alert.sku);
    if (named.length === 0) {
      alertsAlone.push({
        sku: alert.sku,
        saleUnit: null,
        label: alert.label,
        stock: 0,
        alert: alert.level,
        expected: 0,
      });
    }
    for (const tally of named) {
      tally.alert = alert.level;
    }
  }
  // Seuls entrent ceux qu'un reçu, un attendu ou une alerte a nommés : un
  // reçu corrigé à zéro reste un reçu, il est donc montré à 0.
  return [...counted, ...alertsAlone]
    .map((tally) => ({ ...tally }))
    .sort((a, b) => rankOf(a) - rankOf(b) || a.label.localeCompare(b.label, "fr"));
}

/** Alertes d'abord, puis attendus, puis le reste. */
function rankOf(product: DayStockProduct): number {
  if (product.alert !== null) {
    return 0;
  }
  return product.expected > 0 ? 1 : 2;
}
