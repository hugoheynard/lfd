/**
 * E2E des **suggestions de l'accueil** (RS7, `documentation/recommandation-produit/suggestions-du-staff.md`).
 *
 * Ce qu'aucun test unitaire ne prouve : une règle « partout, à l'accueil »
 * écrite par l'écran du staff, relue par la route publique de la boutique,
 * sur deux places, sans ce qui est au panier — et absente hors de sa période.
 * L'aperçu du staff (RS5) accepte désormais l'accueil.
 */
import type {
  HomeSuggestionView,
  HomeSuggestionsPayload,
  ShopCatalogueView,
  StaffSuggestionPreviewView,
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

/** « Partout, à l'accueil → trois articles », de aujourd'hui à dans une semaine. */
function atHome(over: Partial<StaffSuggestionRulePayload> = {}): StaffSuggestionRulePayload {
  return {
    trigger: { kind: "everywhere", ref: null },
    suggestedSkus: ["PAT-001", "PAI-001", "CHO-001"],
    placement: "home",
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
async function suggestions(skus: readonly string[] = []): Promise<readonly HomeSuggestionView[]> {
  const payload: HomeSuggestionsPayload = { skus: [...skus], target: null };
  const response = await request(ctx.app.getHttpServer())
    .post("/shop/suggestions/home")
    .send(payload)
    .expect(200);
  return jsonBody<HomeSuggestionView[]>(response);
}

describe("les suggestions de l'accueil", () => {
  it("rend les deux premiers articles décidés, au prix de la vitrine", async () => {
    const id = await create(atHome());
    const shelf = jsonBody<ShopCatalogueView>(
      await request(ctx.app.getHttpServer()).get("/shop/catalogue").expect(200),
    );

    expect(await suggestions()).toEqual(
      ["PAT-001", "PAI-001"].map((sku) => ({
        sku,
        item: shelf.items.find((item) => item.sku === sku),
        reason: { source: "staff", ruleId: id.toLowerCase(), phrase: null },
      })),
    );
    expect((await suggestions(["PAT-001"])).map(({ sku }) => sku)).toEqual(["PAI-001", "CHO-001"]);
  });

  it("rien hors de la période, ni d'une règle du panier", async () => {
    await create(atHome({ startsOn: serviceDay(1), endsOn: serviceDay(7) }));
    await create(atHome({ placement: "cart" }));

    expect(await suggestions()).toEqual([]);
  });

  it("l'aperçu du staff juge l'accueil", async () => {
    const id = await create(atHome());

    const response = await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/suggestions/preview")
      .send({ placement: "home", skus: [], audience: "public", day: null, pickupAddressId: null })
      .expect(200);
    const view = jsonBody<StaffSuggestionPreviewView>(response);

    expect(view.shown.map(({ sku }) => sku)).toEqual(["PAT-001", "PAI-001"]);
    expect(view.rules.map(({ ruleId, status }) => [ruleId, status])).toEqual([[id, "shown"]]);
  });
});
