import type { PickupDiscountBaseView } from "@lfd/contracts";

import { eligibleSubtotalCents } from "./pickup-discount-eligibility.js";

/**
 * **« Remise retrait sur X € éligibles »** — l'assiette d'une remise de
 * retrait, dite au client quand elle ne couvre pas tout le panier (lot C du
 * plan `livraisons/clientele/plan-remise-retrait-par-clientele-et-exclusions.md`).
 *
 * Pure, et partagée par le devis de la boutique, la lecture d'une commande et
 * le bon : le hors taxe passe par `eligibleSubtotalCents`, la fonction même
 * qui a donné son assiette à la remise — pas de second calcul.
 */

/** Une ligne déjà chiffrée, et ce que la remise en dit. */
export interface PickupDiscountBaseLine {
  readonly sku: string;
  readonly lineTotalCents: number;
  readonly lineTotalTtcCents: number | null;
  readonly eligible: boolean;
}

/**
 * L'assiette, ou `null` quand il n'y a rien à dire : pas de remise de retrait,
 * ou aucune ligne exclue.
 *
 * `hasPickupDiscount` est décidé par l'appelant : le devis le sait par son
 * ajustement, la commande par sa remise figée.
 */
export function pickupDiscountBaseOf(
  hasPickupDiscount: boolean,
  lines: readonly PickupDiscountBaseLine[],
): PickupDiscountBaseView | null {
  const excluded = lines.filter((line) => !line.eligible);
  if (!hasPickupDiscount || excluded.length === 0) {
    return null;
  }
  const excludedSkus = new Set(excluded.map((line) => line.sku));
  const eligible = lines.filter((line) => line.eligible);
  return {
    eligibleHtCents: eligibleSubtotalCents(
      lines.map((line) => ({ sku: line.sku, htCents: line.lineTotalCents })),
      excludedSkus,
    ),
    eligibleTtcCents: eligible.every((line) => line.lineTotalTtcCents !== null)
      ? eligible.reduce((sum, line) => sum + (line.lineTotalTtcCents ?? 0), 0)
      : null,
    excludedSkus: excluded.map((line) => line.sku),
  };
}

/** Ce qu'une commande figée porte de quoi refaire l'assiette. */
export interface FrozenPickupDiscountOrder {
  readonly discountCents: number;
  readonly lines: readonly {
    readonly sku: string;
    readonly lineTotalCents: number;
    readonly lineTotalTtcCents: number | null;
    readonly pickupDiscountEligible?: false;
  }[];
}

/**
 * La même assiette, **depuis les lignes figées** d'une commande : le drapeau
 * de chaque ligne a été posé à la passation, la règle du jour n'y entre pas.
 * Rendue comme un champ à étaler — vide quand il n'y a rien à dire, pour que
 * la clé reste absente.
 */
export function frozenPickupDiscountBaseOf(order: FrozenPickupDiscountOrder): {
  readonly pickupDiscountBase?: PickupDiscountBaseView;
} {
  const base = pickupDiscountBaseOf(
    // `discountCents` d'une commande est la seule remise de retrait : le bon
    // de fidélité a sa propre colonne.
    order.discountCents > 0,
    order.lines.map((line) => ({
      sku: line.sku,
      lineTotalCents: line.lineTotalCents,
      lineTotalTtcCents: line.lineTotalTtcCents,
      eligible: line.pickupDiscountEligible !== false,
    })),
  );
  return base === null ? {} : { pickupDiscountBase: base };
}
