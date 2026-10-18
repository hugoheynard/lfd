/**
 * E2E de l'**aperçu des suggestions décidées** (RS5 de
 * `documentation/recommandation-produit/suggestions-du-staff.md`).
 *
 * Ce qu'aucun test unitaire ne prouve : la règle écrite par l'écran, relue
 * par l'aperçu à travers le vrai catalogue servi et la vraie vitrine, au même
 * prix que la route de la boutique — et la route fermée à qui n'a pas le droit.
 */
import type {
  CartSuggestionView,
  StaffSuggestionPreviewPayload,
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
import { staffWith, stubAdminVerifier } from "./operations-at-commerce-scene.js";

const PREVIEW = "/admin/suggestions/preview";

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
function croissantRule(): StaffSuggestionRulePayload {
  return {
    trigger: { kind: "product_in_cart", ref: "VIE-001" },
    suggestedSkus: ["PAI-001"],
    placement: "cart",
    audience: "both",
    startsOn: serviceDay(0),
    endsOn: serviceDay(7),
    phrase: { fr: "Avec un croissant, la baguette" },
    priority: 0,
  };
}

async function create(body: StaffSuggestionRulePayload): Promise<string> {
  const response = await ctx.asSub(E2E_STAFF_SUB).post("/admin/suggestions").send(body).expect(201);
  return jsonBody<{ id: string }>(response).id;
}

function cartPreview(day: string | null): StaffSuggestionPreviewPayload {
  return { placement: "cart", skus: ["VIE-001"], audience: "public", day, pickupAddressId: null };
}

async function preview(body: StaffSuggestionPreviewPayload): Promise<StaffSuggestionPreviewView> {
  const response = await ctx.asSub(E2E_STAFF_SUB).post(PREVIEW).send(body).expect(200);
  return jsonBody<StaffSuggestionPreviewView>(response);
}

describe("l'aperçu des suggestions décidées", () => {
  it("au panier, rend la carte de la boutique et « affichée » pour la règle", async () => {
    const id = await create(croissantRule());
    const shop = jsonBody<CartSuggestionView[]>(
      await request(ctx.app.getHttpServer())
        .post("/shop/suggestions/cart")
        .send({ skus: ["VIE-001"], target: { date: serviceDay(1), pickupAddressId: null } })
        .expect(200),
    );

    const view = await preview(cartPreview(serviceDay(1)));

    expect(view.shown).toEqual(shop);
    expect(view.shown.map(({ sku }) => sku)).toEqual(["PAI-001"]);
    expect(view.rules).toEqual([
      {
        ruleId: id,
        status: "shown",
        outrankedBy: null,
        items: [{ sku: "PAI-001", status: "shown", outrankedBy: null }],
      },
    ]);
  });

  it("un jour après la fin de la règle : rien d'affiché, et « ended »", async () => {
    const id = await create(croissantRule());

    const view = await preview(cartPreview(serviceDay(10)));

    expect(view.day).toBe(serviceDay(10));
    expect(view.shown).toEqual([]);
    expect(view.rules).toEqual([{ ruleId: id, status: "ended", outrankedBy: null, items: [] }]);
  });

  it("s'ouvre à qui lit les suggestions, et à lui seul", async () => {
    const outsider = await staffWith(ctx, "sans-suggestions", [
      { resource: "b2b_orders", action: "read" },
    ]);
    const reader = await staffWith(ctx, "lecteur-suggestions", [
      { resource: "lfc_suggestions", action: "read" },
    ]);
    await ctx.asSub(outsider).post(PREVIEW).send(cartPreview(null)).expect(403);
    await ctx.asSub(reader).post(PREVIEW).send(cartPreview(null)).expect(200);
  });
});
