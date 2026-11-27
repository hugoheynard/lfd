import type { SaleUnit } from "@lfd/money";

import type { ProductionLineOption } from "../../../channels/commerce/day-orders.reader.js";

/**
 * **Ce qu'une version du plan garde** (`documentation/fournil/plan-historique-des-tirages.md`,
 * § 1.7 à 1.9) — des types, et aucune règle. Une forme de document : les
 * instants y sont des chaînes ISO, parce que le contenu s'écrit en `jsonb` et
 * se relit tel quel. `PLAN_VERSION_CONTENT_VERSION` numérote cette forme.
 *
 * Ni `sheetDetails`, ni `destination` complète (données personnelles,
 * inutiles au diff), ni fournées, ni marques de colisage.
 */
export const PLAN_VERSION_CONTENT_VERSION = 1;

/** Pourquoi une version a été écrite — les valeurs du CHECK `plan_versions.cause`. */
export type PlanVersionCause =
  | "closed"
  | "auto_closed"
  | "retaken"
  | "order_revised"
  | "order_withdrawn"
  | "resupply_launched"
  | "opened_by_resupply";

/**
 * Qui a fait le geste. Seul le staff porte un identifiant et un nom : un
 * client ou un invité n'entre pas au schéma `production` (`system` : l'arrêt
 * automatique).
 */
export type PlanVersionAuthor =
  | { readonly kind: "staff"; readonly staffId: string; readonly name: string | null }
  | { readonly kind: "customer" }
  | { readonly kind: "guest" }
  | { readonly kind: "system" };

/**
 * Comment un envoi est entré au plan, déduit de la version précédente
 * (§ 1.7) : `unknown` pour la première version d'une journée arrêtée avant
 * qu'on garde les versions.
 */
export type PlanEntry = "arrested" | "retaken" | "arrested_after_reopen" | "unchanged" | "unknown";

/** Une ligne d'un envoi ou d'un réassort, telle que la version la garde. */
export interface VersionedLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
  readonly saleUnit: SaleUnit;
  readonly options: readonly ProductionLineOption[];
}

/** Un envoi `(orderId, rank)` du plan. */
export interface VersionedShipment {
  readonly orderId: string;
  readonly rank: number;
  readonly reference: string;
  /** Le libellé du client, seul : ni adresse, ni contact. */
  readonly customerLabel: string;
  readonly fulfillmentMethod: "pickup" | "delivery";
  readonly dueAt: string | null;
  /** `null` : commande figée avant qu'on le garde — on ne savait pas. */
  readonly offPlan: boolean | null;
  readonly entry: PlanEntry;
  readonly lines: readonly VersionedLine[];
}

/** Une ligne du compte à produire, recopiée telle quelle (§ 1.9). */
export interface VersionedCount {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
  readonly saleUnit: SaleUnit;
}

/** Un réassort au plan : du soir, ou lancé (`launchedAt`, `launchedBy`). */
export interface VersionedResupply {
  readonly resupplyId: string;
  readonly siteId: string;
  readonly siteLabel: string | null;
  readonly name: string | null;
  readonly lines: readonly VersionedLine[];
}

/** Un réassort lancé « au plus tôt » : quand, et par quelle fiche staff. */
export interface VersionedLaunchedResupply extends VersionedResupply {
  readonly launchedAt: string;
  readonly launchedBy: string;
}

/**
 * Un envoi retiré après son inscription (« annulée après l'arrêt — toujours
 * produite »), lu au registre des retraits. `by` : l'auteur du geste quand
 * une version l'a vu passer ; `null` pour un retrait d'avant les versions.
 */
export interface VersionedWithdrawal {
  readonly orderId: string;
  readonly rank: number;
  readonly at: string;
  readonly by: PlanVersionAuthor | null;
}

/** Le contenu d'une version (`plan_versions.content`), forme 1. */
export interface PlanVersionContent {
  readonly shipments: readonly VersionedShipment[];
  readonly counts: readonly VersionedCount[];
  readonly resupplies: readonly VersionedResupply[];
  readonly launchedResupplies: readonly VersionedLaunchedResupply[];
  readonly withdrawn: readonly VersionedWithdrawal[];
}

/**
 * Un retrait après inscription tel que le registre le rend, avec l'auteur
 * quand l'écrivain le connaît (le geste du retrait lui-même).
 */
export interface WithdrawalEntry {
  readonly orderId: string;
  readonly at: Date;
  readonly by: PlanVersionAuthor | null;
}
