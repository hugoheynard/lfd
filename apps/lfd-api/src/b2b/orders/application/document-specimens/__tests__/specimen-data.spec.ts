import { addDays, instantToLocal } from "@lfd/contracts";

import { specimenClientSheet, specimenProOrderState } from "../specimen-data.js";

/**
 * Le bon d'exemple de la planche des documents : composé par l'agrégat, jamais
 * additionné à la main. Le jour est dérivé de maintenant.
 */
const NOW = new Date();
const TOMORROW = addDays(instantToLocal(NOW).day, 1);

describe("le bon de commande d'exemple", () => {
  it("pro : deux taux, le port sans remise de retrait, réglé au compte et hors taxe", () => {
    const sheet = specimenClientSheet("pro", NOW);

    expect(sheet.variant).toBe("pro");
    expect(sheet.fulfillment.method).toBe("delivery");
    expect(sheet.requestedFor).toBe(TOMORROW);
    expect(sheet.money.vatShares?.map((share) => share.rate)).toEqual([5.5, 20]);
    // Livré : pas de remise de retrait à côté du port (V5, 2026-10-22).
    expect(sheet.money.discountCents).toBe(0);
    expect(sheet.money.deliveryFeeCents).toBe(1_500);
    expect(sheet.money.settlement).toBe("account");
    expect(sheet.lines.every((line) => line.unitPriceTtcCents === null)).toBe(true);
    expect(sheet.note).toContain("EXEMPLE");
  });

  it("public : retrait, TTC scellé, payé par carte, téléphone imprimé", () => {
    const sheet = specimenClientSheet("public", NOW);

    expect(sheet.variant).toBe("public");
    expect(sheet.fulfillment.method).toBe("pickup");
    // 5 % des seules lignes éligibles — la tasse est hors remise depuis le lot C.
    const tasse = sheet.lines.find((line) => line.sku === "EXEMPLE-TAS");
    const eligibleHt = sheet.money.subtotalCents - (tasse?.lineTotalCents ?? 0);
    expect(sheet.money.discountCents).toBe(Math.round(eligibleHt * 0.05));
    expect(sheet.money.deliveryFeeCents).toBe(0);
    expect(sheet.lines.every((line) => line.lineTotalTtcCents !== null)).toBe(true);
    expect(sheet.money.settlement).toBe("paid");
    expect(sheet.customerPhone).not.toBeNull();
  });

  it("public : une ligne hors remise de retrait, marquée, et l'assiette dite sur les lignes figées", () => {
    const sheet = specimenClientSheet("public", NOW);
    const eligible = sheet.lines.filter((line) => line.pickupDiscountEligible !== false);

    expect(
      sheet.lines.filter((line) => line.pickupDiscountEligible === false).map((l) => l.sku),
    ).toEqual(["EXEMPLE-TAS"]);
    expect(sheet.money.pickupDiscountBase).toEqual({
      eligibleHtCents: eligible.reduce((sum, line) => sum + line.lineTotalCents, 0),
      eligibleTtcCents: eligible.reduce((sum, line) => sum + (line.lineTotalTtcCents ?? 0), 0),
      excludedSkus: ["EXEMPLE-TAS"],
    });
  });

  it("pro : rien d'exclu sans remise de retrait, la clé est absente", () => {
    const sheet = specimenClientSheet("pro", NOW);

    expect(sheet.money).not.toHaveProperty("pickupDiscountBase");
    expect(sheet.lines.some((line) => line.pickupDiscountEligible === false)).toBe(false);
  });

  it("dit EXEMPLE partout où il désigne quelqu'un", () => {
    for (const variant of ["pro", "public"] as const) {
      const sheet = specimenClientSheet(variant, NOW);
      expect(sheet.reference).toContain("EXEMPLE");
      expect(sheet.customer.tradeName).toContain("EXEMPLE");
      expect(sheet.customer.legalName).toContain("EXEMPLE");
    }
  });

  it("sert à la facture les MÊMES montants que le bon pro", () => {
    const sheet = specimenClientSheet("pro", NOW);
    const state = specimenProOrderState(NOW);

    expect(state.totalCents).toBe(sheet.money.totalCents);
    expect(state.vatCents).toBe(sheet.money.vatCents);
  });
});
