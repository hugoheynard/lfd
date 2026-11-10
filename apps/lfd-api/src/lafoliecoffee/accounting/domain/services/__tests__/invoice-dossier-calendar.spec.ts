import { dossierCalendarNotes } from "../invoice-dossier-calendar.js";
import type { FrozenInvoiceOrder } from "../invoice-dossier.types.js";

/** Les dates ne sont comparées qu'à la période passée en argument : aucune horloge. */
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

/** Octobre 2026 au mensuel au 1er : du 1er au 31, à 00h00 Paris. */
const OCTOBER = {
  startsAt: new Date("2026-09-30T22:00:00.000Z"),
  closesAt: new Date("2026-10-31T23:00:00.000Z"),
};
/** La semaine du lundi 5 au dimanche 11 octobre 2026. */
const WEEK = {
  startsAt: new Date("2026-10-04T22:00:00.000Z"),
  closesAt: new Date("2026-10-11T22:00:00.000Z"),
};

describe("dossierCalendarNotes", () => {
  it("signale un bon livré hors de la période et liste à part un bon sans date", () => {
    const notes = dossierCalendarNotes(
      [bon("ORD-1", "2026-10-31"), bon("ORD-2", "2026-11-02"), bon("ORD-3", null)],
      OCTOBER,
    );

    expect(notes).toEqual({
      outsidePeriod: [{ reference: "ORD-2", requestedDeliveryDate: "2026-11-02" }],
      withoutDate: ["ORD-3"],
    });
  });

  it("ne dit rien quand tous les bons sont livrés dans la période, bornes comprises", () => {
    expect(
      dossierCalendarNotes([bon("ORD-1", "2026-10-01"), bon("ORD-2", "2026-10-31")], OCTOBER),
    ).toEqual({ outsidePeriod: [], withoutDate: [] });
  });

  it("à la semaine, signale le bon livré la semaine suivante, dans le même mois", () => {
    const notes = dossierCalendarNotes(
      [bon("ORD-1", "2026-10-05"), bon("ORD-2", "2026-10-11"), bon("ORD-3", "2026-10-12")],
      WEEK,
    );
    expect(notes.outsidePeriod).toEqual([
      { reference: "ORD-3", requestedDeliveryDate: "2026-10-12" },
    ]);
  });
});
