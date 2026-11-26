import type { OrderStatus, PaymentStatus } from "@lfd/contracts";

/**
 * Ce que sert l'export des ventes (plan `documentation/commandes/export/plan-export-des-ventes.md`,
 * § 3). Tous les montants sont en **euros** — deux décimales, cinq pour un
 * prix unitaire —, toutes les dates en ISO 8601 à l'heure de Paris avec leur
 * décalage, et un `null` reste un `null` : une donnée absente n'est jamais
 * servie comme un zéro ou une chaîne vide. Aucune donnée personnelle.
 */
export interface SalesExportView {
  readonly orders: readonly SalesExportOrderView[];
  readonly lines: readonly SalesExportLineView[];
  readonly creditNotes: readonly SalesExportCreditNoteView[];
  readonly summary: readonly SalesExportDayView[];
}

/** La TVA d'un taux ; la base HT et le TTC n'existent que pour une commande composée en TTC. */
export interface RateAmountsView {
  readonly rate: number;
  readonly ht: number | null;
  readonly vat: number;
  readonly ttc: number | null;
}

/** Un remboursement réussi : un montant TTC, sans ligne ni TVA. */
export interface RefundView {
  readonly refundedAt: string;
  readonly amountTtc: number;
  readonly nature: string | null;
}

/** Les montants figés au solde d'une commande. */
export interface SettledAmountsView {
  readonly settledOn: string | null;
  readonly subtotalHt: number;
  readonly discountHt: number;
  readonly voucherHt: number;
  readonly deliveryFeeHt: number;
  readonly lateFeeHt: number;
  readonly totalHt: number;
  readonly vat: number;
  readonly totalTtc: number;
}

/** Une commande passée (§ 3.2). */
export interface SalesExportOrderView {
  readonly orderNumber: string;
  /** À la minute (§ 7). */
  readonly placedAt: string;
  readonly receivedOn: string | null;
  readonly status: OrderStatus;
  readonly cancelledAt: string | null;
  readonly countsAsRevenue: boolean;
  readonly paymentStatus: PaymentStatus;
  readonly settlementVenue: string | null;
  readonly offered: boolean;
  /** La nature de l'offre (`in_house` : une commande interne d'un de nos restaurants), `null` hors offre. */
  readonly offerNature: string | null;
  readonly offeredTtc: number | null;
  readonly clientele: "pro" | "public" | null;
  readonly buyerKind: string;
  /** L'enseigne d'aujourd'hui, à défaut la raison sociale ; `null` pour un particulier. */
  readonly companyName: string | null;
  readonly nafCode: string | null;
  readonly fulfillment: "pickup" | "delivery";
  readonly vatMethod: string;
  readonly subtotalHt: number;
  readonly discountHt: number;
  readonly voucherHt: number;
  readonly deliveryFeeHt: number;
  readonly lateFeeHt: number;
  /** HT total, port et pénalité compris : `totalTtc − vat`. */
  readonly totalHt: number;
  /** « CA marchandises HT », celui du cockpit : `subtotal − remise − bon`, sans port ni pénalité. */
  readonly goodsHt: number;
  readonly vat: number;
  readonly totalTtc: number;
  readonly vatByRate: readonly RateAmountsView[] | null;
  readonly settled: SettledAmountsView | null;
  readonly refunds: readonly RefundView[];
  /** La seule somme à déduire du CA (§ 5). */
  readonly returnRefundedTtc: number;
}

/** Un article vendu (§ 3.3) ; la somme des lignes n'est pas le HT de la commande. */
export interface SalesExportLineView {
  readonly orderNumber: string;
  readonly sku: string;
  readonly article: string;
  readonly familyId: string | null;
  /** Le nom d'aujourd'hui de la famille ; `null` sans famille ou famille inconnue. */
  readonly family: string | null;
  readonly quantity: number;
  readonly saleUnit: string;
  readonly unitPriceHt: number;
  readonly lineHt: number;
  readonly vatRate: number;
  readonly lineTtc: number | null;
  readonly discountIds: readonly string[];
}

/** Un avoir émis dans la période (§ 3.4), ses montants tels quels. */
export interface SalesExportCreditNoteView {
  readonly number: string;
  readonly issuedOn: string;
  readonly companyName: string | null;
  readonly ht: number;
  readonly vat: number;
  readonly ttc: number;
  readonly orderNumbers: readonly string[];
}

/** Les chiffres du CA d'un ensemble de commandes, en euros. */
export interface RevenueTallyView {
  readonly orders: number;
  /** HT total, port et pénalité compris. */
  readonly revenueHt: number;
  /** « CA marchandises HT », celui du cockpit (`caGoodsCents`). */
  readonly goodsHt: number;
  readonly vat: number;
  readonly revenueTtc: number;
  readonly vatByRate: readonly { readonly rate: number; readonly vat: number }[] | null;
  readonly returnRefundedTtc: number;
  readonly netRevenueTtc: number;
}

/** Une ligne du résumé (§ 3.5). */
export interface SalesExportDayView extends RevenueTallyView {
  readonly day: string;
  readonly byClientele: {
    readonly pro: RevenueTallyView;
    readonly public: RevenueTallyView;
    readonly unknown: RevenueTallyView;
  };
  readonly creditNotesHt: number;
  readonly creditNotesVat: number;
  readonly creditNotesTtc: number;
}
