import type { BillingAddressPayload } from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";

import {
  ShelfOrderNotPickupError,
  ShelfOrderNotTodayError,
  ShelfOrderRouteChangeError,
} from "../../errors/shelf-order-errors.js";
import type { OrderLineInput } from "../../value-objects/order-line.js";
import { EntryOriginWithoutStaffError } from "../../errors/entry-origin-errors.js";
import type { OrderEntryOrigin, OrderSupplyDecision } from "../../value-objects/order-supply.js";
import { Order, type DraftOrderInput } from "../order.js";
import type { PricedDraftInput } from "../order-priced-draft.js";
import { draftFrom, type DraftSpec } from "./priced-input.fixture.js";
import type { RevisableOrder } from "../order-revision.js";

/**
 * **La marque d'une commande sur stock** (plan
 * `documentation/limites-de-commande/jour-meme-sur-stock.md`,
 * lot L1) : `shelf` ⇒ un retrait, aujourd'hui ; la révision garde le mode, la
 * journée et le point.
 *
 * « Aujourd'hui » est un PARAMÈTRE de l'agrégat, jamais lu à l'horloge : les
 * jours ci-dessous ne sont comparés qu'entre eux (exception étroite du
 * CLAUDE.md §5).
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
const TOMORROW = "2026-11-11";

const SHELF: OrderSupplyDecision = { supply: "shelf", today: TODAY, entryShortcut: null };

const line = (sku: string, qty: number): OrderLineInput => ({
  sku,
  productName: sku,
  unitPriceMillicents: millicentsFromCents(200),
  vatRate: 5.5,
  saleUnit: "piece",
  quantity: qty,
});

const atShop = (siteId: string): DraftOrderInput["fulfillment"] => ({
  method: "pickup",
  deliveryZoneId: null,
  deliveryAddress: null,
  deliveryAddressId: null,
  pickupAddress: { ...SHOP, siteId },
});

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
      fulfillment: atShop("site_village"),
      requestedDeliveryDate: new Date(`${TODAY}T00:00:00.000Z`),
      note: "",
      catalogVersionId: null,
      lines: [line("VIE-001", 3)],
      voucher: null,
      salesTerms: { document: "salesTermsPro", revision: null, fileId: null },
      locale: null,
    },
    over,
  );
}

/** La commande telle qu'on la relit pour la modifier, d'après sa passation. */
function placed(
  supply: OrderSupplyDecision,
  entryOrigin: OrderEntryOrigin | null = null,
): RevisableOrder {
  const order = Order.draft(input(), supply, entryOrigin);
  order.deferPayment();
  const state = order.toPersistence();
  return {
    orderId: "ord_1",
    orderNumber: "ORD-1",
    revision: 0,
    vatMethod: state.vatMethod,
    companyId: state.companyId,
    billedCompanyId: state.billedCompanyId,
    principal: null,
    placedByUserId: state.placedByUserId,
    placedByStaffId: state.placedByStaffId,
    buyerKind: "registered",
    status: "placed",
    paymentStatus: "not_required",
    shortfallDecided: false,
    discountPromotionId: null,
    discountAdjustment: null,
    discountLabel: null,
    discountCents: 0,
    discountTtcCents: null,
    activeDiscounts: [],
    totalCents: state.totalCents,
    stripePaymentIntentId: null,
    cancelledAt: null,
    refunds: { refundableCents: 0, inFlightCents: 0 },
    serviceDay: TODAY,
    supply: state.supply,
    entryShortcut: state.entryShortcut,
    entryOrigin: state.entryOrigin,
    fulfillment: atShop("site_village"),
    agreed: state.agreed,
    note: "",
    lines: state.lines,
    deliveryVatMode: state.deliveryVatMode,
    deliveryFeeAdjustment: state.deliveryFeeAdjustment,
    freeDeliveryThresholdCents: state.freeDelivery?.thresholdCents ?? null,
    lateFeeAdjustment: null,
    voucher: null,
    salesTerms: state.salesTerms,
    locale: null,
    catalogVersionId: null,
    customerCancellation: state.customerCancellation,
    customerCancellableUntil: state.customerCancellableUntil,
  };
}

function persisted(supply?: OrderSupplyDecision) {
  const order = supply === undefined ? Order.draft(input()) : Order.draft(input(), supply);
  order.deferPayment();
  return order.toPersistence();
}

