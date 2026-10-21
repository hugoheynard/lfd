import type {
  CompanyOrderAuthorView,
  FulfillmentMethod,
  OrderSummaryBottomView,
  OrderSummaryOrdersPretaxView,
} from "@lfd/contracts";

import { weekdayShortDate } from "../../../../platform/pdf/paper-pdf-kit.js";

/**
 * **Les mots de la liste des bons inclus** (plan
 * `documentation/commandes/plan-recapitulatif-des-commandes.md`, §10) — communs
 * au PDF et au tableur, comme `order-summary-paper.ts` l'est pour les tables.
 * Aucun calcul : le domaine a déjà sommé et rapproché.
 */

export const ORDERS_SECTION_TITLE = "Bons de commande inclus";

/** Le pied d'une liste : la somme des « Total HT » des bons. */
export const ORDERS_PRETAX_LABEL = "Total HT des bons";

/** Sous les bons, le rappel qui empêche de chercher une TVA par bon (F5). */
export const ORDERS_PRETAX_NOTE =
  "Montants HT tels que chaque bon les imprime — la TVA se calcule sur la facture.";

const MODE_LABELS: Readonly<Record<FulfillmentMethod, string>> = {
  pickup: "Retrait",
  delivery: "Livraison",
};

export function fulfillmentLabel(method: FulfillmentMethod): string {
  return MODE_LABELS[method];
}

/** Le nom du client, ou « l'équipe » quand elle a saisi la commande (C1). */
export function authorLabel(author: CompanyOrderAuthorView): string {
  return author.kind === "team" ? "l'équipe" : author.name;
}

/** `2026-10-07` → « mer. 7 oct. 2026 » ; « sans date » sinon. */
export function orderDayLabel(day: string | null): string {
  return day === null ? "sans date" : `${weekdayShortDate(day)} ${day.slice(0, 4)}`;
}

/**
 * La ligne qui EXPLIQUE l'écart entre la somme des bons et le sous-total HT
 * de la table — `null` quand il n'y en a pas. Elle nomme les gestes qui ont eu
 * lieu, et la remise plafonnée quand un bon n'est pas descendu sous zéro.
 */
export function ordersGapLabel(
  bottom: OrderSummaryBottomView,
  pretax: OrderSummaryOrdersPretaxView,
): string | null {
  if (pretax.gapCents === 0) {
    return null;
  }
  const causes = [
    ...(bottom.discountCents === 0 ? [] : ["remises"]),
    ...(bottom.voucherDiscountCents === 0 ? [] : ["bons de fidélité"]),
    ...(bottom.deliveryFeeCents === 0 ? [] : ["livraison"]),
    ...(bottom.lateFeeCents === 0 ? [] : ["surtaxes de commande tardive"]),
    ...(pretax.cappedDiscountCents === 0 ? [] : ["remise plafonnée au montant des articles"]),
  ];
  return `Écart avec le sous-total HT : ${causes.join(", ")}`;
}
