import {
  DeliveryNoteNotPlannedError,
  DeliveryNoteWithoutLinesError,
  InvalidDeliveryNoteLineError,
} from "../../errors/delivery-note-errors.js";
import type { DeliveryNoteLineState } from "../../value-objects/delivery-note-line.js";
import { DeliveryNote, type DeliveryNoteSource } from "../delivery-note.js";

const PLANNED_AT = new Date(0);
const VOIDED_AT = new Date(1);

const BREAD: DeliveryNoteLineState = {
  sku: "PAIN-001",
  productName: "Pain de campagne",
  unitPriceMillicents: 412_345,
  vatRate: 5.5,
  quantity: 12,
  lineTotalCents: 49_481,
  unitPriceTtcCents: null,
  lineTotalTtcCents: null,
};

const CROISSANT: DeliveryNoteLineState = {
  sku: "VIEN-002",
  productName: "Croissant",
  unitPriceMillicents: 95_000,
  vatRate: 5.5,
  quantity: 6,
  lineTotalCents: 5_700,
  unitPriceTtcCents: 100,
  lineTotalTtcCents: 601,
};

function order(lines: readonly DeliveryNoteLineState[]): DeliveryNoteSource {
  return { orderId: "ord_1", orderNumber: "ORD-1042", lines };
}

describe("DeliveryNote.planFromOrder", () => {
  it("prévoit le BL-1, numéroté d'après la commande, ses lignes recopiées telles quelles", () => {
    const note = DeliveryNote.planFromOrder("dn_1", order([BREAD, CROISSANT]), PLANNED_AT);

    expect(note.toState()).toEqual({
      id: "dn_1",
      orderId: "ord_1",
      rank: 1,
      number: "BL-1042-1",
      status: "planned",
      plannedAt: PLANNED_AT,
      voidedAt: null,
      lines: [BREAD, CROISSANT],
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

  it.each<[string, Partial<DeliveryNoteLineState>]>([
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
    expect(() => note.void(VOIDED_AT)).toThrow(DeliveryNoteNotPlannedError);
  });

  it("rehydrate revalide les lignes relues", () => {
    const state = DeliveryNote.planFromOrder("dn_1", order([BREAD]), PLANNED_AT).toState();

    expect(DeliveryNote.rehydrate(state).toState()).toEqual(state);
    expect(() => DeliveryNote.rehydrate({ ...state, lines: [{ ...BREAD, quantity: -2 }] })).toThrow(
      InvalidDeliveryNoteLineError,
    );
  });
});
