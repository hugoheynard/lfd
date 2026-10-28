import { ORDER_TERMS } from "../../value-objects/__tests__/delivery-note-terms.fixture.js";
import {
  DeliveryNoteNotPlannedError,
  DeliveryNoteTransitionRefusedError,
  InvalidDeliveryNoteReceivedOnError,
  DeliveryNoteWithoutLinesError,
  InvalidDeliveryNoteLineError,
} from "../../errors/delivery-note-errors.js";
import type { DeliveryNoteSourceLine } from "../../value-objects/delivery-note-line.js";
import { DeliveryNote, type DeliveryNoteSource } from "../delivery-note.js";

const PLANNED_AT = new Date(0);
const VOIDED_AT = new Date(1);
const PREPARED_AT = new Date(2);
const HANDED_OVER_AT = new Date(3);
const RECEIVED_ON = "1970-01-01";

const BREAD: DeliveryNoteSourceLine = {
  sku: "PAIN-001",
  productName: "Pain de campagne",
  unitPriceMillicents: 412_345,
  vatRate: 5.5,
  quantity: 12,
  saleUnit: "piece" as const,
  lineTotalCents: 49_481,
  unitPriceTtcCents: null,
  lineTotalTtcCents: null,
  pickupDiscountEligible: true,
};

const CROISSANT: DeliveryNoteSourceLine = {
  sku: "VIEN-002",
  productName: "Croissant",
  unitPriceMillicents: 95_000,
  vatRate: 5.5,
  quantity: 6,
  saleUnit: "piece" as const,
  lineTotalCents: 5_700,
  unitPriceTtcCents: 100,
  lineTotalTtcCents: 601,
  pickupDiscountEligible: true,
};

function order(lines: readonly DeliveryNoteSourceLine[]): DeliveryNoteSource {
  return { orderId: "ord_1", orderNumber: "ORD-1042", lines, terms: ORDER_TERMS };
}

describe("DeliveryNote.planFromOrder", () => {
  it("prévoit le BL-1, numéroté d'après la commande, ses lignes recopiées telles quelles", () => {
    const note = DeliveryNote.planFromOrder("dn_1", order([BREAD, CROISSANT]), PLANNED_AT);

    expect(note.toState()).toEqual({
      id: "dn_1",
      orderId: "ord_1",
      rank: 1,
      number: "BL-1042-1",
      serviceDay: null,
      status: "planned",
      plannedAt: PLANNED_AT,
      // Le papier (plan E6, § 14) : version 1, jamais imprimé.
      contentVersion: 1,
      printed: null,
      voidedAt: null,
      preparedAt: null,
      handedOverAt: null,
      receivedOn: null,
      lines: [BREAD, CROISSANT],
      terms: ORDER_TERMS,
    });
  });

  it("recopie une ligne à quantité 0 (plan E1, § 6 : « livré = Σ des BL » n'en perd aucune)", () => {
    const zero = { ...CROISSANT, quantity: 0, lineTotalCents: 0, lineTotalTtcCents: 0 };

    const note = DeliveryNote.planFromOrder("dn_1", order([BREAD, zero]), PLANNED_AT);

    expect(note.toState().lines).toEqual([BREAD, zero]);
  });

  it("refuse une commande sans ligne", () => {
    expect(() => DeliveryNote.planFromOrder("dn_1", order([]), PLANNED_AT)).toThrow(
      DeliveryNoteWithoutLinesError,
    );
  });

  it.each<[string, Partial<DeliveryNoteSourceLine>]>([
    ["quantité négative", { quantity: -1 }],
    ["quantité fractionnaire", { quantity: 1.5 }],
    ["prix non entier", { unitPriceMillicents: 1.2 }],
    ["TTC non entier", { lineTotalTtcCents: 3.3 }],
    ["taux négatif", { vatRate: -5.5 }],
    ["SKU vide", { sku: " " }],
  ])("refuse une ligne invalide (%s)", (_case, change) => {
    expect(() =>
      DeliveryNote.planFromOrder("dn_1", order([{ ...BREAD, ...change }]), PLANNED_AT),
    ).toThrow(InvalidDeliveryNoteLineError);
  });
});

