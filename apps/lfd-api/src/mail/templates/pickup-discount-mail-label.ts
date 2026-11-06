import {
  discountLabelIn,
  type CartAdjustment,
  type ClientSheet,
  type ContentLocale,
} from "@lfd/contracts";

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
 *
 * Une commande qui a figé le libellé de sa promotion panier (L8b, § 15.8)
 * est nommée par lui, dans la langue du destinataire, à la place du mot du
 * dictionnaire et du point ; une commande d'avant garde le libellé du point.
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
  const frozen = sheet.money.discountLabel;
  const name =
    frozen === undefined
      ? [copy.recapDiscount, ...(site === null ? [] : [site])]
      : [discountLabelIn(frozen, locale)];
  return [
    ...name,
    ...(adjustment === null ? [] : [`(${ruleOf(adjustment, locale)})`]),
    ...(base === undefined
      ? []
      : [fill(copy.recapDiscountBase, { base: money(base.eligibleHtCents) })]),
  ].join(" ");
}

/** Une ligne de remise du récapitulatif : son libellé, son montant signé. */
export interface DiscountMailRow {
  readonly label: string;
  readonly value: string;
}

/**
 * **Les lignes de remise du récapitulatif** (plan des promotions, § 18.6,
 * lot M6) — une par remise quand le bon en porte PLUSIEURS
 * (`SheetMoney.discountLines`), chacune nommée dans la langue du destinataire
 * (repli : le mot du dictionnaire) ; sinon LA ligne d'hier, au caractère près.
 * Le montant est le TTC figé d'une commande composée en TTC, sinon le HT.
 */
export function discountMailRows(
  sheet: Pick<ClientSheet, "fulfillment" | "money">,
  copy: PickupDiscountMailCopy,
  money: (cents: number) => string,
  locale: ContentLocale,
): readonly DiscountMailRow[] {
  const ttc = sheet.money.ttcTerms !== undefined;
  const lines = sheet.money.discountLines;
  if (lines !== undefined && lines.length > 1) {
    return lines.map((line) => ({
      label: line.labels === undefined ? copy.recapDiscount : discountLabelIn(line.labels, locale),
      value: `−${money(ttc ? (line.ttcCents ?? line.cents) : line.cents)}`,
    }));
  }
  const cents = sheet.money.ttcTerms?.discountCents ?? sheet.money.discountCents;
  return cents === 0
    ? []
    : [{ label: pickupDiscountMailLabel(sheet, copy, money, locale), value: `−${money(cents)}` }];
}
