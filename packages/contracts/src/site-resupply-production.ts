import type { OrderSaleUnit } from "./order.js";
import type { ResupplyArticleView } from "./resupply-receipt.js";
import type { SiteResupplyView } from "./site-resupply.js";

/**
 * **Les réassorts vus du fournil**, en lecture — « Réassorts à produire » et
 * l'onglet « Réassorts » de Prod manager. Sortis de `site-resupply.ts` le
 * 2026-11-03 (audit final du réassort) pour qu'il tienne en un fichier ; les
 * noms exportés n'ont pas changé.
 */

/** Un article à produire pour une journée, tous points confondus — un total par unité. */
export interface ResupplyTotalView {
  readonly sku: string;
  readonly label: string;
  readonly quantity: number;
  /** Des grammes si `weight` (lot L2b-1). */
  readonly saleUnit: OrderSaleUnit;
}

/** Ce qu'un point a demandé pour une journée : ses réassorts placés. */
export interface ResupplySiteToProduceView {
  readonly siteId: string;
  /** Nom du point ; `null` s'il a disparu de l'annuaire des sites. */
  readonly siteLabel: string | null;
  readonly resupplies: readonly SiteResupplyView[];
}

export interface ResupplyDayToProduceView {
  /**
   * `AAAA-MM-JJ`. Aujourd'hui porte les « au plus tôt » du jour ET la
   * commande d'hier soir pour aujourd'hui : chaque réassort dit sa visée.
   */
  readonly serviceDay: string;
  readonly sites: readonly ResupplySiteToProduceView[];
  /** Le cumul par article de la journée, dans l'ordre de première demande. */
  readonly totals: readonly ResupplyTotalView[];
}

/**
 * `GET /admin/site-resupplies/to-produce` — l'écran du fournil, EN LECTURE :
 * les réassorts placés d'aujourd'hui (« au plus tôt ») puis de demain.
 * Distinct des commandes client.
 */
export interface ResuppliesToProduceView {
  readonly days: readonly ResupplyDayToProduceView[];
}

/**
 * `GET /admin/site-resupplies/to-produce/:day` — l'onglet « Réassorts » de
 * Prod manager (lot R3d, `reassort-boutiques/README.md`,
 * Hugo 2026-10-21) : UNE journée, et ses réassorts pour demain MÊME figés.
 *
 * Là où `ResuppliesToProduceView` tait les réassorts figés (ils sont sur la
 * feuille du fournil, R3a), celle-ci les montre et dit pourquoi ils ne
 * bougent plus : `planStopped`.
 */
export interface ResupplyProductionDayView extends ResupplyDayToProduceView {
  /**
   * Le plan du fournil pour cette journée est arrêté : ses réassorts « pour
   * demain » y sont figés (ni ajout, ni annulation). Les « au plus tôt » ne
   * le sont jamais.
   */
  readonly planStopped: boolean;
  /** Le catalogue publié de la boutique, sans prix : les lignes de la table et leurs familles. */
  readonly articles: readonly ResupplyArticleView[];
  /**
   * Les points de la journée servis par transfert (lot R3e) : leurs réassorts
   * arrivent à la réception du transfert. Aux autres (servis sur place), le
   * fournil dit « Monté ».
   */
  readonly transferSiteIds: readonly string[];
}
