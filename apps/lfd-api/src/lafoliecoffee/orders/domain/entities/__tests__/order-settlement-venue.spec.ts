import type { BillingAddressPayload } from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";

import {
  ShopTillOrderNotPickupError,
  ShopTillOrderShapeError,
} from "../../errors/shop-till-order-errors.js";
import { Order } from "../order.js";
import { draftFrom, type DraftSpec } from "./priced-input.fixture.js";

/**
 * **Le lieu de règlement** (plan
 * `documentation/commandes/passation/plan-commande-particulier-reglee-en-boutique.md`,
 * § 4.1) : `shop_till` ne naît que d'une passation au comptoir pour un
 * particulier. Aucune des passations existantes ne le pose — une commande
 * réglée chez nous (carte) ou au compte garde un lieu `null`, et c'est ce que
 * la base reçoit.
 */

const SHOP: BillingAddressPayload = {
  label: "Boutique",
  ligne1: "1 place du Village",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

const PERSONAL: DraftSpec = {
  companyId: null,
  billedCompanyId: null,
  principal: null,
  placedByStaffId: null,
  buyerKind: "registered",
  agreed: {
    window: { value: null, source: "default" },
    contact: { value: null, source: "default" },
    signatureRequired: { value: false, source: "default" },
  },
  placedByUserId: "usr_1",
  fulfillment: {
    method: "pickup",
    deliveryZoneId: null,
    deliveryAddress: null,
    deliveryAddressId: null,
    pickupAddress: SHOP,
  },
  requestedDeliveryDate: null,
  note: "",
  catalogVersionId: null,
  lines: [
    {
      sku: "VIE-001",
      productName: "Croissant",
      unitPriceMillicents: millicentsFromCents(200),
      vatRate: 5.5,
      saleUnit: "piece",
      quantity: 2,
    },
  ],
  voucher: null,
  salesTerms: { document: "salesTerms", revision: null, fileId: null },
  locale: null,
};

describe("Order — le lieu de règlement", () => {
  it("une commande payée par carte n'a pas de lieu hors de chez nous", () => {
    const order = Order.draft(draftFrom(PERSONAL));
    order.payByCard("pi_1");

    expect(order.settlementVenue).toBeNull();
    expect(order.toPersistence().settlementVenue).toBeNull();
  });

  it("une commande au compte non plus", () => {
    const order = Order.draft(draftFrom(PERSONAL, { companyId: "co_1", billedCompanyId: "co_1" }));
    order.deferPayment();

    expect(order.toPersistence().settlementVenue).toBeNull();
  });

  describe("settleAtShopTill — la commande d'un particulier notée au comptoir", () => {
    const AT_COUNTER = { placedByStaffId: "stf_1" } as const;

    it("pose not_required et le lieu shop_till, sans intention de paiement", () => {
      const order = Order.draft(draftFrom(PERSONAL, AT_COUNTER), undefined, "counter");
      order.settleAtShopTill();

      const state = order.toPersistence();
      expect(state.paymentStatus).toBe("not_required");
      expect(state.settlementVenue).toBe("shop_till");
      expect(state.stripePaymentIntentId).toBeNull();
      expect(order.settlementVenue).toBe("shop_till");
    });

    it("refuse une commande d'une société", () => {
      const order = Order.draft(
        draftFrom(PERSONAL, { ...AT_COUNTER, companyId: "co_1", billedCompanyId: "co_1" }),
        undefined,
        "counter",
      );
      expect(() => order.settleAtShopTill()).toThrow(ShopTillOrderShapeError);
    });

    it("refuse une saisie de l'équipe qui ne vient pas du comptoir", () => {
      const order = Order.draft(draftFrom(PERSONAL, AT_COUNTER));
      expect(() => order.settleAtShopTill()).toThrow(ShopTillOrderShapeError);
    });

    it("refuse une commande passée par le client lui-même", () => {
      const order = Order.draft(draftFrom(PERSONAL));
      expect(() => order.settleAtShopTill()).toThrow(ShopTillOrderShapeError);
    });

    it("refuse un règlement déjà décidé : le lieu ne se pose qu'à la passation", () => {
      const order = Order.draft(draftFrom(PERSONAL, AT_COUNTER), undefined, "counter");
      order.deferPayment();
      expect(() => order.settleAtShopTill()).toThrow(ShopTillOrderShapeError);
    });

    it("refuse une livraison", () => {
      const order = Order.draft(
        draftFrom(PERSONAL, {
          ...AT_COUNTER,
          fulfillment: {
            method: "delivery",
            deliveryZoneId: "zone_1",
            deliveryAddress: SHOP,
            deliveryAddressId: null,
            pickupAddress: null,
          },
        }),
        undefined,
        "counter",
      );
      expect(() => order.settleAtShopTill()).toThrow(ShopTillOrderNotPickupError);
    });
  });
});
