import type { CartAdjustment, ClientSheet, ContentLocale } from "@lfd/contracts";

import { fill } from "./copy/mail-copy.js";

/**
 * **Le libellé de la remise de retrait dans le récapitulatif d'un e-mail** —
 * le même que sur le bon de commande : le point, la règle figée, l'assiette
 * quand une ligne en est exclue (« Remise retrait Le Labo (5 %) sur 100,00 €
 * éligibles »).
 *
 * ⚠️ Jumeau de `pickupDiscountLabel` (`b2b/orders/domain/services/`) : le
 * mailer est de `platform/`, il ne connaît aucun contexte et ne peut pas
 * l'importer. Celui-ci parle la langue du destinataire (`Intl`), celui du bon
 * écrit le français à la main, pour un document archivé.
 */

/** Points de base par unité de fraction : 500 bp = 0,05. */
const BASIS_POINTS = 10_000;

/** Les mots du libellé, pris au dictionnaire. */
export interface PickupDiscountMailCopy {
  readonly recapDiscount: string;
  /** `{base}` = l'assiette éligible, HT. */
  readonly recapDiscountBase: string;
}

function ruleOf(adjustment: CartAdjustment, locale: ContentLocale): string {
  return adjustment.mode === "amount"
    ? new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(
        adjustment.cents / 100,
      )
    : new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(
        adjustment.bp / BASIS_POINTS,
      );
}

function siteOf(fulfillment: ClientSheet["fulfillment"]): string | null {
  if (fulfillment.method !== "pickup") {
    return null;
  }
  const label = (fulfillment.pickupLabel ?? fulfillment.address?.label ?? "").trim();
  return label === "" ? null : label;
}

/** Le libellé, assemblé — rien n'y est deviné : sans règle figée, pas de règle. */
export function pickupDiscountMailLabel(
  sheet: Pick<ClientSheet, "fulfillment" | "money">,
  copy: PickupDiscountMailCopy,
  money: (cents: number) => string,
  locale: ContentLocale,
): string {
  const site = siteOf(sheet.fulfillment);
  const adjustment = sheet.money.discountAdjustment;
  const base = sheet.money.pickupDiscountBase;
  return [
    copy.recapDiscount,
    ...(site === null ? [] : [site]),
    ...(adjustment === null ? [] : [`(${ruleOf(adjustment, locale)})`]),
    ...(base === undefined
      ? []
      : [fill(copy.recapDiscountBase, { base: money(base.eligibleHtCents) })]),
  ].join(" ");
}
