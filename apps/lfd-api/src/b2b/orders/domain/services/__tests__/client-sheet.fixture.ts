import { readFileSync } from "node:fs";

import type { ClientSheet } from "@lfd/contracts";

import type { OrderSheetArt } from "../order-sheet-pdf.js";

/** La feuille d'un PRO réglée par carte, et ce que le rendu reçoit à côté. */

/** Le VRAI logo du dépôt, et pas d'URL de retrait : le cas de base. */
export const LOGO = readFileSync(
  new URL("../../../../../../assets/logo-la-folie-coffee-noir-et-blanc.png", import.meta.url),
);
export const ART: OrderSheetArt = { logo: LOGO, handoverUrl: "" };

export const LINE = {
  sku: "PAI-BAG-TRA",
  productName: "Baguette tradition",
  quantity: 160,
  // 0,74 € — soit SOIXANTE-QUATORZE MILLE millicentimes. 1 € = 100 000.
  unitPriceMillicents: 74_000,
  vatRate: 5.5,
  lineTotalCents: 11_840,
  // Une commande PROFESSIONNELLE par défaut : rien de scellé, donc le bon reste
  // hors taxe — l'état de tous les cas écrits avant R3.
  unitPriceTtcCents: null as number | null,
  lineTotalTtcCents: null as number | null,
  priceLabels: [] as readonly string[],
};

export function sheet(overrides: Partial<ClientSheet> = {}): ClientSheet {
  return {
    orderId: "ord_1",
    reference: "CMD-4812",
    audience: "client",
    placedAt: "2026-09-02T09:00:00.000Z",
    requestedFor: "2026-09-03",
    issuedAt: "2026-09-02T09:00:00.000Z",
    revision: 0,
    origin: "self_service",
    note: "",
    customer: { tradeName: "Hôtel des Trois Ponts", legalName: "SAS des Trois Ponts" },
    variant: "pro",
    customerPhone: null,
    fulfillment: {
      method: "pickup",
      pickupLabel: "Le Labo",
      address: {
        label: "Le Labo",
        ligne1: "route de la Balme",
        ligne2: "",
        codePostal: "73150",
        ville: "Val d'Isère",
        pays: "France",
      },
      window: { start: "07:00", end: "08:00" },
      contact: null,
      signatureRequired: false,
    },
    lines: [LINE],
    money: {
      subtotalCents: 11_840,
      discountCents: 1_184,
      discountAdjustment: null,
      voucherDiscountCents: 0,
      deliveryFeeCents: 0,
      lateFeeCents: 0,
      vatCents: 586,
      vatShares: [{ rate: 5.5, amountCents: 586 }],
      totalCents: 11_242,
      currency: "EUR",
      settlement: "paid",
    },
    ...overrides,
  };
}
