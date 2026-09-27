import { LoyaltyHolder } from "../value-objects/loyalty-holder.js";
import type { LoyaltySettings } from "../value-objects/loyalty-settings.js";

/**
 * Une commande définitive — remise ET encaissée — vue par la fidélité. La
 * définition de « définitive » appartient à la commande ; ce type n'en garde
 * que ce qu'il faut pour décider d'un gain.
 */
export interface EarnableOrder {
  readonly orderId: string;
  /** Le nom de la commande au journal — elle n'en a pas d'autre. */
  readonly orderNumber: string;
  readonly clientele: "pro" | "public";
  readonly companyId: string | null;
  readonly placedByUserId: string;
  /** Faux = un invité, sans compte connectable. */
  readonly buyerHasAccount: boolean;
  /** Les marchandises hors taxe, avant remise. */
  readonly subtotalCents: number;
  /** La remise du point de retrait, hors taxe. */
  readonly discountCents: number;
  /** La part du bon de fidélité imputée, hors taxe — `0` sans bon. */
  readonly voucherDiscountCents: number;
}

/** Un point par centime d'assiette HORS TAXE : 23,40 € HT rapportent 2 340 points. */
const POINTS_PER_CENT = 1;

/** Pourquoi une commande définitive ne rapporte rien. */
export type EarningSkipReason =
  "program_closed" | "clientele_closed" | "company_missing" | "guest_buyer" | "empty_basis";

export type OrderEarning =
  | { readonly kind: "earn"; readonly holder: LoyaltyHolder; readonly points: number }
  | { readonly kind: "skip"; readonly reason: EarningSkipReason };

/**
 * **Ce que rapporte une commande définitive, et à qui** (plan D1, D4).
 *
 * - le titulaire est la société pour `pro` — rien si elle a été supprimée —,
 *   la personne pour `public` — rien si c'est un invité, dont les points
 *   seraient inaccessibles ;
 * - l'assiette est le **hors taxe** des marchandises, remise ET bon de
 *   fidélité déduits : le HT réellement payé, et un point dépensé ne rapporte
 *   pas de point (plan C6, tranché par Hugo le 2026-09-27). Ni la TVA — on ne
 *   rend pas en crédit ce qu'on reverse à l'État (Hugo, 2026-09-26) —, ni le
 *   port, ni la surtaxe ;
 * - rien tant que le programme est fermé, ou fermé à cette clientèle.
 *
 * Un « rien » n'est pas une erreur : c'est le cas normal d'une grande part
 * des commandes, et l'abonné comme le rattrapage le traversent sans bruit.
 */
export function earningFor(order: EarnableOrder, settings: LoyaltySettings | null): OrderEarning {
  if (settings === null) {
    return skip("program_closed");
  }
  const holder = holderOf(order);
  if (typeof holder === "string") {
    return skip(holder);
  }
  if (!settings.isOpenTo(holder)) {
    return skip("clientele_closed");
  }
  const basisCents = order.subtotalCents - order.discountCents - order.voucherDiscountCents;
  if (basisCents <= 0) {
    return skip("empty_basis");
  }
  return { kind: "earn", holder, points: basisCents * POINTS_PER_CENT };
}

function holderOf(order: EarnableOrder): LoyaltyHolder | EarningSkipReason {
  if (order.clientele === "pro") {
    return order.companyId === null
      ? "company_missing"
      : LoyaltyHolder.of("company", order.companyId);
  }
  return order.buyerHasAccount ? LoyaltyHolder.of("user", order.placedByUserId) : "guest_buyer";
}

function skip(reason: EarningSkipReason): OrderEarning {
  return { kind: "skip", reason };
}
