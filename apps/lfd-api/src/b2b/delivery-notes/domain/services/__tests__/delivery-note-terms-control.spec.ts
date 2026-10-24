import { DeliveryNote } from "../../entities/delivery-note.js";
import { ORDER_TERMS } from "../../value-objects/__tests__/delivery-note-terms.fixture.js";
import type { DeliveryNoteSourceLine } from "../../value-objects/delivery-note-line.js";
import type { FollowedOrder } from "../delivery-note-alignment.js";
import { termsGapsOf } from "../delivery-note-terms-control.js";

const AT = new Date(0);

const LINE: DeliveryNoteSourceLine = {
  sku: "PAIN-001",
  productName: "Pain",
  unitPriceMillicents: 100_000,
  vatRate: 5.5,
  quantity: 1,
  lineTotalCents: 100,
  unitPriceTtcCents: null,
  lineTotalTtcCents: null,
  pickupDiscountEligible: true,
};

function order(overrides: Partial<FollowedOrder> = {}): FollowedOrder {
  return {
    orderId: "ord_1",
    orderNumber: "ORD-5",
    lines: [LINE],
    terms: ORDER_TERMS,
    status: "confirmed",
    confirmedAt: AT,
    readyAt: null,
    handedOverAt: null,
    receivedOn: null,
    ...overrides,
  };
}

const noteOf = (subject: FollowedOrder): DeliveryNote =>
  DeliveryNote.planFromOrder("dn_1", subject, AT);

describe("termsGapsOf — le contrôle des totaux du BL (plan E4a, § 2)", () => {
  it("zéro écart quand le BL reprend la commande", () => {
    expect(termsGapsOf(order(), [noteOf(order())])).toEqual([]);
  });

  it("l'ordre des clés d'un JSON ne fait pas un écart", () => {
    const reordered = {
      ...ORDER_TERMS,
      lateFeeAdjustment: { vatRatePercent: 20, value: 5, kind: "percent" },
    };

    expect(termsGapsOf(order({ terms: reordered }), [noteOf(order())])).toEqual([]);
  });

  it("nomme chaque champ en écart, JSON compris", () => {
    const moved = {
      ...ORDER_TERMS,
      totalCents: ORDER_TERMS.totalCents + 1,
      vatShares: [{ rate: 20, amountCents: 0 }],
    };

    expect(termsGapsOf(order({ terms: moved }), [noteOf(order())])).toEqual([
      {
        orderId: "ord_1",
        orderNumber: "ORD-5",
        noteNumber: "BL-5-1",
        fields: ["totalCents", "vatShares"],
      },
    ]);
  });

  it("un en-tête vide est un écart", () => {
    const empty = DeliveryNote.rehydrate({ ...noteOf(order()).toState(), terms: null });

    expect(termsGapsOf(order(), [empty])).toEqual([expect.objectContaining({ fields: ["terms"] })]);
  });

  it("l'éligibilité d'une ligne qui diffère est un écart", () => {
    const flipped = order({ lines: [{ ...LINE, pickupDiscountEligible: false }] });

    expect(termsGapsOf(flipped, [noteOf(order())])).toEqual([
      expect.objectContaining({ fields: ["pickupDiscountEligible"] }),
    ]);
  });

  it("ne contrôle ni un BL annulé, ni une commande annulée ou encore passée", () => {
    const voided = noteOf(order());
    voided.void(AT);
    const moved = { ...ORDER_TERMS, totalCents: 1 };

    expect(termsGapsOf(order({ terms: moved }), [voided])).toEqual([]);
    expect(termsGapsOf(order({ terms: moved, status: "cancelled" }), [noteOf(order())])).toEqual(
      [],
    );
    expect(termsGapsOf(order({ terms: moved, status: "placed" }), [noteOf(order())])).toEqual([]);
  });
});
