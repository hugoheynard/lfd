import { ORDER_TERMS } from "../../value-objects/__tests__/delivery-note-terms.fixture.js";
import { DeliveryNote } from "../../entities/delivery-note.js";
import type { DeliveryNoteSourceLine } from "../../value-objects/delivery-note-line.js";
import { alignmentOf, type FollowedOrder } from "../delivery-note-alignment.js";
import { termsGapsOf } from "../delivery-note-terms-control.js";

// Une commande a un seul BL vivant ; la valeur `partially_handed_over`, gardée
// en base sans écrivain, se traite comme `fulfilled`.

// Comparés entre eux seulement : la règle ne lit aucune horloge.
const CONFIRMED_AT = new Date(1_000);
const READY_AT = new Date(2_000);
const HANDED_OVER_AT = new Date(3_000);
const NOW = new Date(4_000);
const ORDER_DAY = "1970-01-01";

const BREAD: DeliveryNoteSourceLine = {
  sku: "PAIN-001",
  productName: "Pain",
  unitPriceMillicents: 100_000,
  vatRate: 5.5,
  quantity: 2,
  saleUnit: "piece" as const,
  lineTotalCents: 200,
  unitPriceTtcCents: null,
  lineTotalTtcCents: null,
  pickupDiscountEligible: true,
};

const SOURCE = { orderId: "ord_1", orderNumber: "ORD-7", lines: [BREAD], terms: ORDER_TERMS };

function order(overrides: Partial<FollowedOrder> = {}): FollowedOrder {
  return {
    ...SOURCE,
    status: "fulfilled",
    confirmedAt: CONFIRMED_AT,
    readyAt: READY_AT,
    handedOverAt: HANDED_OVER_AT,
    receivedOn: ORDER_DAY,
    ...overrides,
  };
}

const context = { newId: () => "dn_new", now: NOW };

function firstNote(): DeliveryNote {
  return DeliveryNote.planFromOrder("dn_1", SOURCE, CONFIRMED_AT);
}

function handedOverFirst(): DeliveryNote {
  const note = firstNote();
  note.prepare(READY_AT);
  note.handOver(HANDED_OVER_AT, ORDER_DAY);
  return note;
}

describe("alignmentOf — rien ne change avec un seul envoi", () => {
  it.each([
    ["remis, BL-1 remis", order(), () => [handedOverFirst()], { change: "none" }],
    [
      "remise, BL-1 en double",
      order(),
      () => [handedOverFirst(), firstNote()],
      {
        change: "unrepairable",
        reason: "several_live_notes",
      },
    ],
  ] as const)("%s", (_label, subject, notes, expected) => {
    expect(alignmentOf(subject, notes(), context)).toEqual(expected);
  });
});

describe("termsGapsOf — le BL contre sa commande", () => {
  it("un BL remis égal à sa commande n'est pas un écart", () => {
    expect(termsGapsOf(order(), [handedOverFirst()])).toEqual([]);
  });

  it("compte un BL en écart", () => {
    const shorter = DeliveryNote.planFromOrder(
      "dn_1",
      { ...SOURCE, lines: [BREAD, { ...BREAD, sku: "PAIN-002" }] },
      CONFIRMED_AT,
    );

    expect(
      termsGapsOf(
        order({ status: "confirmed", readyAt: null, handedOverAt: null, receivedOn: null }),
        [shorter],
      ).map((gap) => gap.noteNumber),
    ).toEqual(["BL-7-1"]);
  });
});

describe("la commande « en partie retirée », valeur gardée en base", () => {
  it("le BL se remet comme sous `fulfilled`", () => {
    const first = firstNote();
    first.prepare(READY_AT);

    const result = alignmentOf(order({ status: "partially_handed_over" }), [first], context);

    expect(result).toEqual({ change: "advanced", writes: [first] });
    expect(first.status).toBe("handed_over");
  });

  it("BL remis : aligné", () => {
    expect(
      alignmentOf(order({ status: "partially_handed_over" }), [handedOverFirst()], context),
    ).toEqual({ change: "none" });
  });

  it("le BL reste contrôlé contre sa commande", () => {
    const shorter = DeliveryNote.planFromOrder(
      "dn_1",
      { ...SOURCE, lines: [BREAD, { ...BREAD, sku: "PAIN-002" }] },
      CONFIRMED_AT,
    );

    expect(
      termsGapsOf(order({ status: "partially_handed_over" }), [shorter]).map(
        (gap) => gap.noteNumber,
      ),
    ).toEqual(["BL-7-1"]);
  });
});
