import type { InvoiceVatBreakdown } from "@lfd/money";

import type { InvoiceUnitCode } from "../value-objects/invoice-unit.js";

/**
 * Les types du **simulateur de dossier de facturation** (plan
 * `documentation/facturation/plan-simulateur-dossier-de-facturation.md`) :
 * ce qu'il reçoit — les bons tels que figés — et ce qu'il rend — la facture
 * calculée en une fois, et les trois écarts qui la séparent de la somme des bons.
 */

/** Le mode de TVA du port figé sur le bon ; `null` = bon d'avant le réglage, taxé au taux normal. */
export type FrozenDeliveryVatMode = "standard" | "follows_goods";

/** Une ligne de bon, telle que figée à la passation. */
export interface FrozenInvoiceLine {
  readonly sku: string;
  readonly productNameSnapshot: string;
  readonly unitPriceMillicents: number;
  /** Le `Decimal(5,2)` lu tel quel (« 5.50 ») : normalisé par le calcul, jamais par l'appelant. */
  readonly vatRate: string;
  readonly quantity: number;
  readonly lineTotalCents: number;
}

/** Une part de TVA figée sur un bon. */
export interface FrozenOrderVatShare {
  readonly rate: number;
  readonly amountCents: number;
}

/** Un bon du dossier, montants lus tels quels. */
export interface FrozenInvoiceOrder {
  readonly reference: string;
  readonly createdAt: Date;
  /** `AAAA-MM-JJ`, ou `null` : le bon n'a aucune date demandée. */
  readonly requestedDeliveryDate: string | null;
  readonly lines: readonly FrozenInvoiceLine[];
  readonly discountCents: number;
  readonly voucherDiscountCents: number;
  readonly deliveryFeeCents: number;
  readonly deliveryVatMode: FrozenDeliveryVatMode | null;
  readonly lateFeeCents: number;
  /** Lu dans `lateFeeAdjustment` ; `null` quand le bon ne l'a pas figé. */
  readonly lateFeeVatRate: number | null;
  /** `null` = bon d'avant le 2026-09-07, TVA non ventilée. */
  readonly vatShares: readonly FrozenOrderVatShare[] | null;
  readonly vatCents: number;
  readonly totalCents: number;
}

/** Une ligne de facture : un produit, à un prix, à un taux. */
export interface InvoiceLine {
  readonly sku: string;
  readonly unitPriceMillicents: number;
  readonly vatRate: number;
  /** Le nom du bon le plus récent de la clé. */
  readonly label: string;
  /** Les autres noms portés par les bons de la clé — « vendu aussi sous… ». */
  readonly otherLabels: readonly string[];
  /** L'unité de la quantité (UN/ECE Rec 20) — `H87`, la pièce, pour toute ligne d'aujourd'hui. */
  readonly unitCode: InvoiceUnitCode;
  readonly quantity: number;
  /** Σ `lineTotalCents` des bons de la clé — repris, pas recalculé (F6). */
  readonly amountCents: number;
  /**
   * Ce que les bons annonçaient pour la clé : Σ `lineTotalCents`. Égal à
   * `amountCents` depuis F6 ; gardé parce que le corps JSON des arrêtés le
   * porte, et que ceux figés avant F6 en diffèrent.
   */
  readonly ordersLineTotalCents: number;
  /** Première et dernière date demandée ; `null` si aucun bon de la clé n'en porte. */
  readonly firstDeliveryDate: string | null;
  readonly lastDeliveryDate: string | null;
}

/** Une ligne de livraison de la facture — une par mode présent dans le cycle. */
export interface InvoiceDeliveryLine {
  readonly mode: FrozenDeliveryVatMode;
  readonly amountCents: number;
}

/** La facture, calculée en une fois sur l'agrégat (plan, D4). */
export interface Invoice {
  readonly lines: readonly InvoiceLine[];
  /** Σ `discountCents` des bons — la remise société. */
  readonly companyDiscountCents: number;
  /** Σ `voucherDiscountCents` des bons — le bon de fidélité. */
  readonly voucherDiscountCents: number;
  /** Σ `lateFeeCents` des bons. */
  readonly lateFeeCents: number;
  readonly deliveries: readonly InvoiceDeliveryLine[];
  readonly vat: InvoiceVatBreakdown;
  readonly totalCents: number;
}

/** L'arrondi de la TVA d'un taux, bons ventilés seulement. */
export interface VatRoundingGap {
  readonly rate: number;
  /** La TVA du taux dans la facture, moins celle qui revient aux bons non ventilés. */
  readonly invoiceVatCents: number;
  /** Σ des parts `vatShares` du taux. */
  readonly ordersVatCents: number;
  readonly gapCents: number;
}

/**
 * Un bon dont le total figé ne se recompose pas à partir de ses montants
 * (remise plafonnée à la passation, ou autre) — signalé, jamais corrigé.
 */
export interface InconsistentOrder {
  readonly reference: string;
  /** `Σ lineTotalCents − remises + port + surtaxe + vatCents`. */
  readonly recomposedTotalCents: number;
  readonly totalCents: number;
  /** Recomposé − figé. */
  readonly gapCents: number;
}

/**
 * Les écarts du §3.4 — arrondi de la TVA, TVA non ventilée, plus un troisième
 * quand un bon est incohérent — leur somme est la différence au centime.
 * L'arrondi des lignes n'en est plus un depuis F6 (2026-10-08) : le montant
 * d'une ligne est repris des bons, l'écart est nul par construction.
 */
export interface InvoiceGaps {
  readonly vatRounding: readonly VatRoundingGap[];
  readonly vatRoundingCents: number;
  readonly unventilatedVat: {
    readonly invoiceVatCents: number;
    readonly ordersVatCents: number;
    readonly gapCents: number;
  };
  /**
   * Le dernier terme : Σ des écarts des bons incohérents. Zéro quand tous
   * les bons se recomposent — les deux écarts de TVA suffisent alors.
   */
  readonly inconsistentOrdersCents: number;
  readonly totalCents: number;
}

/** Le dossier : la facture, et de combien elle s'écarte de ses bons. */
export interface InvoiceDossier {
  readonly invoice: Invoice;
  readonly ordersTotalCents: number;
  /** Total facture − Σ `totalCents` des bons. */
  readonly differenceCents: number;
  readonly gaps: InvoiceGaps;
  /** Les bons dont le total ne se recompose pas ; vide quand l'invariant du plan tient. */
  readonly inconsistentOrders: readonly InconsistentOrder[];
  /** Faux dès qu'un bon est incohérent : les trois écarts ne suffisent plus à expliquer la différence. */
  readonly threeGapInvariantHolds: boolean;
}

/**
 * **Le lieu d'un bon** (§3.2) : retrait au labo, ou adresse livrée, lu dans
 * les snapshots figés à la passation.
 */
export interface DossierOrderPlace {
  readonly method: "pickup" | "delivery";
  /** Le nom du point de retrait ou de l'adresse ; `null` sans nom. */
  readonly label: string | null;
  /** L'adresse sur une ligne ; `null` quand le bon n'en a figé aucune lisible. */
  readonly address: string | null;
}
