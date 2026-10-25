import type { CartAdjustment, SheetFulfillment, SheetMoney } from "@lfd/contracts";

import { money } from "./order-sheet-pdf-format.js";

/**
 * **Le libellé de la remise de retrait**, sur tout papier qui la chiffre — bon
 * de commande, bon de livraison chiffré.
 *
 * `discountCents` d'une commande est TOUJOURS la remise du point de retrait
 * (vérifié le 2026-10-25 : seul `discount_adjustment`, figé sur la commande, la
 * produit ; le bon de fidélité a sa propre colonne). « Remise » tout court ne
 * disait pas de quoi : le libellé nomme le point, la règle, et l'assiette quand
 * une ligne en est exclue.
 *
 * - « Remise retrait Le Labo (5 %) », « Remise retrait Le Labo (2,00 €) » ;
 * - « Remise retrait (5 %) » quand le point n'a pas de nom figé ;
 * - « Remise retrait Le Labo » quand la règle n'a pas été figée (commande
 *   antérieure au snapshot) : on ne la déduit pas d'une division ;
 * - « … sur X € éligibles » quand une ligne est exclue de l'assiette.
 */

/** Points de base par point de pourcentage : 500 bp = 5 %. */
const BASIS_POINTS_PER_PERCENT = 100;

/** La règle figée, telle qu'on la lit : « 5 % », « 2,5 % », « 2,00 € ». */
export function adjustmentRuleLabel(adjustment: CartAdjustment): string {
  if (adjustment.mode === "amount") {
    return money(adjustment.cents);
  }
  const percent = (adjustment.bp / BASIS_POINTS_PER_PERCENT).toFixed(2).replace(/\.?0+$/u, "");
  return `${percent.replace(".", ",")} %`;
}

/**
 * Le nom du point de retrait figé : le libellé nommé quand le lecteur l'a, le
 * libellé de l'adresse figée sinon. `null` en livraison ou sans nom.
 */
export function pickupSiteOf(
  fulfillment: Pick<SheetFulfillment, "method" | "address" | "pickupLabel">,
): string | null {
  if (fulfillment.method !== "pickup") {
    return null;
  }
  const label = (fulfillment.pickupLabel ?? fulfillment.address?.label ?? "").trim();
  return label === "" ? null : label;
}

/** Ce que le libellé lit : la règle figée, le point, et l'assiette dans la convention du papier. */
export interface PickupDiscountLabelInput {
  readonly adjustment: CartAdjustment | null;
  readonly site: string | null;
  /** L'assiette éligible, en centimes — `null` quand aucune ligne n'est exclue. */
  readonly eligibleCents: number | null;
}

/** Le libellé, assemblé — rien n'y est deviné. */
export function pickupDiscountLabel(input: PickupDiscountLabelInput): string {
  return [
    "Remise retrait",
    ...(input.site === null ? [] : [input.site]),
    ...(input.adjustment === null ? [] : [`(${adjustmentRuleLabel(input.adjustment)})`]),
    ...(input.eligibleCents === null ? [] : [`sur ${money(input.eligibleCents)} éligibles`]),
  ].join(" ");
}

/**
 * L'assiette figée dans la convention du papier : HT pour le pro, TTC pour le
 * public quand ses lignes en portent un. `null` quand la remise couvre tout.
 */
export function eligibleBaseCentsOf(totals: SheetMoney, ttc: boolean): number | null {
  const base = totals.pickupDiscountBase;
  if (base === undefined) {
    return null;
  }
  return ttc && base.eligibleTtcCents !== null ? base.eligibleTtcCents : base.eligibleHtCents;
}
