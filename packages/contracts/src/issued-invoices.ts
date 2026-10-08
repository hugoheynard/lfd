/**
 * **Les factures émises**, telles que le client (« Mes factures ») et la
 * fiche client du back-office les lisent (plan
 * `documentation/comptabilite/facturation/plan-emission-de-la-facture.md`, lot E6).
 * Types seulement : aucune valeur, rien n'entre dans le paquet exécuté par
 * la boutique. Montants en centimes, prix unitaires en millicentimes.
 *
 * Aucun statut de paiement : une pièce émise est immuable, l'encaissement
 * vit ailleurs (§ 5 du plan).
 */

/** `invoice` = 380, `credit_note` = 381. */
export type IssuedInvoiceKind = "invoice" | "credit_note";

/** Une ligne de la liste. */
export interface IssuedInvoiceSummaryView {
  readonly invoiceId: string;
  /** `FA-AAAA-NNNNNN`. */
  readonly number: string;
  readonly kind: IssuedInvoiceKind;
  /** Le numéro de la facture qu'un avoir corrige ; `null` pour une facture. */
  readonly correctedInvoiceNumber: string | null;
  /** `AAAA-MM-JJ`. */
  readonly issuedOn: string;
  /** `AAAA-MM-JJ` ; `null` pour un avoir. */
  readonly dueOn: string | null;
  /** `AAAA-MM` — le mois des commandes facturées ; `null` hors facture du mois. */
  readonly period: string | null;
  readonly totalHtCents: number;
  readonly totalVatCents: number;
  readonly totalTtcCents: number;
  /**
   * Le PDF/A-3 Factur-X est-il rendu et rangé (E3b) ? Faux juste après
   * l'émission, ou si le rendu a échoué (le journal de la pièce dit pourquoi).
   * Vrai : `GET …/invoices/:invoiceId/pdf` le sert.
   */
  readonly documentAvailable: boolean;
}

/** `GET companies/:companyId/invoices` et `GET admin/companies/:companyId/invoices`. */
export interface IssuedInvoicesView {
  /** Les plus récentes d'abord. */
  readonly invoices: readonly IssuedInvoiceSummaryView[];
}

/** Le vendeur figé — sans ses coordonnées bancaires. */
export interface IssuedInvoiceSellerView {
  readonly name: string;
  readonly legalForm: string;
  readonly siren: string;
  readonly vatNumber: string;
  readonly rcs: string;
  readonly shareCapitalCents: number;
  readonly addressLines: readonly string[];
}

/** L'acheteur figé — le payeur légal. */
export interface IssuedInvoiceBuyerView {
  readonly name: string;
  readonly legalForm: string;
  readonly siren: string;
  readonly vatNumber: string;
  readonly billingAddressLines: readonly string[];
}

export interface IssuedInvoiceLineView {
  readonly sku: string;
  readonly label: string;
  /** `H87` pièce, `KGM` kilogramme. */
  readonly unitCode: string;
  /** En millièmes d'unité — 1 pièce = 1000. */
  readonly quantityThousandths: number;
  readonly unitPriceMillicents: number;
  readonly vatRate: number;
  readonly amountCents: number;
}

/** Un taux de la ventilation. */
export interface IssuedInvoiceVatCategoryView {
  readonly rate: number;
  readonly goodsHtCents: number;
  readonly allowancesCents: number;
  readonly chargesCents: number;
  readonly taxableBaseCents: number;
  readonly vatCents: number;
}

export interface IssuedInvoiceOrderView {
  /** Le numéro du bon. */
  readonly reference: string;
  /** `AAAA-MM-JJ`, ou `null` : non livré (ou inconnu) à l'émission. */
  readonly deliveredOn: string | null;
}

/** `GET companies/:companyId/invoices/:invoiceId` et `GET admin/accounting/invoices/:invoiceId`. */
export interface IssuedInvoiceView extends IssuedInvoiceSummaryView {
  /** L'id du payeur légal — le client le connaît déjà, la fiche s'en sert pour le lien. */
  readonly payerCompanyId: string;
  readonly seller: IssuedInvoiceSellerView;
  readonly buyer: IssuedInvoiceBuyerView;
  readonly orders: readonly IssuedInvoiceOrderView[];
  readonly lines: readonly IssuedInvoiceLineView[];
  readonly vat: {
    readonly categories: readonly IssuedInvoiceVatCategoryView[];
    readonly goodsHtCents: number;
    readonly allowancesCents: number;
    readonly chargesCents: number;
  };
  readonly mentions: {
    /** Points de base — 1 % = 100. */
    readonly latePenaltyRateBasisPoints: number;
    readonly recoveryIndemnityCents: number;
    readonly earlyPaymentDiscount: string;
  };
  /** La RUM figée du prélèvement ; `null` : aucun mandat unique à l'émission. */
  readonly mandateReference: string | null;
  /**
   * Le jour où la facture a été réglée par carte (`AAAA-MM-JJ`) : elle est
   * ACQUITTÉE (lot E5a, BT-113). `null` : rien n'était payé à l'émission.
   */
  readonly paidOn: string | null;
}

/**
 * **Une facture carte signalée** (lot E5a) : la commande est retirée et
 * payée, mais sa facture n'a pas pu être émise — `message` dit pourquoi, en
 * clair. « Réessayer » la rejoue une fois la fiche corrigée.
 */
export interface CardInvoiceSignalView {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly payerCompanyId: string;
  readonly payerName: string;
  readonly message: string;
  /** ISO 8601 — la dernière tentative. */
  readonly recordedAt: string;
}

/** `GET admin/accounting/card-invoices/signals`. */
export interface CardInvoiceSignalsView {
  readonly signaled: readonly CardInvoiceSignalView[];
}

/**
 * Ce que « Réessayer » a donné (`POST admin/accounting/card-invoices/:orderId/retry`) :
 * émise, de nouveau signalée, ou rien à émettre — déjà facturée, pas une
 * commande carte, pas encore payée ou retirée, remboursée en totalité.
 */
export type CardInvoiceOutcome =
  | "issued"
  | "blocked"
  | "already_invoiced"
  | "not_card"
  | "awaiting_payment"
  | "awaiting_handover"
  | "fully_refunded";

export interface CardInvoiceRetryView {
  readonly outcome: CardInvoiceOutcome;
  /** Le numéro de la facture émise ; `null` sinon. */
  readonly number: string | null;
  /** Le refus en clair quand elle reste signalée ; `null` sinon. */
  readonly message: string | null;
}

/**
 * `GET admin/accounting/orders/:orderId/invoices` — la facture et les avoirs
 * qui portent une commande, dans l'ordre des numéros (lot E5c).
 */
export interface OrderInvoicesView {
  readonly invoices: readonly IssuedInvoiceSummaryView[];
}
