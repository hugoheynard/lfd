import { ORDER_TERMS } from "../../value-objects/__tests__/delivery-note-terms.fixture.js";
import { DeliveryNote } from "../../entities/delivery-note.js";
import type { DeliveryNoteSourceLine } from "../../value-objects/delivery-note-line.js";
import { alignmentOf, type FollowedOrder } from "../delivery-note-alignment.js";
import { termsGapsOf } from "../delivery-note-terms-control.js";

// Plan E7, choix 3 (lot L2) : seul le BL-1 suit sa commande ; un reliquat
// vivant à côté de lui est l'état normal, plus un écart.

// Comparés entre eux seulement : la règle ne lit aucune horloge.
const CONFIRMED_AT = new Date(1_000);
const READY_AT = new Date(2_000);
const HANDED_OVER_AT = new Date(3_000);
const DECIDED_AT = new Date(3_500);
const NOW = new Date(4_000);
const ORDER_DAY = "1970-01-01";
const NEXT_DAY = "1970-01-02";

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
const REST = { ...BREAD, quantity: 1, lineTotalCents: 100 };

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

function remainder(rank = 2, day = NEXT_DAY): DeliveryNote {
  return DeliveryNote.planRemainder(
    `dn_r${rank}`,
    { ...SOURCE, lines: [REST], orderDay: ORDER_DAY },
    rank,
    day,
    DECIDED_AT,
  );
}

describe("alignmentOf — un BL-1 remis et un reliquat vivant", () => {
  it("est aligné, et non plus « several_live_notes »", () => {
    expect(alignmentOf(order(), [handedOverFirst(), remainder()], context)).toEqual({
      change: "none",
    });
  });

  it("laisse le reliquat intact, même quand le BL-1 avance", () => {
    const rest = remainder();
    const before = rest.toState();
    const first = firstNote();

    const result = alignmentOf(order(), [first, rest], context);

    expect(result).toEqual({ change: "advanced", writes: [first] });
    expect(first.status).toBe("handed_over");
    expect(rest.toState()).toEqual(before);
  });

  it("le même jour aussi : le rang 2 n'est pas le BL de la commande prête", () => {
    const first = firstNote();
    first.prepare(READY_AT);

    expect(
      alignmentOf(
        order({ status: "ready", handedOverAt: null, receivedOn: null }),
        [first, remainder(2, ORDER_DAY)],
        context,
      ),
    ).toEqual({ change: "none" });
  });

  it("ne crée pas de BL-1 quand seul un reliquat existe : le rang 1 manque, il naît", () => {
    const result = alignmentOf(order(), [remainder()], context);

    expect(result.change).toBe("created");
    expect(result.change === "created" && result.created.toState().rank).toBe(1);
  });

  it("un BL-1 annulé à côté d'un reliquat reste « voided_only » : le reliquat ne le remplace pas", () => {
    const voided = firstNote();
    voided.void(NOW);

    expect(alignmentOf(order(), [voided, remainder()], context)).toEqual({
      change: "unrepairable",
      reason: "voided_only",
    });
  });

  it("deux BL-1 vivants restent « several_live_notes »", () => {
    const twin = DeliveryNote.planFromOrder("dn_twin", SOURCE, CONFIRMED_AT);

    expect(alignmentOf(order(), [handedOverFirst(), twin, remainder()], context)).toEqual({
      change: "unrepairable",
      reason: "several_live_notes",
    });
  });

  it("une commande annulée n'annule que le BL-1 : le reliquat relève de son envoi", () => {
    const first = firstNote();
    const rest = remainder();

    const result = alignmentOf(order({ status: "cancelled" }), [first, rest], context);

    expect(result).toEqual({ change: "voided", writes: [first] });
    expect(rest.status).toBe("planned");
  });
});

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

describe("termsGapsOf — le reliquat porte ses propres montants", () => {
  it("ne compare que le BL-1 à la commande", () => {
    expect(termsGapsOf(order(), [handedOverFirst(), remainder()])).toEqual([]);
  });

  it("compte toujours un BL-1 en écart", () => {
    const shorter = DeliveryNote.planFromOrder(
      "dn_1",
      { ...SOURCE, lines: [BREAD, { ...BREAD, sku: "PAIN-002" }] },
      CONFIRMED_AT,
    );

    expect(
      termsGapsOf(
        order({ status: "confirmed", readyAt: null, handedOverAt: null, receivedOn: null }),
        [shorter, remainder()],
      ).map((gap) => gap.noteNumber),
    ).toEqual(["BL-7-1"]);
  });
});

describe("plan E7 reliquat (L5a) — la commande en partie retirée", () => {
  it("le BL-1 se remet comme sous `fulfilled`, le reste ne bouge pas", () => {
    const first = firstNote();
    first.prepare(READY_AT);
    const rest = remainder();
    const before = rest.toState();

    const result = alignmentOf(order({ status: "partially_handed_over" }), [first, rest], context);

    expect(result).toEqual({ change: "advanced", writes: [first] });
    expect(first.status).toBe("handed_over");
    expect(rest.toState()).toEqual(before);
  });

  it("BL-1 remis et reste vivant : aligné", () => {
    expect(
      alignmentOf(
        order({ status: "partially_handed_over" }),
        [handedOverFirst(), remainder()],
        context,
      ),
    ).toEqual({ change: "none" });
  });

  it("le BL-1 reste contrôlé contre sa commande", () => {
    const shorter = DeliveryNote.planFromOrder(
      "dn_1",
      { ...SOURCE, lines: [BREAD, { ...BREAD, sku: "PAIN-002" }] },
      CONFIRMED_AT,
    );

    expect(
      termsGapsOf(order({ status: "partially_handed_over" }), [shorter, remainder()]).map(
        (gap) => gap.noteNumber,
      ),
    ).toEqual(["BL-7-1"]);
  });
});
