import { z } from "zod";

/**
 * **Rupture et stock faible au comptoir** — l'alerte qu'un point de retrait
 * déclare sur un article de sa vitrine (lot R1b de
 * `documentation/reassort-boutiques/plan-reapprovisionnement.md`, Hugo
 * 2026-10-21). Elle avertit le fournil ; elle n'a encore AUCUN effet sur la
 * boutique ni sur la passation (lot J2).
 */

/** `out_of_stock` : rupture ; `low` : stock faible. */
export const STOCK_ALERT_LEVELS = ["out_of_stock", "low"] as const;
export type StockAlertLevel = (typeof STOCK_ALERT_LEVELS)[number];

/** Une alerte vivante, telle que les écrans la lisent. */
export interface StockAlertView {
  readonly id: string;
  readonly siteId: string;
  readonly sku: string;
  /** Nom publié de l'article, figé à la première déclaration. */
  readonly label: string;
  readonly level: StockAlertLevel;
  /** Instant de la dernière déclaration (ISO 8601). */
  readonly declaredAt: string;
  /** Nom figé de qui l'a déclarée en dernier ; `null` si l'annuaire ne le connaissait pas. */
  readonly declaredBy: string | null;
}

/** `GET /admin/site-stock-alerts/sites/:siteId` — les alertes vivantes du point. */
export interface SiteStockAlertsView {
  readonly siteId: string;
  /** Les plus récemment déclarées d'abord. */
  readonly alerts: readonly StockAlertView[];
}

/** Les alertes vivantes d'un point, pour l'écran du fournil. */
export interface StockAlertSiteView {
  readonly siteId: string;
  /** Nom du point ; `null` s'il a disparu de l'annuaire des sites. */
  readonly siteLabel: string | null;
  readonly alerts: readonly StockAlertView[];
}

/** `GET /admin/site-stock-alerts/live` — les alertes vivantes de TOUS les points. */
export interface LiveStockAlertsView {
  readonly sites: readonly StockAlertSiteView[];
}

/**
 * `POST /admin/site-stock-alerts/sites/:siteId` — déclarer (ou redéclarer)
 * une alerte. Le libellé n'est PAS accepté : le serveur le lit au catalogue.
 */
export const declareStockAlertSchema = z
  .object({ sku: z.string().trim().min(1), level: z.enum(STOCK_ALERT_LEVELS) })
  .strict();
export type DeclareStockAlertPayload = z.infer<typeof declareStockAlertSchema>;
