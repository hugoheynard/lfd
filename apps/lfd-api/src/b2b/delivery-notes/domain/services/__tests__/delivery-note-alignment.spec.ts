import { DeliveryNote } from "../../entities/delivery-note.js";
import type { DeliveryNoteLineState } from "../../value-objects/delivery-note-line.js";
import { alignmentOf, type FollowedOrder } from "../delivery-note-alignment.js";

// Comparés entre eux seulement : la règle ne lit aucune horloge.
const CONFIRMED_AT = new Date(1_000);
const READY_AT = new Date(2_000);
const HANDED_OVER_AT = new Date(3_000);
const NOW = new Date(4_000);
const RECEIVED_ON = "1970-01-01";

const BREAD: DeliveryNoteLineState = {
  sku: "PAIN-001",
  productName: "Pain",
  unitPriceMillicents: 100_000,
  vatRate: 5.5,
  quantity: 2,
  lineTotalCents: 200,
  unitPriceTtcCents: null,
  lineTotalTtcCents: null,
};
const REVISED = { ...BREAD, quantity: 5, lineTotalCents: 500 };

function order(overrides: Partial<FollowedOrder> = {}): FollowedOrder {
  return {
    orderId: "ord_1",
    orderNumber: "ORD-7",
    lines: [BREAD],
    status: "confirmed",
    confirmedAt: CONFIRMED_AT,
    readyAt: null,
    handedOverAt: null,
    receivedOn: null,
    ...overrides,
  };
}

const READY = { status: "ready", readyAt: READY_AT } as const;
const FULFILLED = {
  status: "fulfilled",
  handedOverAt: HANDED_OVER_AT,
  receivedOn: RECEIVED_ON,
} as const;

const context = { newId: () => "dn_new", now: NOW };

function planned(lines = [BREAD]): DeliveryNote {
  return DeliveryNote.planFromOrder(
    "dn_1",
    { orderId: "ord_1", orderNumber: "ORD-7", lines },
    CONFIRMED_AT,
  );
}

function createdState(subject: FollowedOrder) {
  const result = alignmentOf(subject, [], context);
  if (result.change !== "created") {
    throw new RangeError(`attendu « created », obtenu « ${result.change} »`);
  }
  return result.created.toState();
}

describe("alignmentOf — sans BL, il naît plein, à l'état de la commande", () => {
  it("confirmée → prévu au `confirmed_at`", () => {
    expect(createdState(order())).toMatchObject({
      id: "dn_new",
      number: "BL-7-1",
      status: "planned",
      plannedAt: CONFIRMED_AT,
      lines: [BREAD],
    });
  });

  it("prête hors plan → préparé, prévu et préparé au `ready_at`", () => {
    expect(createdState(order({ ...READY, confirmedAt: null }))).toMatchObject({
      status: "prepared",
      plannedAt: READY_AT,
      preparedAt: READY_AT,
    });
  });

  it("remise hors plan, sans bac → remis, préparé à l'instant de la remise", () => {
    expect(createdState(order({ ...FULFILLED, confirmedAt: null }))).toMatchObject({
      status: "handed_over",
      plannedAt: HANDED_OVER_AT,
      preparedAt: HANDED_OVER_AT,
      handedOverAt: HANDED_OVER_AT,
      receivedOn: RECEIVED_ON,
    });
  });

  it("remise après un bac → préparé au `ready_at`", () => {
    expect(createdState(order({ ...FULFILLED, readyAt: READY_AT }))).toMatchObject({
      status: "handed_over",
      plannedAt: CONFIRMED_AT,
      preparedAt: READY_AT,
    });
  });
});

describe("alignmentOf — un BL en retard avance, ses lignes réalignées", () => {
  it("prévu sur une commande prête : lignes réécrites, puis préparé", () => {
    const note = planned();

    const result = alignmentOf(order({ ...READY, lines: [REVISED] }), [note], context);

    expect(result.change).toBe("advanced");
    expect(note.toState()).toMatchObject({
      status: "prepared",
      preparedAt: READY_AT,
      lines: [REVISED],
    });
  });

  it("préparé sur une commande remise : remis", () => {
    const note = planned();
    note.prepare(READY_AT);

    expect(alignmentOf(order({ ...FULFILLED, readyAt: READY_AT }), [note], context).change).toBe(
      "advanced",
    );
    expect(note.toState()).toMatchObject({ status: "handed_over", preparedAt: READY_AT });
  });

  it("idempotent : un BL juste n'est pas réécrit", () => {
    const note = planned();

    expect(alignmentOf(order(), [note], context)).toEqual({ change: "none" });
  });
});

describe("alignmentOf — annulation", () => {
  it("tout BL vivant non remis passe annulé, à l'instant donné", () => {
    const note = planned();
    note.prepare(READY_AT);

    const result = alignmentOf(order({ status: "cancelled" }), [note], context);

    expect(result.change).toBe("voided");
    expect(note.toState()).toMatchObject({ status: "voided", voidedAt: NOW, preparedAt: READY_AT });
  });

  it("sans BL vivant, ne fait rien", () => {
    expect(alignmentOf(order({ status: "cancelled" }), [], context)).toEqual({ change: "none" });
  });
});

describe("alignmentOf — hors champ, rien", () => {
  it.each<[string, Partial<FollowedOrder>]>([
    ["passée (attend la re-clôture)", { status: "placed" }],
    ["sans ligne", { lines: [] }],
  ])("%s", (_case, change) => {
    expect(alignmentOf(order(change), [], context)).toEqual({ change: "none" });
  });
});

describe("alignmentOf — ce qu'on ne répare pas est nommé, jamais inventé", () => {
  const voided = (): DeliveryNote => {
    const note = planned();
    note.void(CONFIRMED_AT);
    return note;
  };
  const handedOver = (): DeliveryNote => {
    const note = planned();
    note.handOver(HANDED_OVER_AT, RECEIVED_ON);
    return note;
  };

  it.each<[string, FollowedOrder, () => DeliveryNote[]]>([
    ["BL annulé seul sur une commande vivante", order(READY), () => [voided()]],
    ["deux BL vivants", order(), () => [planned(), planned()]],
    ["statut mort `in_production`", order({ status: "in_production" }), () => []],
    ["statut mort `draft`", order({ status: "draft" }), () => []],
    ["remise sans instant", order({ ...FULFILLED, handedOverAt: null }), () => []],
    ["remise sans jour de réception", order({ ...FULFILLED, receivedOn: null }), () => []],
    ["prête sans `ready_at`", order({ status: "ready" }), () => []],
    ["numéro sans ORD-", order({ orderNumber: "CMD-1" }), () => []],
    [
      "BL préparé sur une commande seulement confirmée",
      order(),
      () => {
        const note = planned();
        note.prepare(READY_AT);
        return [note];
      },
    ],
    ["BL remis sur une commande annulée", order({ status: "cancelled" }), () => [handedOver()]],
  ])("%s", (_case, subject, notes) => {
    expect(alignmentOf(subject, notes(), context).change).toBe("unrepairable");
  });

  it("nomme la cause", () => {
    expect(alignmentOf(order({ status: "draft" }), [], context)).toEqual({
      change: "unrepairable",
      reason: "dead_status",
    });
  });
});
