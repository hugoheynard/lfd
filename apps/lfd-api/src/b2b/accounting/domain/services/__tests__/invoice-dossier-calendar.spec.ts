import { dossierCalendarNotes } from "../invoice-dossier-calendar.js";
import type { FrozenInvoiceOrder } from "../invoice-dossier.types.js";

/** Les dates ne sont comparées qu'au mois passé en argument : aucune horloge. */
function bon(reference: string, requestedDeliveryDate: string | null): FrozenInvoiceOrder {
  return {
    reference,
    createdAt: new Date(0),
    requestedDeliveryDate,
    lines: [],
    discountCents: 0,
    voucherDiscountCents: 0,
    deliveryFeeCents: 0,
    deliveryVatMode: null,
    lateFeeCents: 0,
    lateFeeVatRate: null,
    vatShares: [],
    vatCents: 0,
    totalCents: 0,
  };
}

describe("dossierCalendarNotes", () => {
  it("signale un bon livré un autre mois et liste à part un bon sans date", () => {
    const notes = dossierCalendarNotes(
      [bon("CMD-1", "2026-10-31"), bon("CMD-2", "2026-11-02"), bon("CMD-3", null)],
      "2026-10",
    );

    expect(notes).toEqual({
      otherMonth: [{ reference: "CMD-2", requestedDeliveryDate: "2026-11-02" }],
      withoutDate: ["CMD-3"],
    });
  });

  it("ne dit rien quand tous les bons sont livrés dans le mois", () => {
    expect(dossierCalendarNotes([bon("CMD-1", "2026-10-01")], "2026-10")).toEqual({
      otherMonth: [],
      withoutDate: [],
    });
  });
});
