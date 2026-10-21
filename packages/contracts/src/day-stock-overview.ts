import type { ResupplyOrigin, ResupplyTarget } from "./site-resupply.js";
import type { StockAlertLevel } from "./site-stock-alert.js";

/**
 * **L'onglet Stock de la Supervision** (lot S1 de
 * `documentation/reassort-boutiques/plan-reapprovisionnement.md`,
 * 2026-10-22) — une journée, tous points : leurs réassorts et le stock de
 * leurs produits. Lecture seule ; aucun montant, un réassort n'est jamais une
 * vente.
 */

/**
 * Où en est un réassort du jour, du plus avancé au moins avancé :
 * `received` (réceptionné, R2) › `arrived` (le signal de R3e) › `frozen`
 * (« pour demain » d'un plan arrêté, R3a) › `sent` (envoyé).
 */
export type DayStockResupplyState = "sent" | "frozen" | "arrived" | "received";

/** Un réassort envoyé pour la journée. */
export interface DayStockResupplyView {
  readonly resupplyId: string;
  /** Son nom libre (R1g) ; `null` : sans nom. */
  readonly name: string | null;
  readonly target: ResupplyTarget;
  readonly origin: ResupplyOrigin;
  readonly state: DayStockResupplyState;
  /** Le nombre de pièces envoyées (la somme de ses lignes demandées). */
  readonly pieces: number;
}

/** Un produit du point : seulement s'il a un reçu, une alerte ou un attendu. */
export interface DayStockProductView {
  readonly sku: string;
  readonly label: string;
  /** La somme des reçus réceptionnés du jour ; 0 si rien n'est reçu. */
  readonly stock: number;
  /** L'alerte vivante (R1b) ; `null` sans alerte. */
  readonly alert: StockAlertLevel | null;
  /** Attendu des réassorts du jour pas encore réceptionnés ; 0 si rien n'est attendu. */
  readonly expected: number;
}

/** Un point de retrait, dans l'ordre des points. */
export interface DayStockSiteView {
  readonly siteId: string;
  /** `null` : un point que la table des points ne connaît plus. */
  readonly siteLabel: string | null;
  /** Dans l'ordre d'envoi. */
  readonly resupplies: readonly DayStockResupplyView[];
  /** Alertes d'abord, puis les attendus, puis le reste ; par libellé à rang égal. */
  readonly products: readonly DayStockProductView[];
}

/** La journée de stock de tous les points. */
export interface DayStockOverviewView {
  readonly serviceDay: string;
  readonly sites: readonly DayStockSiteView[];
}
