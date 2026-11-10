import { addDays, instantToLocal } from "@lfd/contracts";

import { specimenProOrderState } from "../../../../orders/application/document-specimens/specimen-data.js";
import { specimenInvoice } from "../specimen-data.js";

/**
 * La facture d'exemple : émise par le chemin de la facture du mois, sur les
 * bons d'exemple du commerce. Le jour est dérivé de maintenant.
 */
const NOW = new Date();
const TODAY = instantToLocal(NOW).day;

describe("la facture d'exemple", () => {
  it("est émise aujourd'hui, échue à trente jours, et marquée EXEMPLE", () => {
    const state = specimenInvoice(NOW).toState();

    expect(state.issuedOn).toBe(TODAY);
    expect(state.dueOn).toBe(addDays(TODAY, 30));
    expect(state.seller.name).toContain("EXEMPLE");
    expect(state.buyer?.name).toContain("EXEMPLE");
    expect(state.orders.map((order) => order.reference)).toEqual(["EXEMPLE-0001", "EXEMPLE-0002"]);
  });

  it("reprend les lignes des deux bons, deux taux et le port, sans remise de retrait", () => {
    const order = specimenProOrderState(NOW);
    const state = specimenInvoice(NOW).toState();

    expect(state.lines.map((line) => line.amountCents)).toEqual(
      order.lines.map((line) => 2 * line.lineTotalCents),
    );
    expect(new Set(state.lines.map((line) => line.vatRate))).toEqual(new Set([5.5, 20]));
    // Des bons livrés : aucune remise de retrait (V5, 2026-10-22).
    expect(order.discountCents).toBe(0);
    expect(state.vat.allowancesCents).toBe(0);
    expect(state.vat.chargesCents).toBe(2 * order.deliveryFeeCents);
  });
});
