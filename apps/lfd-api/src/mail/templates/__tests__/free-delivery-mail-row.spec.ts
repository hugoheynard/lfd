import type { SheetMoney } from "@lfd/contracts";

import { mailCopyOf } from "../copy/mail-copy.js";
import { freeDeliveryMailRows } from "../free-delivery-mail-row.js";

/**
 * La livraison offerte dans le récapitulatif de l'e-mail (plan
 * `frais-et-livraison-offerte.md`) : nommée dans la langue du
 * destinataire, sans signe — le total n'en dépend pas.
 */
const MONEY: SheetMoney = {
  subtotalCents: 10_000,
  discountCents: 0,
  discountAdjustment: null,
  voucherDiscountCents: 0,
  deliveryFeeCents: 0,
  lateFeeCents: 0,
  pretaxCents: 10_000,
  vatCents: 550,
  vatShares: null,
  totalCents: 10_550,
  currency: "EUR",
  settlement: "due",
};
const LOYAL = { fr: "Client fidèle", en: "Loyal customer", it: "Cliente fedele" };
const euros = (cents: number): string => `${(cents / 100).toFixed(2)} €`;

describe("freeDeliveryMailRows", () => {
  it("rien d'offert : aucune ligne", () => {
    expect(
      freeDeliveryMailRows(MONEY, mailCopyOf("fr")["customer.order-placed"], euros, "fr"),
    ).toEqual([]);
  });

  it("le franco de la route : « Livraison offerte » et le barème HT", () => {
    const rows = freeDeliveryMailRows(
      { ...MONEY, freeDelivery: { waivedCents: 2_400, waivedTtcCents: null } },
      mailCopyOf("fr")["customer.order-placed"],
      euros,
      "fr",
    );

    expect(rows).toEqual([{ label: "Livraison offerte", value: "24.00 € offerts" }]);
  });

  it("une promotion : son libellé dans la langue du destinataire", () => {
    const rows = freeDeliveryMailRows(
      { ...MONEY, freeDelivery: { waivedCents: 2_400, waivedTtcCents: null, label: LOYAL } },
      mailCopyOf("it")["customer.order-placed"],
      euros,
      "it",
    );

    expect(rows.map((row) => row.label)).toEqual(["Cliente fedele"]);
  });

  it("une commande composée en TTC : le TTC figé", () => {
    const rows = freeDeliveryMailRows(
      {
        ...MONEY,
        ttcTerms: { discountCents: 0, voucherCents: 0, deliveryFeeCents: 0 },
        freeDelivery: { waivedCents: 2_000, waivedTtcCents: 2_400 },
      },
      mailCopyOf("en")["customer.order-placed"],
      euros,
      "en",
    );

    expect(rows).toEqual([{ label: "Free delivery", value: "24.00 € waived" }]);
  });
});
