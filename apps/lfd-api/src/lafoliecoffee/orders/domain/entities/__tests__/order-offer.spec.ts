import { Order } from "../order.js";
import { offerAppliedTo } from "../order-offered-amounts.js";
import type { DraftOrderInput } from "../order-shapes.js";
import {
  InvalidOrderOfferError,
  OfferChangeOnRevisionError,
  OfferedOrderWithVoucherError,
} from "../../errors/order-offer-errors.js";
import { orderOfferReasonOf, type OrderOfferReason } from "../../value-objects/order-offer.js";
import {
  LABO,
  input,
  line,
  placed,
  revised,
} from "../../../revision/domain/entities/__tests__/revisable-order.fixture.js";

/**
 * **La commande offerte dans l'agrégat** (`la-commande-offerte.md`, § 2.2) :
 * composée entière, puis ramenée à zéro taux par taux, et offerte elle reste
 * à la révision.
 */

const TASTING: OrderOfferReason = {
  nature: "tasting",
  note: "Dégustation mariage",
  notifyCustomer: false,
};
const FEE = { mode: "amount", cents: 1_500 } as const;
const DELIVERED: DraftOrderInput["fulfillment"] = {
  method: "delivery",
  deliveryZoneId: "zone_1",
  deliveryAddress: LABO,
  deliveryAddressId: null,
  pickupAddress: null,
};
const TWO_RATES = [line("VIE-001", 10), { ...line("BOI-001", 3, 350), vatRate: 20 }];

/** L'état persisté d'une commande dont le règlement est décidé. */
function stateOf(order: Order) {
  order.deferPayment();
  return order.toPersistence();
}

/** La même commande, payée puis offerte : ce qu'elle aurait coûté, et ce qu'elle coûte. */
function paidAndOffered(over: Parameters<typeof input>[0] = {}) {
  const paid = stateOf(Order.draft(input(over)));
  const offered = Order.draft(input({ ...over, offer: TASTING }));
  return { paid, offered };
}

describe("Order.draft — une commande offerte", () => {
  it("🔴 tombe à zéro et garde ce qu'elle valait, chez un pro (line_ht)", () => {
    const { paid, offered } = paidAndOffered({ lines: TWO_RATES });

    expect(offered.totalCents).toBe(0);
    expect(offered.offer?.value).toEqual({
      totalCents: paid.totalCents,
      htCents: paid.totalCents - paid.vatCents,
      vatCents: paid.vatCents,
      vatShares: paid.vatShares,
    });
    expect(offered.offer?.value.vatShares.map((share) => share.rate)).toEqual([5.5, 20]);
    expect(offered.offer?.reason).toEqual(TASTING);
  });

  it("garde les lignes à leur prix et ne collecte aucune TVA", () => {
    const { paid, offered } = paidAndOffered({ lines: TWO_RATES });
    const state = stateOf(offered);

    expect(state.lines).toEqual(paid.lines);
    expect(state.subtotalCents).toBe(paid.subtotalCents);
    expect(state.vatCents).toBe(0);
    expect(state.vatShares).toEqual([]);
    expect(state.ttcByRate).toBeNull();
    expect(state.offer?.value.totalCents).toBe(paid.totalCents);
  });

  it("🔴 couvre les frais de livraison : une commande livrée tombe à zéro aussi", () => {
    const { paid, offered } = paidAndOffered({ fulfillment: DELIVERED, deliveryFee: FEE });

    expect(paid.deliveryFeeCents).toBe(1_500);
    expect(offered.totalCents).toBe(0);
    expect(offered.offer?.value.totalCents).toBe(paid.totalCents);
  });

  it("chez un particulier (exact_ht) : total nul, parts par taux vides", () => {
    const particular = { companyId: null, billedCompanyId: null, lines: TWO_RATES };
    const { paid, offered } = paidAndOffered(particular);
    const state = stateOf(offered);

    expect(state.vatMethod).toBe("exact_ht");
    expect(state.totalCents).toBe(0);
    expect(state.ttcByRate).toEqual([]);
    expect(state.offer?.value.totalCents).toBe(paid.totalCents);
  });

  it("une commande payée n'a pas d'offre", () => {
    expect(Order.draft(input()).offer).toBeNull();
  });
});

describe("offerAppliedTo — le bon", () => {
  it("🔴 refuse un bon sur une commande offerte", () => {
    const amounts = stateOf(Order.draft(input()));
    const drafted = {
      vatMethod: amounts.vatMethod,
      lines: [],
      subtotalCents: amounts.subtotalCents,
      discountCents: 0,
      deliveryFeeCents: 0,
      voucherDiscountCents: 0,
      vatCents: amounts.vatCents,
      vatShares: amounts.vatShares,
      totalCents: amounts.totalCents,
      ttcTerms: null,
      ttcByRate: null,
      basketSteps: [],
    };

    expect(() =>
      offerAppliedTo(drafted, { offer: TASTING, voucher: { id: "v_1", valueCents: 500 } }),
    ).toThrow(OfferedOrderWithVoucherError);
  });
});

describe("Order.revise — une commande offerte le reste", () => {
  it("🔴 garde le total à zéro quand les lignes changent", () => {
    const current = placed({ offer: TASTING }, input({ offer: TASTING }));

    const { revision } = Order.revise(current, revised(current, { lines: [line("VIE-001", 20)] }));

    expect(revision.totalAfterCents).toBe(0);
  });

  it("🔴 refuse qu'une modification rende offerte une commande payée", () => {
    const current = placed();

    expect(() =>
      Order.revise(current, revised(current, { lines: [line("VIE-001", 20)], offer: TASTING })),
    ).toThrow(OfferChangeOnRevisionError);
  });
});

describe("orderOfferReasonOf", () => {
  it("garde une nature du registre et un texte rogné", () => {
    expect(orderOfferReasonOf({ nature: "event", note: "  Salon  " })).toEqual({
      nature: "event",
      note: "Salon",
      notifyCustomer: false,
    });
  });

  it("🔴 ne prévient le client que si on le demande (décidé par Hugo le 2026-11-23)", () => {
    expect(orderOfferReasonOf({ nature: "event", note: "Salon", notifyCustomer: true })).toEqual({
      nature: "event",
      note: "Salon",
      notifyCustomer: true,
    });
  });

  it.each([
    ["une nature hors registre", { nature: "gift", note: "x" }],
    ["un texte vide", { nature: "tasting", note: "   " }],
    ["un texte trop long", { nature: "tasting", note: "x".repeat(281) }],
  ])("refuse %s", (_label, raw) => {
    expect(() => orderOfferReasonOf(raw)).toThrow(InvalidOrderOfferError);
  });
});
