import type { ResupplyTrace } from "./resupply-trace.js";

/**
 * Le suivi du stock d'un point jamais réglé : désactivé (décidé par Hugo le
 * 2026-11-19). On l'active point par point dans Réglages › Comptoir.
 */
export const STOCK_TRACKING_BY_DEFAULT = false;

/**
 * Le « Retrait immédiat » d'un point jamais réglé vérifie le stock reçu : la
 * case qui l'en dispense s'active point par point (Hugo, 2026-11-25).
 */
export const IMMEDIATE_WITHOUT_STOCK_BY_DEFAULT = false;

/**
 * **Le réglage du comptoir d'un point**, tel qu'il a été posé. Aucune règle
 * ne refuse son écriture : c'est une configuration, pas un agrégat
 * (CLAUDE.md § 3.1).
 */
export interface CounterStockSetting {
  readonly siteId: string;
  readonly stockTracking: boolean;
  readonly immediateWithoutStock: boolean;
  readonly updated: ResupplyTrace;
}
