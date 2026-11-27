import { carrierNoteOf } from "../../services/delivery-note-sheet.js";
import { HEAD } from "../../services/__tests__/delivery-note-sheet.fixture.js";
import { ORDER_TERMS } from "../../value-objects/__tests__/delivery-note-terms.fixture.js";
import { DeliveryNote, type DeliveryNoteSource } from "../delivery-note.js";

/**
 * Le bon porte les options de la ligne (« dont 2 tranchés »,
 * `plan-options-de-commande.md`, § 3.4). Instants comparés entre eux, jamais
 * à l'horloge.
 */
const T0 = new Date(0);

const SLICED = {
  group: "tranchage",
  groupName: "Tranchage",
  choice: "tranche",
  choiceLabel: "tranché",
  quantity: 2,
  position: 0,
};

const LINE = {
  sku: "PAIN",
  productName: "Pain de campagne",
  unitPriceMillicents: 100_000,
  vatRate: 5.5,
  quantity: 4,
  saleUnit: "piece" as const,
  lineTotalCents: 400,
  unitPriceTtcCents: null,
  lineTotalTtcCents: null,
  pickupDiscountEligible: true,
};

const SOURCE: DeliveryNoteSource = {
  orderId: "ord_1",
  orderNumber: "ORD-0001",
  lines: [{ ...LINE, optionChoices: [SLICED] }],
  terms: ORDER_TERMS,
};

describe("DeliveryNote — les options", () => {
  it("recopie les options de la commande, et le bon de transport les dit", () => {
    const note = DeliveryNote.planFromOrder("dn_1", SOURCE, T0);

    expect(note.toState().lines[0]?.optionChoices).toEqual([SLICED]);
    expect(carrierNoteOf(note.toState(), HEAD).lines[0]?.options).toEqual([
      { groupName: "Tranchage", choiceLabel: "tranché", quantity: 2 },
    ]);
  });

  it("une option changée change le papier ; les mêmes options, non", () => {
    const note = DeliveryNote.planFromOrder("dn_1", SOURCE, T0);
    note.replanFrom(SOURCE);
    expect(note.toState().contentVersion).toBe(1);

    note.replanFrom({
      ...SOURCE,
      lines: [{ ...LINE, optionChoices: [{ ...SLICED, quantity: 3 }] }],
    });
    expect(note.toState().contentVersion).toBe(2);
  });

  it("une ligne sans option : le bon de transport n'écrit pas le champ", () => {
    const note = DeliveryNote.planFromOrder("dn_1", { ...SOURCE, lines: [LINE] }, T0);

    expect(carrierNoteOf(note.toState(), HEAD).lines[0]).not.toHaveProperty("options");
  });
});
