import type { FulfillmentMethod } from "@lfd/contracts";

import type { OrderToPlace } from "../../domain/entities/order.js";
import { type OrderSummarySource, summarizeOrders } from "../../domain/services/order-summary.js";
import type { OrderSummaryPaper } from "../../domain/services/order-summary-paper.js";
import { specimenProOrderState } from "./specimen-data.js";

/**
 * **Les données d'exemple du récapitulatif de commandes** — la planche des
 * documents de la Comptabilité
 * (`documentation/comptabilite/planche-des-documents.md`).
 *
 * 🔴 **Elles ne sont JAMAIS persistées.** Chaque commande est la commande pro
 * d'exemple du bon (`specimenProOrderState`, donc `Order.draft` et ses
 * montants), et le récapitulatif sort de `summarizeOrders` — le même calcul
 * que pour une vraie sélection, jamais une addition à la main.
 *
 * Trois commandes : une pour la société, une pour l'un de ses sites, et une
 * annulée, pour que la planche montre la table d'un site et la liste des
 * commandes laissées hors des totaux. Tout ce qui désigne quelqu'un dit
 * « EXEMPLE ».
 */

const SPECIMEN_COMPANY = { id: "specimen-company", name: "EXEMPLE — SAS des Trois Ponts" };
const SPECIMEN_SITE = { id: "specimen-site", name: "EXEMPLE — Hôtel des Trois Ponts, annexe" };

interface SpecimenSelection {
  readonly id: string;
  readonly orderNumber: string;
  readonly company: { readonly id: string; readonly name: string };
  readonly cancelled: boolean;
}

const SELECTION: readonly SpecimenSelection[] = [
  {
    id: "specimen-order-1",
    orderNumber: "EXEMPLE-0001",
    company: SPECIMEN_COMPANY,
    cancelled: false,
  },
  { id: "specimen-order-2", orderNumber: "EXEMPLE-0002", company: SPECIMEN_SITE, cancelled: false },
  {
    id: "specimen-order-3",
    orderNumber: "EXEMPLE-0003",
    company: SPECIMEN_COMPANY,
    cancelled: true,
  },
];

/** Le récapitulatif d'exemple, imprimé au nom de la société d'exemple, à `now`. */
export function specimenOrderSummaryPaper(now: Date): OrderSummaryPaper {
  const state = specimenProOrderState(now);
  const sources = SELECTION.map((selection) => sourceOf(state, selection));
  return {
    summary: summarizeOrders(SPECIMEN_COMPANY.id, sources),
    requesterName: SPECIMEN_COMPANY.name,
    generatedAt: now,
    period: null,
  };
}

/** Le jumeau de la lecture du dépôt, lu sur l'état sérialisé de la commande. */
function sourceOf(state: OrderToPlace, selection: SpecimenSelection): OrderSummarySource {
  const fulfillmentMethod: FulfillmentMethod = state.fulfillmentMethod;
  return {
    id: selection.id,
    orderNumber: selection.orderNumber,
    companyId: selection.company.id,
    companyName: selection.company.name,
    day: state.requestedDeliveryDate?.toISOString().slice(0, 10) ?? null,
    fulfillmentMethod,
    author: { kind: "customer", name: "EXEMPLE — Réception" },
    cancelled: selection.cancelled,
    paymentStatus: state.paymentStatus,
    subtotalCents: state.subtotalCents,
    discountCents: state.discountCents,
    voucherDiscountCents: state.voucherDiscountCents,
    deliveryFeeCents: state.deliveryFeeCents,
    lateFeeCents: state.lateFeeCents,
    vatCents: state.vatCents,
    vatShares: state.vatShares,
    totalCents: state.totalCents,
    lines: state.lines.map((line) => ({
      sku: line.sku,
      name: line.productName,
      quantity: line.quantity,
      lineTotalCents: line.lineTotalCents,
    })),
  };
}
