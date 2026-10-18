/**
 * E2E des **suggestions du panier** (RS2, panier, de
 * `documentation/recommandation-produit/suggestions-du-staff.md`).
 *
 * Ce qu'aucun test unitaire ne prouve : la règle écrite par l'écran du staff
 * et relue par la route publique de la boutique, son déclencheur jugé contre
 * le catalogue servi, et l'article rendu au prix de la vitrine.
 */
import {
  instantToLocal,
  NO_STAFF_SUGGESTION_CONDITIONS,
  type CreatedPickupResponse,
  type StaffSuggestionConditions,
  type CartSuggestionView,
  type CartSuggestionsPayload,
  type ShopCatalogueView,
  type StaffSuggestionRulePayload,
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

/** Une règle « croissant → baguette » avec ces seules conditions (RS8). */
function withConditions(over: Partial<StaffSuggestionConditions>): StaffSuggestionRulePayload {
  return croissantRule({ conditions: { ...NO_STAFF_SUGGESTION_CONDITIONS, ...over } });
}

/** Le panier, avec son jour visé (point de retrait, ou livraison) et son total lu. */
async function suggestionsFor(
  target: CartSuggestionsPayload["target"],
  cartTotalCents?: number,
): Promise<readonly string[]> {
  const payload: CartSuggestionsPayload = {
    skus: ["VIE-001"],
    target,
    ...(cartTotalCents === undefined ? {} : { cartTotalCents }),
  };
  const response = await request(ctx.app.getHttpServer())
    .post("/shop/suggestions/cart")
    .send(payload)
    .expect(200);
  return jsonBody<CartSuggestionView[]>(response).map(({ sku }) => sku);
}

async function seedPoint(label: string): Promise<string> {
  const response = await ctx
    .asSub(E2E_STAFF_SUB)
    .post("/admin/pickup-addresses")
    .send({
      label,
      ligne1: "5 rue du Four",
      ligne2: "",
      codePostal: "75002",
      ville: "Paris",
      pays: "France",
      isDefault: false,
    })
    .expect(201);
  return jsonBody<CreatedPickupResponse>(response).id;
}

/**
 * Une plage d'heures qui NE contient PAS l'heure de Paris du moment, à une
 * heure au moins de distance : l'autre moitié de la journée.
 */
function hoursAwayFromNow(): { readonly from: string; readonly to: string } {
  const hour = Number(instantToLocal(new Date()).time.slice(0, 2));
  return hour < 12 ? { from: "13:00", to: "23:00" } : { from: "01:00", to: "11:00" };
}

describe("les suggestions du panier — les conditions (RS8)", () => {
  it("une règle hors de sa plage horaire ne s'affiche pas", async () => {
    await create(withConditions({ hours: hoursAwayFromNow() }));

    expect(await suggestions(["VIE-001"])).toEqual([]);
  });

  it("le seuil : atteint par le total lu, jamais sans total", async () => {
    await create(withConditions({ minCartTotalCents: 2_000 }));

    expect(await suggestionsFor(null)).toEqual([]);
    expect(await suggestionsFor(null, 1_999)).toEqual([]);
    expect(await suggestionsFor(null, 2_000)).toEqual(["PAI-001"]);
  });

  it("sans cette famille : un croissant au panier écarte la règle « sans viennoiserie »", async () => {
    await create(withConditions({ cartWithoutFamilyId: E2E_FAMILIES.VIE.id }));

    expect(await suggestions(["VIE-001"])).toEqual([]);
  });

  it("le point de retrait : ni avant le choix, ni en livraison, ni à un autre point", async () => {
    const centre = await seedPoint("Centre");
    const gare = await seedPoint("Gare");
    await create(withConditions({ pickupAddressIds: [centre] }));
    const day = serviceDay(1);

    expect(await suggestionsFor(null)).toEqual([]);
    expect(await suggestionsFor({ date: day, pickupAddressId: null })).toEqual([]);
    expect(await suggestionsFor({ date: day, pickupAddressId: gare })).toEqual([]);
    expect(await suggestionsFor({ date: day, pickupAddressId: centre })).toEqual(["PAI-001"]);
  });
});