describe("Order.draft — la marque de la marchandise", () => {
  it("sans marque, la commande est fabriquée pour elle, sans raccourci", () => {
    expect(persisted()).toMatchObject({ supply: "planned", entryShortcut: null });
  });

  it("une commande sur stock d'aujourd'hui, au retrait, porte sa marque et son raccourci", () => {
    const state = persisted({ supply: "shelf", today: TODAY, entryShortcut: "immediate_pickup" });

    expect(state).toMatchObject({ supply: "shelf", entryShortcut: "immediate_pickup" });
  });

  it("refuse une commande sur stock livrée, en nommant le retrait", () => {
    const delivered = input({
      fulfillment: {
        method: "delivery",
        deliveryZoneId: "zone_1",
        deliveryAddress: SHOP,
        deliveryAddressId: null,
        pickupAddress: null,
      },
    });

    expect(() => Order.draft(delivered, SHELF)).toThrow(ShelfOrderNotPickupError);
    expect(() => Order.draft(delivered, SHELF)).toThrow("se retire au comptoir");
  });

  it("refuse une commande sur stock pour demain : son stock n'existe pas encore", () => {
    const tomorrow = input({ requestedDeliveryDate: new Date(`${TOMORROW}T00:00:00.000Z`) });

    expect(() => Order.draft(tomorrow, SHELF)).toThrow(ShelfOrderNotTodayError);
    expect(() => Order.draft(tomorrow, SHELF)).toThrow(`pas le ${TOMORROW}`);
  });

  it("refuse une commande sur stock sans journée", () => {
    expect(() => Order.draft(input({ requestedDeliveryDate: null }), SHELF)).toThrow(
      ShelfOrderNotTodayError,
    );
  });

  it("une commande fabriquée pour demain reste admise, livrée ou non", () => {
    const tomorrow = input({ requestedDeliveryDate: new Date(`${TOMORROW}T00:00:00.000Z`) });

    expect(() => Order.draft(tomorrow, { supply: "planned" })).not.toThrow();
  });
});

describe("Order.recompose — une commande sur stock garde son acheminement", () => {
  it("change ses lignes et ses quantités, et garde sa marque", () => {
    const revision = Order.revise(
      placed({ supply: "shelf", today: TODAY, entryShortcut: "immediate_pickup" }),
      input({ lines: [line("VIE-001", 5), line("PAI-001", 1)] }),
    ).revision;

    expect(revision.changes).toEqual(["lines"]);
    expect(revision.state).toMatchObject({ supply: "shelf", entryShortcut: "immediate_pickup" });
  });

  it("refuse de changer sa journée", () => {
    const moved = input({ requestedDeliveryDate: new Date(`${TOMORROW}T00:00:00.000Z`) });

    expect(() => Order.recompose(placed(SHELF), moved)).toThrow(
      new ShelfOrderRouteChangeError("ord_1", "date"),
    );
  });

  it("refuse de changer son point : le stock d'un autre point est un autre stock", () => {
    const elsewhere = input({ fulfillment: atShop("site_station") });

    expect(() => Order.recompose(placed(SHELF), elsewhere)).toThrow(
      new ShelfOrderRouteChangeError("ord_1", "pickup_point"),
    );
  });

  it("refuse de la passer en livraison, qui l'enverrait en tournée", () => {
    const delivered = input({
      fulfillment: {
        method: "delivery",
        deliveryZoneId: "zone_1",
        deliveryAddress: SHOP,
        deliveryAddressId: null,
        pickupAddress: null,
      },
    });

    expect(() => Order.recompose(placed(SHELF), delivered)).toThrow(
      new ShelfOrderRouteChangeError("ord_1", "method"),
    );
  });

  it("une commande fabriquée pour elle change de journée comme avant, et reste `planned`", () => {
    const moved = input({ requestedDeliveryDate: new Date(`${TOMORROW}T00:00:00.000Z`) });

    const { revision } = Order.recompose(placed({ supply: "planned" }), moved);

    expect(revision.changes).toContain("date");
    expect(revision.state.supply).toBe("planned");
  });
});

describe("Order.draft — d'où vient la saisie de l'équipe (Hugo, 2026-11-04)", () => {
  it("sans origine, la commande n'en porte aucune", () => {
    expect(persisted()).toMatchObject({ entryOrigin: null });
  });

  it("fige l'origine du comptoir et celle du commercial", () => {
    for (const origin of ["counter", "commercial"] as const) {
      const order = Order.draft(input(), { supply: "planned" }, origin);
      order.deferPayment();
      expect(order.toPersistence()).toMatchObject({ entryOrigin: origin });
    }
  });

  it("refuse une origine sur une commande que le client a passée lui-même", () => {
    const own = input({ placedByStaffId: null });

    expect(() => Order.draft(own, { supply: "planned" }, "counter")).toThrow(
      EntryOriginWithoutStaffError,
    );
    expect(() => Order.draft(own, { supply: "planned" }, "counter")).toThrow("saisie de l'équipe");
  });

  it("une révision garde l'origine telle quelle", () => {
    const revision = Order.revise(
      placed({ supply: "planned" }, "commercial"),
      input({ lines: [line("VIE-001", 5)] }),
    ).revision;

    expect(revision.state).toMatchObject({ entryOrigin: "commercial" });
  });

  it("une révision d'une commande sans origine n'en invente pas", () => {
    const revision = Order.revise(
      placed({ supply: "planned" }),
      input({ lines: [line("VIE-001", 5)] }),
    ).revision;

    expect(revision.state).toMatchObject({ entryOrigin: null });
  });
});
