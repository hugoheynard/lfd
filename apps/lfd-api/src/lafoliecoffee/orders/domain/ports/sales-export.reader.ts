import type { OrderStatus, PaymentStatus } from "@lfd/contracts";

import type { BillableAmounts } from "../entities/billable-amounts.js";
import type { OrderBuyerKind } from "../value-objects/order-buyer-kind.js";
import type { OrderRateAmounts } from "../value-objects/order-rate-amounts.js";
import type { OrderVatMethod } from "../value-objects/order-vat-method.js";
import type { SettlementVenue } from "../value-objects/settlement-venue.js";

/** Pour qui la commande a été passée ; `null` pour une commande d'avant la distinction. */
export type SalesExportClientele = "pro" | "public" | null;

/** Une ligne d'article, telle que la commande l'a figée — montants tels qu'en base. */
export interface SalesExportLine {
  readonly sku: string;
  /** Le nom figé à la passation. */
  readonly productName: string;
  /** La famille de la vente ; `null` pour une ligne d'avant la colonne. */
  readonly categoryId: string | null;
  /** Des pièces, ou des grammes quand `saleUnit = "weight"`. */
  readonly quantity: number;
  readonly saleUnit: string;
  /** Prix unitaire HT (au kilo pour un article au poids), en millicentimes. */
  readonly unitPriceMillicents: number;
  readonly lineTotalCents: number;
  /** Le taux en pourcentage (`5.5`). */
  readonly vatRate: number;
  /** `null` pour une commande composée en HT, ou d'avant le TTC par ligne. */
  readonly lineTotalTtcCents: number | null;
  /** Les remises de panier qui couvrent cette ligne — jamais leur part chiffrée. */
  readonly discountIds: readonly string[];
}

/** Ce qu'une commande soldée a figé (`billable_*`, `settled_on`). */
export interface SalesExportSettlement {
  readonly amounts: BillableAmounts;
  /** `AAAA-MM-JJ`. */
  readonly settledOn: string | null;
}

/**
 * Une commande passée, ses montants en centimes tels qu'en base, et son
 * verdict de chiffre d'affaires. Aucune donnée personnelle : la société n'y
 * est qu'un identifiant opaque, la personne n'y est pas.
 */
export interface SalesExportOrder {
  readonly orderNumber: string;
  readonly placedAt: Date;
  /** Le jour où la marchandise a changé de mains, `AAAA-MM-JJ` ; `null` = pas encore. */
  readonly receivedOn: string | null;
  readonly status: OrderStatus;
  readonly cancelledAt: Date | null;
  /** Le périmètre du CA partagé avec le cockpit (`countsAsRevenue`). */
  readonly countsAsRevenue: boolean;
  readonly paymentStatus: PaymentStatus;
  readonly settlementVenue: SettlementVenue | null;
  readonly offered: boolean;
  /** La valeur TTC d'une commande offerte, dont le total est nul ; `null` sinon. */
  readonly offeredTotalCents: number | null;
  readonly clientele: SalesExportClientele;
  readonly buyerKind: OrderBuyerKind;
  /** La société qui commande (`company_id`) ; `null` pour un particulier. */
  readonly companyId: string | null;
  readonly fulfillment: "pickup" | "delivery";
  readonly vatMethod: OrderVatMethod;
  /** Les totaux de la commande ; `totalCents` est le TTC. */
  readonly amounts: BillableAmounts;
  /** La base HT par taux, posée pour `exact_ht` seulement. */
  readonly ttcByRate: readonly OrderRateAmounts[] | null;
  /** `null` tant que la commande n'est pas soldée. */
  readonly settlement: SalesExportSettlement | null;
  readonly lines: readonly SalesExportLine[];
}

/**
 * **Les commandes passées d'une période, pour l'export des ventes** — lecture
 * publiée par `orders`, propriétaire de ses tables (CLAUDE.md § 3, « le
 * propriétaire parle de ce qui est à lui »). Le contexte du reporting la
 * compose sans lire `orders` ni `order_lines`.
 *
 * Toutes les commandes passées sont rendues, annulées comprises : c'est
 * `countsAsRevenue` qui dit lesquelles font du CA, avec le périmètre même que
 * le cockpit importe. Une seule lecture pour toute la période, lignes et
 * remises couvertes comprises — jamais une requête par commande.
 */
export abstract class SalesExportReader {
  /**
   * Les commandes dont le jour de passation (Europe/Paris) est entre `fromDay`
   * et `toDay`, bornes incluses (`AAAA-MM-JJ`, validés par l'appelant), de la
   * plus ancienne à la plus récente.
   */
  abstract placedBetween(fromDay: string, toDay: string): Promise<readonly SalesExportOrder[]>;
}
