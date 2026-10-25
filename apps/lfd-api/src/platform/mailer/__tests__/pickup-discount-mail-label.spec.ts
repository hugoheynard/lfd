import type { ClientSheet } from "@lfd/contracts";

import { mailCopyOf } from "../copy/mail-copy.js";
import { pickupDiscountMailLabel } from "../pickup-discount-mail-label.js";

/** Régression : le récapitulatif disait « Remise » sans dire laquelle (2026-10-25). */
const ADDRESS = {
  label: "Le Labo",
  ligne1: "route de la Balme",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "FR",
};

function sheetWith(
  money: Partial<ClientSheet["money"]>,
  label = "Le Labo",
): Pick<ClientSheet, "fulfillment" | "money"> {
  return {
    fulfillment: {
      method: "pickup",
      address: { ...ADDRESS, label },
      pickupLabel: null,
      window: null,
      contact: null,
      signatureRequired: false,
    },
    money: {
      subtotalCents: 10_000,
      discountCents: 500,
      discountAdjustment: null,
      voucherDiscountCents: 0,
      deliveryFeeCents: 0,
      lateFeeCents: 0,
      vatCents: 0,
      vatShares: null,
      totalCents: 9_500,
      currency: "EUR",
      settlement: "due",
      ...money,
    },
  };
}

const fr = mailCopyOf("fr")["customer.order-placed"];
const euros = (cents: number): string => `${(cents / 100).toFixed(2).replace(".", ",")} €`;
const squash = (text: string): string => text.replace(/\s/gu, " ");

describe("pickupDiscountMailLabel", () => {
  it("un pourcentage : le point et la règle", () => {
    const label = pickupDiscountMailLabel(
      sheetWith({ discountAdjustment: { mode: "percent", bp: 500 } }),
      fr,
      euros,
      "fr",
    );
    expect(squash(label)).toBe("Remise retrait Le Labo (5 %)");
  });

  it("un montant fixe, et l'assiette quand une ligne est exclue", () => {
    const label = pickupDiscountMailLabel(
      sheetWith({
        discountAdjustment: { mode: "amount", cents: 200 },
        pickupDiscountBase: {
          eligibleHtCents: 10_000,
          eligibleTtcCents: null,
          excludedSkus: ["T"],
        },
      }),
      fr,
      euros,
      "fr",
    );
    expect(squash(label)).toBe("Remise retrait Le Labo (2,00 €) sur 100,00 € éligibles");
  });

  it("point inconnu, ajustement absent : rien d'inventé", () => {
    expect(pickupDiscountMailLabel(sheetWith({}, ""), fr, euros, "fr")).toBe("Remise retrait");
  });
});
