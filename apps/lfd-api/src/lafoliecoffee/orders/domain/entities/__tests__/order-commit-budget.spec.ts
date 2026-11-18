import type { BillingAddressPayload } from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";

import {
  BudgetCommitmentNumberRequiredError,
  PrivatePayerBudgetCommitmentError,
} from "../../errors/budget-commitment-errors.js";
import { PRIVATE_PAYER, type PayerCommitmentTerms } from "../../services/budget-commitment-rule.js";
import type { OrderLineInput } from "../../value-objects/order-line.js";
import { Order, type DraftOrderInput } from "../order.js";
import type { PricedDraftInput } from "../order-priced-draft.js";
import { draftFrom } from "./priced-input.fixture.js";

/**
 * **L'engagement budgétaire jugé à la passation, pas dans `draft`** (E2′) :
 * l'estimation de la saisie compose par `draft` et lit `amounts()` ; un
 * devis sans numéro garde ses totaux, et la passation refuse ensuite. Les
 * jours ne sont comparés qu'entre eux.
 */

const SHOP: BillingAddressPayload = {
  label: "Caserne",
  ligne1: "1 place d'Armes",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

const PICKUP: DraftOrderInput["fulfillment"] = {
  method: "pickup",
  deliveryZoneId: null,
  deliveryAddress: null,
  deliveryAddressId: null,
  pickupAddress: { ...SHOP, siteId: "site_village" },
};

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

function input(): PricedDraftInput {
  return draftFrom({
    companyId: "co_army",
    billedCompanyId: "co_army",
    principal: null,
    placedByStaffId: null,
    buyerKind: "registered",
    agreed: {
      window: { value: null, source: "default" },
      contact: { value: null, source: "default" },
      signatureRequired: { value: false, source: "default" },
    },
    placedByUserId: "usr_1",
    fulfillment: PICKUP,
    requestedDeliveryDate: new Date("2026-11-10T00:00:00.000Z"),
    note: "",
    catalogVersionId: null,
    lines: [line("VIE-001", 3, 200, 5.5)],
    promotions: [],
    lateFee: null,
    voucher: null,
    salesTerms: { document: "salesTermsPro", revision: null, fileId: null },
    locale: null,
  });
}

const ARMY: PayerCommitmentTerms = {
  kind: "public",
  commitmentRequired: true,
  serviceCodeRequired: true,
  defaultServiceCode: "SERV-RH",
};

describe("Order.commitBudget — l'engagement à la passation (E2′)", () => {
  it("un devis sans numéro garde ses totaux : `draft` ne juge pas l'engagement", () => {
    const quoted = Order.draft(input()).amounts();
    const placed = Order.draft(input());

    expect(() => {
      placed.commitBudget(null, ARMY);
    }).toThrow(BudgetCommitmentNumberRequiredError);
    expect(placed.amounts()).toEqual(quoted);
  });

  it("le numéro saisi et le code par défaut de la fiche sont écrits avec la commande", () => {
    const order = Order.draft(input());
    order.commitBudget({ number: " 1300012345 ", serviceCode: "" }, ARMY);
    order.deferPayment();

    expect(order.toPersistence()).toMatchObject({
      budgetCommitmentNumber: "1300012345",
      budgetCommitmentServiceCode: "SERV-RH",
    });
  });

  it("une commande privée n'écrit rien, et refuse un numéro envoyé", () => {
    const order = Order.draft(input());
    order.commitBudget(null, PRIVATE_PAYER);
    order.deferPayment();

    expect(order.toPersistence()).toMatchObject({
      budgetCommitmentNumber: null,
      budgetCommitmentServiceCode: null,
    });
    expect(() => {
      Order.draft(input()).commitBudget({ number: "X", serviceCode: "" }, PRIVATE_PAYER);
    }).toThrow(PrivatePayerBudgetCommitmentError);
  });
});
