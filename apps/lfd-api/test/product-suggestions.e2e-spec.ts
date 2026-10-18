/**
 * E2E des **suggestions de la fiche** (RS2, fiche, de
 * `documentation/recommandation-produit/plan-suggestions-du-staff.md`).
 *
 * Ce qu'aucun test unitaire ne prouve : la règle « sur la fiche de X → Y »
 * écrite par l'écran du staff, relue par la route publique de la boutique, et
 * l'article rendu au prix de la vitrine — sur X, et sur X seulement.
 */
import type {
  ProductSuggestionView,
  ProductSuggestionsPayload,
  ShopCatalogueView,
  StaffSuggestionRulePayload,
} from "@lfd/contracts";
import request from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { stubAdminVerifier } from "./operations-at-commerce-scene.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** « Sur la fiche de la baguette → le pain au chocolat », de aujourd'hui à dans une semaine. */
function onBaguette(over: Partial<StaffSuggestionRulePayload> = {}): StaffSuggestionRulePayload {
  return {
    trigger: { kind: "product_viewed", ref: "PAI-001" },
    suggestedSkus: ["PAT-001"],
    placement: "product",
    audience: "both",
    startsOn: serviceDay(0),
    endsOn: serviceDay(7),
    phrase: null,
    priority: 0,
    ...over,
  };
}

async function create(body: StaffSuggestionRulePayload): Promise<string> {
  const response = await ctx.asSub(E2E_STAFF_SUB).post("/admin/suggestions").send(body).expect(201);
  return jsonBody<{ id: string }>(response).id;
}

/** Sans jeton, comme la boutique d'un visiteur. */
async function suggestions(
  sku: string,
  skus: readonly string[] = [],
): Promise<readonly ProductSuggestionView[]> {
  const payload: ProductSuggestionsPayload = { sku, skus: [...skus], target: null };
  const response = await request(ctx.app.getHttpServer())
    .post("/shop/suggestions/product")
    .send(payload)
    .expect(200);
  return jsonBody<ProductSuggestionView[]>(response);
}

describe("les suggestions de la fiche", () => {
  it("rend l'article décidé sur la fiche de X, au prix de la vitrine, et rien sur Z", async () => {
    const id = await create(onBaguette());
    const shelf = jsonBody<ShopCatalogueView>(
      await request(ctx.app.getHttpServer()).get("/shop/catalogue").expect(200),
    );

    expect(await suggestions("PAI-001")).toEqual([
      {
        sku: "PAT-001",
        item: shelf.items.find((item) => item.sku === "PAT-001"),
        reason: { source: "staff", ruleId: id.toLowerCase(), phrase: null },
      },
    ]);
    expect(await suggestions("CHO-001")).toEqual([]);
  });

  it("une règle du panier ne s'affiche pas sur la fiche, ni l'article déjà au panier", async () => {
    await create(
      onBaguette({ trigger: { kind: "product_in_cart", ref: "PAI-001" }, placement: "cart" }),
    );
    expect(await suggestions("PAI-001", ["PAI-001"])).toEqual([]);

    await create(onBaguette());
    expect(await suggestions("PAI-001", ["PAT-001"])).toEqual([]);
  });

  it("refuse une fiche sans SKU, sans rien lire", async () => {
    await request(ctx.app.getHttpServer())
      .post("/shop/suggestions/product")
      .send({ skus: [], target: null })
      .expect(400);
  });
});
