import type { ClientSheet } from "@lfd/contracts";

import { mailCopyOf } from "../copy/mail-copy.js";
import { discountMailRows, pickupDiscountMailLabel } from "../pickup-discount-mail-label.js";

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

  it("une promotion figée sur la commande (L8b) : son nom dans la langue du destinataire", () => {
    const label = pickupDiscountMailLabel(
      sheetWith({
        discountAdjustment: { mode: "percent", bp: 500 },
        discountLabel: { fr: "Offre pros", en: "Pro offer", it: "Offerta pro" },
      }),
      mailCopyOf("en")["customer.order-placed"],
      euros,
      "en",
    );
    expect(squash(label)).toBe("Pro offer (5%)");
  });

  it("une commande d'avant L8b garde le libellé du point", () => {
    const label = pickupDiscountMailLabel(
      sheetWith({ discountAdjustment: { mode: "percent", bp: 500 } }),
      fr,
      euros,
      "fr",
    );
    expect(squash(label)).toBe("Remise retrait Le Labo (5 %)");
  });
});

describe("discountMailRows — une ligne par remise (plan des promotions, M6)", () => {
  const SUMMER = { fr: "Été", en: "Summer", it: "Estate" };
  const lines = [
    { label: "Été", cents: 500, ttcCents: 528, labels: SUMMER },
    { label: "Remise", cents: 300, ttcCents: 317 },
  ];

  it("une seule remise : la ligne d'hier, au caractère près", () => {
    const sheet = sheetWith({ discountAdjustment: { mode: "percent", bp: 500 } });
    expect(discountMailRows(sheet, fr, euros, "fr")).toEqual([
      { label: pickupDiscountMailLabel(sheet, fr, euros, "fr"), value: "−5,00 €" },
    ]);
  });

  it("sans remise : aucune ligne", () => {
    expect(discountMailRows(sheetWith({ discountCents: 0 }), fr, euros, "fr")).toEqual([]);
  });

  it("deux remises : chacune nommée dans la langue du destinataire, repli sur le dictionnaire", () => {
    const en = mailCopyOf("en")["customer.order-placed"];
    const rows = discountMailRows(
      sheetWith({ discountCents: 800, discountLines: lines }),
      en,
      euros,
      "en",
    );
    expect(rows).toEqual([
      { label: "Summer", value: "−5,00 €" },
      { label: en.recapDiscount, value: "−3,00 €" },
    ]);
  });

  it("une commande composée en TTC dit les TTC figés de chaque remise", () => {
    const rows = discountMailRows(
      sheetWith({
        discountCents: 800,
        discountLines: lines,
        ttcTerms: { discountCents: 845, voucherCents: 0, deliveryFeeCents: 0 },
      }),
      fr,
      euros,
      "fr",
    );
    expect(rows.map((row) => row.value)).toEqual(["−5,28 €", "−3,17 €"]);
  });
});