describe("DeliveryNote — un BL prévu se réécrit, il ne se duplique pas", () => {
  it("replanFrom remplace les lignes, garde id, rang, numéro et instant de prévision", () => {
    const note = DeliveryNote.planFromOrder("dn_1", order([BREAD]), PLANNED_AT);

    note.replanFrom(order([CROISSANT]));

    expect(note.toState()).toMatchObject({
      id: "dn_1",
      rank: 1,
      number: "BL-1042-1",
      status: "planned",
      plannedAt: PLANNED_AT,
      lines: [CROISSANT],
    });
  });

  it("void annule le BL prévu, qui garde son numéro", () => {
    const note = DeliveryNote.planFromOrder("dn_1", order([BREAD]), PLANNED_AT);

    note.void(VOIDED_AT);

    expect(note.toState()).toMatchObject({
      number: "BL-1042-1",
      status: "voided",
      voidedAt: VOIDED_AT,
      lines: [BREAD],
    });
  });

  it("un BL annulé ne se réécrit plus, ne s'annule pas deux fois", () => {
    const note = DeliveryNote.planFromOrder("dn_1", order([BREAD]), PLANNED_AT);
    note.void(VOIDED_AT);

    expect(() => note.replanFrom(order([CROISSANT]))).toThrow(DeliveryNoteNotPlannedError);
    expect(() => note.void(VOIDED_AT)).toThrow(DeliveryNoteTransitionRefusedError);
  });

  it("rehydrate revalide les lignes relues", () => {
    const state = DeliveryNote.planFromOrder("dn_1", order([BREAD]), PLANNED_AT).toState();

    expect(DeliveryNote.rehydrate(state).toState()).toEqual(state);
    expect(() => DeliveryNote.rehydrate({ ...state, lines: [{ ...BREAD, quantity: -2 }] })).toThrow(
      InvalidDeliveryNoteLineError,
    );
  });
});

describe("DeliveryNote — le BL suit la commande (plan E2, § 8.3)", () => {
  const planned = (): DeliveryNote =>
    DeliveryNote.planFromOrder("dn_1", order([BREAD]), PLANNED_AT);

  it("prepare : prévu → préparé, à l'instant du bac", () => {
    const note = planned();

    note.prepare(PREPARED_AT);

    expect(note.toState()).toMatchObject({
      status: "prepared",
      preparedAt: PREPARED_AT,
      handedOverAt: null,
    });
  });

  it("handOver depuis préparé : garde l'instant du bac, pose remise et jour de réception", () => {
    const note = planned();
    note.prepare(PREPARED_AT);

    note.handOver(HANDED_OVER_AT, RECEIVED_ON);

    expect(note.toState()).toMatchObject({
      status: "handed_over",
      preparedAt: PREPARED_AT,
      handedOverAt: HANDED_OVER_AT,
      receivedOn: RECEIVED_ON,
    });
  });

  it("handOver depuis prévu (remise sans bac) : préparé à l'instant de la remise", () => {
    const note = planned();

    note.handOver(HANDED_OVER_AT, RECEIVED_ON);

    expect(note.toState()).toMatchObject({ status: "handed_over", preparedAt: HANDED_OVER_AT });
  });

  it("void depuis préparé : annulé, l'instant du bac reste", () => {
    const note = planned();
    note.prepare(PREPARED_AT);

    note.void(VOIDED_AT);

    expect(note.toState()).toMatchObject({
      status: "voided",
      voidedAt: VOIDED_AT,
      preparedAt: PREPARED_AT,
    });
    expect(note.isLive).toBe(false);
  });

  it("refuse : préparer deux fois, remettre ou annuler un BL remis, réécrire un BL préparé", () => {
    const note = planned();
    note.prepare(PREPARED_AT);
    expect(() => note.prepare(PREPARED_AT)).toThrow(DeliveryNoteTransitionRefusedError);
    expect(() => note.replanFrom(order([CROISSANT]))).toThrow(DeliveryNoteNotPlannedError);
    note.handOver(HANDED_OVER_AT, RECEIVED_ON);

    expect(() => note.handOver(HANDED_OVER_AT, RECEIVED_ON)).toThrow(
      DeliveryNoteTransitionRefusedError,
    );
    expect(() => note.void(VOIDED_AT)).toThrow(DeliveryNoteTransitionRefusedError);
    expect(() => note.prepare(PREPARED_AT)).toThrow(DeliveryNoteTransitionRefusedError);
  });

  it("refuse de préparer ou remettre un BL annulé", () => {
    const note = planned();
    note.void(VOIDED_AT);

    expect(() => note.prepare(PREPARED_AT)).toThrow(DeliveryNoteTransitionRefusedError);
    expect(() => note.handOver(HANDED_OVER_AT, RECEIVED_ON)).toThrow(
      DeliveryNoteTransitionRefusedError,
    );
  });

  it("refuse un jour de réception qui n'est pas AAAA-MM-JJ", () => {
    expect(() => planned().handOver(HANDED_OVER_AT, "01/01/1970")).toThrow(
      InvalidDeliveryNoteReceivedOnError,
    );
  });

  it("rehydrate relit les colonnes d'avancement", () => {
    const note = planned();
    note.handOver(HANDED_OVER_AT, RECEIVED_ON);
    const state = note.toState();

    expect(DeliveryNote.rehydrate(state).toState()).toEqual(state);
  });
});
