import type { CartAdjustment, DeliveryVatMode, OrderRateAmounts } from "@lfd/contracts";
import type { SaleUnit } from "@lfd/money";

/**
 * **Ce que la reprise des remises lit d'une commande, et ce qu'elle en tire**
 * — plan `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
 * § 18.3, lot M2.
 *
 * Des formes du domaine, sans un type Prisma : l'adaptateur les remplit depuis
 * les colonnes figées, la reprise les juge, l'adaptateur écrit ce qu'elle rend.
 */

/** La méthode de composition figée sur la commande (`orders.vat_method`). */
export type RecoveryVatMethod = "line_ht" | "exact_ht";

/** Une ligne de commande ou de bon, telle que figée. */
export interface RecoveryLine {
  readonly unitPriceMillicents: number;
  readonly quantity: number;
  readonly saleUnit: SaleUnit;
  readonly vatRate: number;
  /** HT de la ligne, figé. */
  readonly lineTotalCents: number;
  /** `pickup_discount_eligible` ; une ligne de bon d'avant E4a (`NULL`) compte éligible. */
  readonly eligible: boolean;
}

/** Une ligne de commande : son identifiant devient la couverture `order_line_discounts`. */
export interface RecoveryOrderLine extends RecoveryLine {
  readonly id: string;
}

/** Un bon de livraison de la commande, avec ses colonnes de remise figées. */
export interface RecoveryNote {
  readonly id: string;
  readonly rank: number;
  readonly voided: boolean;
  /** `NULL` = bon d'avant E4a, sans en-tête : rien à reprendre. */
  readonly discountCents: number | null;
  readonly discountTtcCents: number | null;
  readonly lines: readonly RecoveryLine[];
}

/** La commande telle que la reprise la lit — rien n'y est recalculé à la lecture. */
export interface RecoveryOrder {
  readonly id: string;
  readonly orderNumber: string;
  readonly vatMethod: RecoveryVatMethod;
  readonly discountCents: number;
  readonly discountTtcCents: number | null;
  /** `NULL` : une commande d'avant la colonne — rien ne se recompose. */
  readonly discountAdjustment: CartAdjustment | null;
  readonly deliveryFeeAdjustment: CartAdjustment | null;
  readonly deliveryVatMode: DeliveryVatMode | null;
  readonly voucherTtcCents: number | null;
  readonly deliveryFeeTtcCents: number | null;
  /** `NULL` en `line_ht`, ou sur une commande `exact_ht` d'avant la colonne. */
  readonly ttcByRate: readonly OrderRateAmounts[] | null;
  readonly lines: readonly RecoveryOrderLine[];
  readonly notes: readonly RecoveryNote[];
}

/**
 * Une part par taux d'une remise. `vatCents` et `ttcCents` n'existent qu'en
 * `exact_ht` — le déclencheur de M3 refusera une part `ttcCents` sur une
 * remise sans `amount_ttc_cents` (§ 18.2).
 */
export interface DiscountVatShare {
  readonly rate: number;
  readonly htCents: number;
  readonly vatCents?: number;
  readonly ttcCents?: number;
}

/** Les montants d'une remise, sur la commande ou sur un bon. */
export interface RecoveredAmounts {
  /** HT, positif. */
  readonly amountCents: number;
  /** `exact_ht` seulement. */
  readonly amountTtcCents: number | null;
  readonly vatShares: readonly DiscountVatShare[];
}

/** La part d'un bon (`delivery_note_discounts`). */
export interface RecoveredNoteDiscount extends RecoveredAmounts {
  readonly noteId: string;
}

/**
 * `computed` : recomposée par `@lfd/money` et ÉGALE au figé — la seule qui
 * prouve l'égalité. `frozen` : recopiée des colonnes figées, sans recalcul,
 * parce que la recomposition s'en écartait (§ 18.3, point 4).
 */
export type RecoveryOrigin = "computed" | "frozen";

/** La remise de rang 1 à écrire, ses couvertures et ses parts de bons. */
export interface RecoveredDiscount extends RecoveredAmounts {
  readonly origin: RecoveryOrigin;
  /**
   * L'assiette de l'étape, au centime : au rang 1 c'est la somme entière des
   * lignes couvertes (HT en `line_ht`, TTC en `exact_ht`). Information
   * seulement, jamais relue pour calculer (§ 18.2).
   */
  readonly baseCents: number;
  readonly coveredLineIds: readonly string[];
  readonly notes: readonly RecoveredNoteDiscount[];
}

/**
 * Le verdict d'une commande. `undecided` : ni recomposable à l'identique, ni
 * recopiable sans inventer une part par taux — la question revient à Hugo
 * pour CETTE commande (§ 18.3, point 4), et rien n'est écrit.
 */
export type OrderDiscountRecovery =
  | {
      readonly kind: "recovered";
      readonly discount: RecoveredDiscount;
      readonly gap: string | null;
    }
  | { readonly kind: "undecided"; readonly reason: string };
