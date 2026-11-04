import type { OrderLineInput } from "@lfd/contracts";

import { UnknownSkuError } from "../../../../catalog/domain/errors/unknown-sku.error.js";
import { noSaleOperations } from "../../../../catalog/application/__tests__/sale-operations-doubles.js";
import { FixedLineClassifications } from "../../../domain/ports/__tests__/line-classification-doubles.js";
import { REGISTERED_BUYER } from "../../../domain/value-objects/order-buyer-kind.js";
import { FixedDeliveryVat } from "../../commands/__tests__/fixed-delivery-vat.js";
import { OrderOperations } from "../order-operations.service.js";
import type { OrderParties } from "../order-parties.js";
import { OrderQuoting } from "../order-quoting.service.js";
import {
  PRICED_AT,
  audiencesOf,
  cartAdjustmentsOf,
  catalogItem,
  pricingOf,
  quotingOf,
  type QuotingSetup,
} from "./shop-cart-quoting.doubles.js";

/**
 * **Le devis B chiffre par le chemin de la passation** (plan
 * `documentation/pricing/centime-et-tva/le-prix-d-un-panier.md`, L3) :
 * `loadCart` → `priceBasket` → `draftedAmountsOf`, la trace d'`explain` en
 * habillage. Le devis A sur le même panier sans acheminement est le témoin :
 * deux devis, une seule arithmétique.
 */
const CATALOG = [
  catalogItem("BAN-001", "Banana bread", 1_990_521, 5.5),
  catalogItem("TAS-001", "Tasse", 1_000_333, 20),
];

function orderQuotingOf(setup: QuotingSetup): OrderQuoting {
  return new OrderQuoting(
    pricingOf(setup.catalog, setup.decisions),
    new OrderOperations(noSaleOperations(PRICED_AT)),
    cartAdjustmentsOf(setup),
    audiencesOf(setup),
    new FixedLineClassifications(setup.classified ?? {}),
    new FixedDeliveryVat(setup.deliveryVatMode ?? "standard"),
  );
}

function partiesOf(companyId: string | null): OrderParties {
  return {
    companyId,
    placedByUserId: "user_1",
    placedByStaffId: null,
    buyerKind: REGISTERED_BUYER,
  };
}

function requestOf(sku: string, quantity: number): OrderLineInput {
  return { sku, quantity };
}

const BASKET = [requestOf("BAN-001", 3), requestOf("TAS-001", 2)];

describe("OrderQuoting — le devis du simulateur et du client", () => {
  it("une société (line_ht) : la somme des HT de ligne arrondis, comme la commande", async () => {
    const setup = { catalog: CATALOG, companyStatus: "active" as const };
    const quoted = await orderQuotingOf(setup).quote(partiesOf("co_1"), BASKET);

    // 3 × 19,90521 € = 59,71563 → 59,72 ; 2 × 10,00333 € = 20,00666 → 20,01.
    expect(quoted.subtotalCents).toBe(5_972 + 2_001);
    expect(quoted.lines.map((entry) => entry.line.sku)).toEqual(["BAN-001", "TAS-001"]);
  });

  it("le même sous-total que le devis de la boutique sur le même panier, sans acheminement", async () => {
    for (const companyId of ["co_1", null]) {
      const setup = { catalog: CATALOG, companyStatus: "active" as const };
      const quoted = await orderQuotingOf(setup).quote(partiesOf(companyId), BASKET);
      const { view } = await quotingOf(setup).quote({
        payload: {
          lines: BASKET.map(({ sku, quantity }) => ({ sku, quantity })),
          fulfillment: null,
        },
        companyId,
        buyerUserId: "user_1",
      });

      expect(quoted.subtotalCents).toBe(view.subtotalHtCents);
    }
  });

  it("un particulier (exact_ht) : le HT de la composition TTC, banana bread à 21,00 €", async () => {
    const quoted = await orderQuotingOf({ catalog: CATALOG }).quote(partiesOf(null), [
      requestOf("BAN-001", 1),
    ]);

    expect(quoted.subtotalCents).toBe(1_990);
  });

  it("refuse un SKU inconnu par la tarification, avant tout chargement", async () => {
    await expect(
      orderQuotingOf({ catalog: CATALOG }).quote(partiesOf("co_1"), [requestOf("NOPE", 1)]),
    ).rejects.toBeInstanceOf(UnknownSkuError);
  });
});
