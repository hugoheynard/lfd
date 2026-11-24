import { NEGOTIATED_SCOPE_ERRORS } from "@lfd/contracts";

import { UnknownSkuError } from "../../../../catalog/domain/errors/unknown-sku.error.js";
import { OutsideNegotiatedScopeError } from "../../../domain/errors/outside-negotiated-scope.error.js";
import { RecordingNegotiatedScope } from "./negotiated-scope.doubles.js";
import { catalogItem, pricingOf } from "./shop-cart-quoting.doubles.js";

/**
 * **Le tarif convenu** (plan `plan-clients-publics-chorus.md`, § 6 sexies,
 * QD8) : un payeur sur devis de période ne commande que ce que sa mercuriale
 * active cite au jour de livraison — refusé au chiffrage des lignes, que
 * partagent passation, saisie de l'équipe et lignes nouvelles d'une révision.
 */

const CATALOG = [
  catalogItem("VIE-001", "Croissant", 150_000, 5.5),
  catalogItem("PAI-002", "Baguette tradition", 120_000, 5.5),
];

const ON_QUOTE_PAYER = "co_payer";
const DAY = "2026-12-03";

function scope(): RecordingNegotiatedScope {
  return new RecordingNegotiatedScope(new Map([[ON_QUOTE_PAYER, ["VIE-001"]]]));
}

function served(payerCompanyId: string | null, minimumsWaived = false) {
  return {
    companyId: "co_site",
    buyerKind: "registered",
    minimumsWaived,
    negotiated: { payerCompanyId, day: DAY },
  } as const;
}

describe("OrderLinePricing — le tarif convenu", () => {
  it("accepte un article cité, et demande au port le payeur et le jour de livraison", async () => {
    const negotiated = scope();

    const lines = await pricingOf(CATALOG, {}, { scope: negotiated }).resolve(
      [{ sku: "VIE-001", quantity: 2 }],
      served(ON_QUOTE_PAYER),
      "checkout",
    );

    expect(lines.map((entry) => entry.line.sku)).toEqual(["VIE-001"]);
    expect(negotiated.asked).toEqual([{ payerCompanyId: ON_QUOTE_PAYER, day: DAY }]);
  });

  it("refuse un article non cité, en le nommant par son libellé (409)", async () => {
    const refusal = pricingOf(CATALOG, {}, { scope: scope() }).resolve(
      [
        { sku: "VIE-001", quantity: 2 },
        { sku: "PAI-002", quantity: 1 },
      ],
      served(ON_QUOTE_PAYER),
      "checkout",
    );

    await expect(refusal).rejects.toBeInstanceOf(OutsideNegotiatedScopeError);
    await expect(refusal).rejects.toMatchObject({
      code: NEGOTIATED_SCOPE_ERRORS.outsideScope,
      category: "business",
      sku: "PAI-002",
      message: expect.stringContaining(
        "Cet article n'est pas dans le tarif convenu avec votre service : Baguette tradition",
      ) as string,
    });
  });

  it("refuse aussi quand l'équipe saisit : les minimums levés ne lèvent pas le tarif convenu", async () => {
    await expect(
      pricingOf(CATALOG, {}, { scope: scope() }).resolve(
        [{ sku: "PAI-002", quantity: 1 }],
        served(ON_QUOTE_PAYER, true),
        "checkout",
      ),
    ).rejects.toBeInstanceOf(OutsideNegotiatedScopeError);
  });

  it("ne borne pas un payeur hors devis de période", async () => {
    const lines = await pricingOf(CATALOG, {}, { scope: scope() }).resolve(
      [{ sku: "PAI-002", quantity: 1 }],
      served("co_at_order"),
      "checkout",
    );

    expect(lines.map((entry) => entry.line.sku)).toEqual(["PAI-002"]);
  });

  it("ne demande rien au port sans payeur, ni sans question (un devis)", async () => {
    const negotiated = scope();
    const pricing = pricingOf(CATALOG, {}, { scope: negotiated });

    await pricing.resolve([{ sku: "PAI-002", quantity: 1 }], served(null), "checkout");
    await pricing.explain(
      [{ sku: "PAI-002", quantity: 1 }],
      { companyId: "co_site", buyerKind: "registered" },
      "cart",
    );

    expect(negotiated.asked).toEqual([]);
  });

  it("un payeur sur devis sans rien de convenu ne commande rien", async () => {
    const nothing = new RecordingNegotiatedScope(new Map([[ON_QUOTE_PAYER, []]]));

    await expect(
      pricingOf(CATALOG, {}, { scope: nothing }).resolve(
        [{ sku: "VIE-001", quantity: 1 }],
        served(ON_QUOTE_PAYER),
        "checkout",
      ),
    ).rejects.toBeInstanceOf(OutsideNegotiatedScopeError);
  });

  it("un SKU inconnu reste un article inconnu, pas un article hors tarif", async () => {
    await expect(
      pricingOf(CATALOG, {}, { scope: scope() }).resolve(
        [{ sku: "XXX-999", quantity: 1 }],
        served(ON_QUOTE_PAYER),
        "checkout",
      ),
    ).rejects.toBeInstanceOf(UnknownSkuError);
  });
});
