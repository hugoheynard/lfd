import type { CartAdjustment } from "./cart-adjustment.js";
import type { DiscountLabelView } from "./discount-label.js";

/**
 * **Une remise de panier d'une commande, telle qu'un écran la lit** (`documentation/promotions/promotions.md`, § 2.11, lot M6) — une ligne de `order_discounts`, dans l'ordre
 * d'application, ou la remise unique des colonnes pour une commande non
 * reprise (repli `frozenBasketDiscountsOf`).
 *
 * Types seuls, sans zod : la boutique la lit, et son budget de démarrage ne
 * paie pas un schéma.
 */
export interface OrderDiscountView {
  /** Le libellé figé dans l'audience de l'acheteur ; absent sans libellé (repli « Remise »). */
  readonly label?: DiscountLabelView;
  /** Ce qui a produit la remise (% ou montant) ; `null` = commande d'avant la colonne. */
  readonly adjustment: CartAdjustment | null;
  /** Le montant de l'étape, HT, positif. */
  readonly amountCents: number;
  /** Son TTC figé — commande composée en TTC (`exact_ht`) seulement. */
  readonly amountTtcCents: number | null;
}
