import { ORDER_TERMS } from "../../value-objects/__tests__/delivery-note-terms.fixture.js";
import {
  DeliveryNoteTermsAlreadySetError,
  InvalidDeliveryNoteTermsError,
} from "../../errors/delivery-note-errors.js";
import type { DeliveryNoteSourceLine } from "../../value-objects/delivery-note-line.js";
import { DeliveryNote, type DeliveryNoteSource, type DeliveryNoteState } from "../delivery-note.js";

// Comparés entre eux seulement : aucune horloge.
const PLANNED_AT = new Date(0);
const PREPARED_AT = new Date(1);
const HANDED_OVER_AT = new Date(2);
const RECEIVED_ON = "1970-01-01";

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
  pickupDiscountEligible: false,
};

function source(overrides: Partial<DeliveryNoteSource> = {}): DeliveryNoteSource {
  return {
    orderId: "ord_1",
    orderNumber: "ORD-9",
    lines: [BREAD],
    terms: ORDER_TERMS,
    ...overrides,
  };
}

/** Un BL écrit avant E4a : remis, sans en-tête, l'éligibilité de ses lignes inconnue. */
function handedOverBeforeE4a(): DeliveryNoteState {
  const note = DeliveryNote.planFromOrder("dn_1", source(), PLANNED_AT);
  note.handOver(HANDED_OVER_AT, RECEIVED_ON);
  const state = note.toState();
  return {
    ...state,
    terms: null,
    lines: state.lines.map((line) => ({ ...line, pickupDiscountEligible: null })),
  };
}

describe("DeliveryNote — l'en-tête recopié de la commande (plan E4a)", () => {
  it("planFromOrder recopie chacun des dix totaux, nommés un par un", () => {
    const { terms } = DeliveryNote.planFromOrder("dn_1", source(), PLANNED_AT).toState();

    expect(terms?.subtotalCents).toBe(ORDER_TERMS.subtotalCents);
    expect(terms?.discountCents).toBe(ORDER_TERMS.discountCents);
    expect(terms?.voucherDiscountCents).toBe(ORDER_TERMS.voucherDiscountCents);
    expect(terms?.deliveryFeeCents).toBe(ORDER_TERMS.deliveryFeeCents);
    expect(terms?.deliveryVatMode).toBe(ORDER_TERMS.deliveryVatMode);
    expect(terms?.lateFeeCents).toBe(ORDER_TERMS.lateFeeCents);
    expect(terms?.lateFeeAdjustment).toEqual(ORDER_TERMS.lateFeeAdjustment);
    expect(terms?.vatShares).toEqual(ORDER_TERMS.vatShares);
    expect(terms?.vatCents).toBe(ORDER_TERMS.vatCents);
    expect(terms?.totalCents).toBe(ORDER_TERMS.totalCents);
  });

  it("recopie NULL tel quel — une commande ancienne sans vat_shares, mode de TVA ni surtaxe", () => {
    const old = { ...ORDER_TERMS, vatShares: null, deliveryVatMode: null, lateFeeAdjustment: null };

    const { terms } = DeliveryNote.planFromOrder(
      "dn_1",
      source({ terms: old }),
      PLANNED_AT,
    ).toState();

    expect(terms).toEqual(old);
  });

  it("recopie l'éligibilité à la remise de retrait de chaque ligne", () => {
    const { lines } = DeliveryNote.planFromOrder("dn_1", source(), PLANNED_AT).toState();

    expect(lines.map((line) => line.pickupDiscountEligible)).toEqual([false]);
  });

  it("replanFrom recopie les nouveaux totaux de la commande", () => {
    const note = DeliveryNote.planFromOrder("dn_1", source(), PLANNED_AT);
    const revised = { ...ORDER_TERMS, totalCents: 70_000 };

    note.replanFrom(source({ terms: revised }));

    expect(note.toState().terms).toEqual(revised);
  });

  it.each(["subtotalCents", "vatCents", "totalCents", "lateFeeCents"] as const)(
    "refuse un total non entier (%s)",
    (field) => {
      const terms = { ...ORDER_TERMS, [field]: 1.5 };

      expect(() => DeliveryNote.planFromOrder("dn_1", source({ terms }), PLANNED_AT)).toThrow(
        InvalidDeliveryNoteTermsError,
      );
    },
  );
});

describe("DeliveryNote.completeTermsFrom — remplir un en-tête vide (plan E4a, § 4)", () => {
  it("complète un BL REMIS sans en-tête, sans toucher à son état ni à ses instants", () => {
    const before = handedOverBeforeE4a();
    const note = DeliveryNote.rehydrate(before);

    note.completeTermsFrom(source());

    expect(note.toState()).toEqual({
      ...before,
      terms: ORDER_TERMS,
      lines: [{ ...before.lines[0], pickupDiscountEligible: false }],
    });
  });

  it("ne devine pas l'éligibilité d'une ligne qui n'est plus la même", () => {
    const note = DeliveryNote.rehydrate(handedOverBeforeE4a());

    note.completeTermsFrom(source({ lines: [{ ...BREAD, quantity: 3, lineTotalCents: 300 }] }));

    expect(note.toState().lines[0]?.pickupDiscountEligible).toBeNull();
  });

  it("refuse un en-tête déjà posé : on ne change aucune valeur posée", () => {
    const note = DeliveryNote.planFromOrder("dn_1", source(), PLANNED_AT);
    note.prepare(PREPARED_AT);

    expect(() =>
      note.completeTermsFrom(source({ terms: { ...ORDER_TERMS, totalCents: 1 } })),
    ).toThrow(DeliveryNoteTermsAlreadySetError);
    expect(note.toState().terms).toEqual(ORDER_TERMS);
  });

  it("refuse un BL annulé, même sans en-tête", () => {
    const planned = DeliveryNote.planFromOrder("dn_1", source(), PLANNED_AT);
    planned.void(PREPARED_AT);
    const note = DeliveryNote.rehydrate({ ...planned.toState(), terms: null });

    expect(() => note.completeTermsFrom(source())).toThrow(DeliveryNoteTermsAlreadySetError);
  });
});
