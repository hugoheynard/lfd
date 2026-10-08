import type { StatementCycleView } from "./cycle-statement.js";
import type { VatShareView } from "./order.js";

/**
 * **Le dossier de facturation simulé** — la facture calculée en une fois sur
 * les bons d'un payeur et d'un cycle, les bons tels que figés, et les écarts
 * qui séparent l'une des autres (plan
 * `documentation/facturation/plan-simulateur-dossier-de-facturation.md`).
 *
 * Ce n'est pas une facture émise : aucun numéro, aucune mention, rien n'est
 * prélevé sur sa base. Tous les montants en centimes.
 *
 * ⚠️ Des interfaces seulement, comme `cycle-statement.ts` : le serveur ne lit
 * à l'exécution que `statementMonthSchema`, déjà publié. Le `?month=` du
 * dossier est celui du relevé.
 */

/** Le mode de TVA du port : taux normal, ou au prorata des marchandises. */
export type InvoiceDeliveryVatModeView = "standard" | "follows_goods";

/** Une ligne de facture : un produit, à un prix, à un taux. */
/** Les unités admises sur une ligne de facture (UN/ECE Rec 20). */
export type InvoiceUnitCodeView = "H87" | "KGM";

/** Pourquoi la facture de ce dossier ne pourrait pas être émise — un manque, nommé. */
export interface InvoiceIssuanceBlockerView {
  readonly code:
    | "no_issuer"
    | "several_issuers"
    | "issuer_archived"
    | "seller_incomplete"
    | "payment_terms_missing"
    | "buyer_unknown"
    | "buyer_siren_missing"
    | "buyer_vat_missing";
  /** Rédigé par le domaine, pour du personnel : le manque et le geste. */
  readonly message: string;
}

export interface InvoiceDossierLineView {
  readonly sku: string;
  /** Prix unitaire HT en millicentimes (10⁻⁵ €), figé sur les bons. */
  readonly unitPriceMillicents: number;
  /** `5.5`, normalisé. */
  readonly vatRate: number;
  readonly label: string;
  /** « vendu aussi sous… ». */
  readonly otherLabels: readonly string[];
  /** L'unité de la quantité (UN/ECE Rec 20) : `H87` (pièce) aujourd'hui, `KGM` plus tard. */
  readonly unitCode: InvoiceUnitCodeView;
  readonly quantity: number;
  /** Σ `lineTotalCents` des bons de la clé — repris, pas recalculé (F6, 2026-10-08). */
  readonly amountCents: number;
  /** Σ `lineTotalCents` des bons de la clé — égal à `amountCents` depuis F6. */
  readonly ordersLineTotalCents: number;
  readonly firstDeliveryDate: string | null;
  readonly lastDeliveryDate: string | null;
}

/** La part d'une remise ou d'un frais sur un taux. `key` nomme sa nature. */
export interface InvoiceDossierVatPartView {
  readonly key: string;
  readonly amountCents: number;
}

/** Un taux de la facture : sa base, ses remises, ses frais, sa TVA. */
export interface InvoiceDossierVatCategoryView {
  readonly rate: number;
  readonly goodsHtCents: number;
  readonly allowances: readonly InvoiceDossierVatPartView[];
  readonly charges: readonly InvoiceDossierVatPartView[];
  readonly taxableBaseCents: number;
  /** `arrondi(base imposable × taux)`, sur la base arrondie. */
  readonly vatCents: number;
}

/** La ventilation de la facture par taux. */
export interface InvoiceDossierVatView {
  readonly categories: readonly InvoiceDossierVatCategoryView[];
  readonly goodsHtCents: number;
  readonly allowancesCents: number;
  readonly chargesCents: number;
  readonly taxableBaseCents: number;
  readonly vatCents: number;
  readonly totalCents: number;
}

/** La facture, calculée en une fois. */
export interface InvoiceDossierInvoiceView {
  readonly lines: readonly InvoiceDossierLineView[];
  readonly companyDiscountCents: number;
  readonly voucherDiscountCents: number;
  readonly lateFeeCents: number;
  readonly deliveries: readonly {
    readonly mode: InvoiceDeliveryVatModeView;
    readonly amountCents: number;
  }[];
  readonly vat: InvoiceDossierVatView;
  readonly totalCents: number;
}

/** Une ligne de bon, figée. */
export interface InvoiceDossierOrderLineView {
  readonly sku: string;
  readonly productNameSnapshot: string;
  readonly unitPriceMillicents: number;
  /** Le `Decimal(5,2)` du bon, tel quel. */
  readonly vatRate: string;
  readonly quantity: number;
  readonly lineTotalCents: number;
}

/** Le lieu d'un bon : retrait au labo, ou adresse livrée, figés à la passation. */
export interface InvoiceDossierPlaceView {
  readonly method: "pickup" | "delivery";
  readonly label: string | null;
  /** L'adresse sur une ligne ; `null` quand le bon n'en a figé aucune lisible. */
  readonly address: string | null;
}

