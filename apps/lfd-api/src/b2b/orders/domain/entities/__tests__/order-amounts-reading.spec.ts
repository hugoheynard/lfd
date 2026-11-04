import type { BillingAddressPayload } from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";

import { InvalidOrderPaymentError } from "../../errors/order-errors.js";
import { shelfClaimOf } from "../../services/shelf-circuit.js";
import type { OrderLineInput } from "../../value-objects/order-line.js";
import type { OrderSupplyDecision } from "../../value-objects/order-supply.js";
import { Order, type DraftOrderInput } from "../order.js";
import type { PricedDraftInput } from "../order-priced-draft.js";
import { draftFrom, pickupPromotion, type DraftSpec } from "./priced-input.fixture.js";

/**
 * **`Order.amounts()`** — la lecture des montants que l'estimation de la
 * saisie rend (plan `documentation/pricing/saisie/plan-prix-de-la-saisie.md`,
 * lot P2) : les valeurs mêmes que `toPersistence()` écrira, sans règlement
 * décidé. Les jours ne sont comparés qu'entre eux (exception du CLAUDE.md §5).
 */

const SHOP: BillingAddressPayload = {
  label: "Boutique",
  ligne1: "1 place du Village",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

const TODAY = "2026-11-10";
const TEN_PERCENT = { mode: "percent", bp: 1_000 } as const;
const LATE_FEE = { adjustment: { mode: "amount", cents: 100 }, vatRatePercent: 20 } as const;

const line = (sku: string, qty: number, cents: number, vatRate: number): OrderLineInput => ({
  sku,
  productName: sku,
  unitPriceMillicents: millicentsFromCents(cents),
  vatRate,
  saleUnit: "piece",
  quantity: qty,
  pricing: {
    basePriceMillicents: millicentsFromCents(cents),
    steps: [],
    floored: false,
    clampedToZero: false,
    floorDecision: null,
    commitment: null,
    rejected: [],
  },
});

const PICKUP: DraftOrderInput["fulfillment"] = {
  method: "pickup",
  deliveryZoneId: null,
  deliveryAddress: null,
  deliveryAddressId: null,
  pickupAddress: { ...SHOP, siteId: "site_village" },
};

const DELIVERY: DraftOrderInput["fulfillment"] = {
  method: "delivery",
  deliveryZoneId: "zone_1",
  deliveryAddress: SHOP,
  deliveryAddressId: null,
  pickupAddress: null,
};

function input(over: Partial<DraftSpec> = {}): PricedDraftInput {
  return draftFrom(
    {
      companyId: "co_1",
      billedCompanyId: "co_1",
      principal: null,
      placedByStaffId: "staff_1",
      buyerKind: "registered",
      agreed: {
        window: { value: null, source: "default" },
        contact: { value: null, source: "default" },
        signatureRequired: { value: false, source: "default" },
      },
      placedByUserId: "usr_1",
      fulfillment: PICKUP,
      requestedDeliveryDate: new Date(`${TODAY}T00:00:00.000Z`),
      note: "",
      catalogVersionId: null,
      // 6,00 € à 5,5 % et 6,00 € à 20 % : un sous-total de 12,00 € HT.
      lines: [line("VIE-001", 3, 200, 5.5), line("PAT-001", 2, 300, 20)],
      promotions: [pickupPromotion(TEN_PERCENT)],
      lateFee: LATE_FEE,
      voucher: null,
      salesTerms: { document: "salesTermsPro", revision: null, fileId: null },
      locale: null,
    },
    over,
  );
}

/** La même commande, règlement décidé, telle que l'adaptateur l'écrirait. */
function persisted(draft: PricedDraftInput, supply?: OrderSupplyDecision) {
  const order = Order.draft(draft, supply);
  order.deferPayment();
  return order.toPersistence();
}

describe("Order.amounts()", () => {
  it("se lit sans règlement décidé, et n'en décide aucun", () => {
    const order = Order.draft(input());

    expect(order.amounts().totalCents).toBeGreaterThan(0);
    expect(() => order.toPersistence()).toThrow(InvalidOrderPaymentError);
  });

  it("rend, en retrait, les montants que la commande écrira — remise et supplément compris", () => {
    const reading = Order.draft(input()).amounts();
    const written = persisted(input());

    expect(reading).toMatchObject({
      vatMethod: written.vatMethod,
      subtotalCents: 1_200,
      discountCents: 120,
      deliveryFeeCents: 0,
      lateFeeCents: 100,
      lateFeeVatRatePercent: 20,
      vatCents: written.vatCents,
      vatShares: written.vatShares,
      totalCents: written.totalCents,
    });
    expect(reading.subtotalCents).toBe(written.subtotalCents);
    expect(reading.lines.map((each) => each.lineTotalCents)).toEqual(
      written.lines.map((each) => each.lineTotalCents),
    );
  });

  it("ventile le supplément à son propre taux : la part à 20 % le porte", () => {
    const withFee = Order.draft(input()).amounts();
    const withoutFee = Order.draft(input({ lateFee: null })).amounts();
    const at20 = (shares: readonly { rate: number; amountCents: number }[]) =>
      shares.find((share) => share.rate === 20)?.amountCents ?? 0;

    expect(at20(withFee.vatShares) - at20(withoutFee.vatShares)).toBe(20);
    expect(withFee.totalCents - withoutFee.totalCents).toBe(120);
  });

  it("rend les frais de zone d'une livraison, tels qu'écrits", () => {
    const delivery = input({
      fulfillment: DELIVERY,
      deliveryFee: { mode: "amount", cents: 800 },
    });

    const reading = Order.draft(delivery).amounts();

    expect(reading.deliveryFeeCents).toBe(800);
    expect(reading.totalCents).toBe(persisted(delivery).totalCents);
  });

  it("détaille la remise de retrait comme l'étape que la commande fige", () => {
    const reading = Order.draft(input()).amounts();

    expect(reading.discounts).toEqual([
      expect.objectContaining({ rank: 1, amountCents: 120, promotionId: "promo_panier" }),
    ]);
    expect(reading.discounts.map((each) => each.amountCents)).toEqual(
      persisted(input()).basketDiscounts.map((each) => each.amountCents),
    );
  });

  it("porte, par ligne, le prix facturé et le tarif d’entrée de sa trace (sans étage ici : égaux)", () => {
    const [first] = Order.draft(input()).amounts().lines;

    expect(first).toMatchObject({
      sku: "VIE-001",
      unitPriceMillicents: millicentsFromCents(200),
      basePriceMillicents: millicentsFromCents(200),
    });
  });

  it("rend un tarif d'entrée `null` pour une ligne sans trace, jamais un prix inventé", () => {
    const untraced = { ...line("VIE-001", 3, 200, 5.5), pricing: null };
    const [first] = Order.draft(input({ lines: [untraced] })).amounts().lines;

    expect(first?.basePriceMillicents).toBeNull();
  });

  it("rend aussi les montants d'une commande de particulier (`exact_ht`)", () => {
    const individual = input({
      companyId: null,
      billedCompanyId: null,
      promotions: [],
      lateFee: null,
      salesTerms: { document: "salesTerms", revision: null, fileId: null },
    });
    const reading = Order.draft(individual).amounts();
    const written = persisted(individual);

    expect(reading.vatMethod).toBe("exact_ht");
    expect(reading).toMatchObject({
      subtotalCents: written.subtotalCents,
      vatCents: written.vatCents,
      totalCents: written.totalCents,
    });
    expect(reading.lines.map((each) => each.lineTotalTtcCents)).toEqual(
      written.lines.map((each) => each.lineTotalTtcCents),
    );
  });
});

describe("Order.shelfClaim", () => {
  const SHELF: OrderSupplyDecision = { supply: "shelf", today: TODAY, entryShortcut: null };

  it("rend la prise de la forme persistée, sans règlement décidé", () => {
    const order = Order.draft(input(), SHELF);

    expect(order.shelfClaim).toEqual(shelfClaimOf(persisted(input(), SHELF)));
    expect(order.shelfClaim?.siteId).toBe("site_village");
  });

  it("ne prend rien à la vitrine pour une commande fabriquée", () => {
    expect(Order.draft(input()).shelfClaim).toBeNull();
  });
});
