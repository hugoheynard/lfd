/**
 * E2E des **suggestions du panier** (RS2, panier, de
 * `documentation/recommandation-produit/plan-suggestions-du-staff.md`).
 *
 * Ce qu'aucun test unitaire ne prouve : la règle écrite par l'écran du staff
 * et relue par la route publique de la boutique, son déclencheur jugé contre
 * le catalogue servi, et l'article rendu au prix de la vitrine.
 */
import type {
  CartSuggestionView,
  CartSuggestionsPayload,
  ShopCatalogueView,
  StaffSuggestionRulePayload,
} from "@lfd/contracts";
import request from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { E2E_FAMILIES } from "./catalog-fixture.js";
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

/** « Croissant au panier → baguette », de aujourd'hui à dans une semaine. */
function croissantRule(over: Partial<StaffSuggestionRulePayload> = {}): StaffSuggestionRulePayload {
  return {
    trigger: { kind: "product_in_cart", ref: "VIE-001" },
    suggestedSkus: ["PAI-001"],
    placement: "cart",
    audience: "both",
    startsOn: serviceDay(0),
    endsOn: serviceDay(7),
    phrase: { fr: "Avec un croissant, la baguette" },
    priority: 0,
    ...over,
  };
}

async function create(body: StaffSuggestionRulePayload): Promise<string> {
  const response = await ctx.asSub(E2E_STAFF_SUB).post("/admin/suggestions").send(body).expect(201);
  return jsonBody<{ id: string }>(response).id;
}

/** Sans jeton, comme la boutique d'un visiteur. */
async function suggestions(skus: readonly string[]): Promise<readonly CartSuggestionView[]> {
  const payload: CartSuggestionsPayload = { skus: [...skus], target: null };
  const response = await request(ctx.app.getHttpServer())
    .post("/shop/suggestions/cart")
    .send(payload)
    .expect(200);
  return jsonBody<CartSuggestionView[]>(response);
}

describe("les suggestions du panier", () => {
  it("rend l'article décidé, au prix de la vitrine, pour un panier qui déclenche", async () => {
    const id = await create(croissantRule());
    const shelf = jsonBody<ShopCatalogueView>(
      await request(ctx.app.getHttpServer()).get("/shop/catalogue").expect(200),
    );

    const shown = await suggestions(["VIE-001"]);

    expect(shown).toEqual([
      {
        sku: "PAI-001",
        item: shelf.items.find((item) => item.sku === "PAI-001"),
        reason: {
          source: "staff",
          ruleId: id.toLowerCase(),
          phrase: { fr: "Avec un croissant, la baguette" },
        },
      },
    ]);
  });

  it("rien pour un panier qui ne déclenche pas, ni si l'article suggéré y est déjà", async () => {
    await create(croissantRule());

    expect(await suggestions(["CHO-001"])).toEqual([]);
    expect(await suggestions(["VIE-001", "PAI-001"])).toEqual([]);
  });

  it("une famille au panier déclenche par le catalogue servi", async () => {
    await create(
      croissantRule({ trigger: { kind: "category_in_cart", ref: E2E_FAMILIES.VIE.id } }),
    );

    expect((await suggestions(["VIE-001"])).map(({ sku }) => sku)).toEqual(["PAI-001"]);
    expect(await suggestions(["CHO-001"])).toEqual([]);
  });

  it("rien hors période, ni pour la mauvaise audience", async () => {
    await create(croissantRule({ startsOn: serviceDay(1), endsOn: serviceDay(7) }));
    await create(croissantRule({ audience: "pro", suggestedSkus: ["PAT-001"] }));

    expect(await suggestions(["VIE-001"])).toEqual([]);
  });

  it("refuse un panier mal formé, sans rien lire", async () => {
    await request(ctx.app.getHttpServer())
      .post("/shop/suggestions/cart")
      .send({ skus: "VIE-001", target: null })
      .expect(400);
  });
});