/**
 * Un fait de la frise d'un bon (DF3). `handed_over` = retiré au comptoir ;
 * `handed_over_at_door` = remis au client à la porte ; `deposited` = déposé
 * sans personne ; `departed` = parti en tournée ; `brought_back` = rapporté ;
 * `replaced` = remis dans une tournée après un retour.
 */
export interface InvoiceDossierHistoryEventView {
  readonly kind:
    "handed_over" | "handed_over_at_door" | "deposited" | "departed" | "brought_back" | "replaced";
  /** ISO. */
  readonly at: string;
  /** `AAAA-MM-JJ` de la tournée, pour un fait de livraison. */
  readonly serviceDay: string | null;
  /** `scan`, `manual` ou `deposit`, pour un fait de retrait. */
  readonly via: "scan" | "manual" | "deposit" | null;
}

/** Un bon du dossier, montants tels que figés. */
export interface InvoiceDossierOrderView {
  /** Le numéro de commande. */
  readonly reference: string;
  /** ISO — la passation, qui range le bon dans le cycle. */
  readonly placedAt: string;
  /** `AAAA-MM-JJ`, ou `null`. */
  readonly requestedDeliveryDate: string | null;
  readonly lines: readonly InvoiceDossierOrderLineView[];
  readonly discountCents: number;
  readonly voucherDiscountCents: number;
  readonly deliveryFeeCents: number;
  /** `null` = bon d'avant le réglage, taxé au taux normal. */
  readonly deliveryVatMode: InvoiceDeliveryVatModeView | null;
  readonly lateFeeCents: number;
  readonly lateFeeVatRate: number | null;
  /** `null` = « TVA non ventilée » (bon d'avant le 2026-09-07). */
  readonly vatShares: readonly VatShareView[] | null;
  readonly vatCents: number;
  readonly totalCents: number;
  readonly place: InvoiceDossierPlaceView;
  /** La frise retrait / livraison, du plus ancien au plus récent. */
  readonly history: readonly InvoiceDossierHistoryEventView[];
  /**
   * Le jour de la tournée qui l'a livré à la porte — la date réelle d'un bon
   * rapporté puis replacé. `null` au comptoir, ou pas encore livré.
   */
  readonly actualDeliveryDay: string | null;
}

/** Un bon dont le total figé ne se recompose pas à partir de ses montants. */
export interface InvoiceDossierInconsistentOrderView {
  readonly reference: string;
  readonly recomposedTotalCents: number;
  readonly totalCents: number;
  /** Recomposé − figé : le quatrième terme des écarts. */
  readonly gapCents: number;
}

/**
 * Les écarts entre la facture et la somme des bons ; leur somme est la
 * différence. Plus d'arrondi des lignes depuis F6 (2026-10-08) : le montant
 * d'une ligne est repris des bons.
 */
export interface InvoiceDossierGapsView {
  readonly vatRounding: readonly {
    readonly rate: number;
    readonly invoiceVatCents: number;
    readonly ordersVatCents: number;
    readonly gapCents: number;
  }[];
  readonly vatRoundingCents: number;
  readonly unventilatedVat: {
    readonly invoiceVatCents: number;
    readonly ordersVatCents: number;
    readonly gapCents: number;
  };
  /** Σ des écarts des bons incohérents ; `0` quand tous se recomposent. */
  readonly inconsistentOrdersCents: number;
  readonly totalCents: number;
}

/** Le dossier d'un payeur pour un cycle. */
export interface InvoiceDossierView {
  readonly companyId: string;
  readonly companyName: string;
  readonly cycle: StatementCycleView;
  /** Le périmètre du relevé, en toutes lettres. */
  readonly scope: string;
  /** Références des bons facturés sans AUCUN fait de retrait — à voir en premier. */
  readonly neverHandedOver: readonly string[];
  readonly invoice: InvoiceDossierInvoiceView;
  readonly orders: readonly InvoiceDossierOrderView[];
  readonly ordersTotalCents: number;
  /** Total facture − Σ total des bons. */
  readonly differenceCents: number;
  readonly gaps: InvoiceDossierGapsView;
  readonly inconsistentOrders: readonly InvoiceDossierInconsistentOrderView[];
  /** Faux dès qu'un bon est incohérent : la différence a un quatrième terme. */
  readonly threeGapInvariantHolds: boolean;
  /** Bons livrés un autre mois que celui de leur passation — signalés, pas retirés. */
  readonly otherMonthOrders: readonly {
    readonly reference: string;
    readonly requestedDeliveryDate: string;
  }[];
  /** Références des bons sans date demandée. */
  readonly ordersWithoutDate: readonly string[];
  /**
   * Ce qui empêcherait d'émettre la facture de ce payeur aujourd'hui (plan
   * `plan-emission-de-la-facture.md`, E0) — vendeur, mentions, acheteur. Vide
   * quand rien ne manque. Rien n'est émis ici : c'est un signalement.
   */
  readonly issuanceBlockers: readonly InvoiceIssuanceBlockerView[];
}
