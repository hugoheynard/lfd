import type { BillingAddressPayload } from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";

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
});
