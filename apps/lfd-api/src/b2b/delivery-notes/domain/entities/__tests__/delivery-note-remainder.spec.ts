import { ORDER_TERMS } from "../../value-objects/__tests__/delivery-note-terms.fixture.js";
import {
  DeliveryNoteWithoutLinesError,
  InvalidDeliveryNoteRemainderError,
} from "../../errors/delivery-note-errors.js";
import type { DeliveryNoteSourceLine } from "../../value-objects/delivery-note-line.js";
import { DeliveryNote, type DeliveryNoteRemainderSource } from "../delivery-note.js";

// Les jours ne sont comparés qu'entre eux, jamais à l'horloge (CLAUDE.md §5).
const PLANNED_AT = new Date(0);
const ORDER_DAY = "2030-03-10";
const NEXT_DAY = "2030-03-11";

const BREAD: DeliveryNoteSourceLine = {
  sku: "PAIN-001",
  productName: "Pain de campagne",
  unitPriceMillicents: 412_345,
  vatRate: 5.5,
  quantity: 4,
  saleUnit: "piece" as const,
  lineTotalCents: 16_494,
  unitPriceTtcCents: null,
  lineTotalTtcCents: null,
  pickupDiscountEligible: true,
};

function remainder(
  lines: readonly DeliveryNoteSourceLine[] = [BREAD],
): DeliveryNoteRemainderSource {
  return {
    orderId: "ord_1",
    orderNumber: "ORD-1042",
    lines,
    terms: ORDER_TERMS,
    orderDay: ORDER_DAY,
  };
}

describe("DeliveryNote.planRemainder", () => {
  it("prévoit un BL de rang 2, numéroté d'après la commande, avec SON jour", () => {
    const note = DeliveryNote.planRemainder("dn_2", remainder(), 2, NEXT_DAY, PLANNED_AT);

    expect(note.toState()).toMatchObject({
      id: "dn_2",
      orderId: "ord_1",
      rank: 2,
      number: "BL-1042-2",
      serviceDay: NEXT_DAY,
      status: "planned",
      plannedAt: PLANNED_AT,
      contentVersion: 1,
      printed: null,
      lines: [BREAD],
      terms: ORDER_TERMS,
    });
  });

  it("admet le jour même de la commande", () => {
    const note = DeliveryNote.planRemainder("dn_2", remainder(), 2, ORDER_DAY, PLANNED_AT);

    expect(note.toState().serviceDay).toBe(ORDER_DAY);
  });

  it("rehydrate garde le jour du reliquat", () => {
    const state = DeliveryNote.planRemainder(
      "dn_3",
      remainder(),
      3,
      NEXT_DAY,
      PLANNED_AT,
    ).toState();

    expect(DeliveryNote.rehydrate(state).toState()).toEqual(state);
  });

  it.each([1, 0, -1, 2.5])("refuse le rang %p : le rang 1 est la commande elle-même", (rank) => {
    expect(() =>
      DeliveryNote.planRemainder("dn_2", remainder(), rank, NEXT_DAY, PLANNED_AT),
    ).toThrow(InvalidDeliveryNoteRemainderError);
  });

  it.each(["", "11/03/2030", "2030-3-11", "2030-02-30"])("refuse le jour %p", (day) => {
    expect(() => DeliveryNote.planRemainder("dn_2", remainder(), 2, day, PLANNED_AT)).toThrow(
      InvalidDeliveryNoteRemainderError,
    );
  });

  it("refuse un jour antérieur au jour demandé de la commande", () => {
    expect(() =>
      DeliveryNote.planRemainder("dn_2", remainder(), 2, "2030-03-09", PLANNED_AT),
    ).toThrow(/précède le jour demandé de la commande \(2030-03-10\)/);
  });

  it("refuse une commande dont le jour demandé est mal formé", () => {
    const source = { ...remainder(), orderDay: "" };

    expect(() => DeliveryNote.planRemainder("dn_2", source, 2, NEXT_DAY, PLANNED_AT)).toThrow(
      InvalidDeliveryNoteRemainderError,
    );
  });

  it("refuse un reste sans ligne", () => {
    expect(() =>
      DeliveryNote.planRemainder("dn_2", remainder([]), 2, NEXT_DAY, PLANNED_AT),
    ).toThrow(DeliveryNoteWithoutLinesError);
  });
});
