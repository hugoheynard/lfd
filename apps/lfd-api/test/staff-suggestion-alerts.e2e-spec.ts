/**
 * E2E des **alertes des suggestions décidées** (RS10 de
 * `documentation/recommandation-produit/suggestions-du-staff.md`).
 *
 * Ce qu'aucun test unitaire ne prouve : une règle saine à l'écriture, dont
 * l'article est ENSUITE masqué par le vrai paramétrage du catalogue, est
 * signalée par la vraie lecture — avec la cause lue en base — et la route est
 * fermée à qui n'a pas le droit.
 */
import type {
  CatalogAdminItemView,
  StaffSuggestionAlertsView,
  StaffSuggestionRulePayload,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { staffWith, stubAdminVerifier } from "./operations-at-commerce-scene.js";

const ALERTS = "/admin/suggestions/alerts";

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

/** « Partout, à l'accueil, la baguette » — aux particuliers, cette semaine. */
function baguetteRule(): StaffSuggestionRulePayload {
  return {
    trigger: { kind: "everywhere", ref: null },
    suggestedSkus: ["PAI-001"],
    placement: "home",
    audience: "public",
    startsOn: serviceDay(0),
    endsOn: serviceDay(7),
    phrase: null,
    priority: 0,
  };
}

async function create(body: StaffSuggestionRulePayload): Promise<string> {
  const response = await ctx.asSub(E2E_STAFF_SUB).post("/admin/suggestions").send(body).expect(201);
  return jsonBody<{ id: string }>(response).id;
}

async function alerts(): Promise<StaffSuggestionAlertsView> {
  return jsonBody<StaffSuggestionAlertsView>(
    await ctx.asSub(E2E_STAFF_SUB).get(ALERTS).expect(200),
  );
}

/** Masque aux particuliers chaque déclinaison du produit, par la route du paramétrage. */
async function hideFromPublic(productSku: string): Promise<void> {
  const items = jsonBody<CatalogAdminItemView[]>(
    await ctx.asSub(E2E_STAFF_SUB).get("/admin/catalog").expect(200),
  );
  const variants = items.filter((item) => item.productSku === productSku);
  expect(variants.length).toBeGreaterThan(0);
  for (const variant of variants) {
    await ctx
      .asSub(E2E_STAFF_SUB)
      .put(`/admin/catalog/${variant.sku}/masking`)
      .send({ audience: "public", hidden: true })
      .expect(204);
  }
}

describe("les alertes des suggestions décidées", () => {
  it("une règle saine n'est pas signalée ; son article masqué ensuite, elle l'est — vide", async () => {
    const id = await create(baguetteRule());
    expect((await alerts()).rules).toEqual([]);

    await hideFromPublic("PAI-001");

    const view = await alerts();
    expect(view.today).toBe(serviceDay(0));
    expect(view.rules).toEqual([
      {
        ruleId: id,
        severity: "empty",
        triggerWithdrawn: false,
        items: [{ sku: "PAI-001", audience: "public", reason: "hidden_for_audience" }],
        window: { from: serviceDay(0), to: serviceDay(7), capped: false },
      },
    ]);
  });

  it("une règle archivée n'est jamais signalée", async () => {
    const id = await create(baguetteRule());
    await hideFromPublic("PAI-001");
    await ctx.asSub(E2E_STAFF_SUB).put(`/admin/suggestions/${id}/archive`).expect(200);

    expect((await alerts()).rules).toEqual([]);
  });

  it("s'ouvre à qui lit les suggestions, et à lui seul", async () => {
    const outsider = await staffWith(ctx, "sans-suggestions", [
      { resource: "b2b_orders", action: "read" },
    ]);
    const reader = await staffWith(ctx, "lecteur-suggestions", [
      { resource: "lfc_suggestions", action: "read" },
    ]);
    await ctx.asSub(outsider).get(ALERTS).expect(403);
    await ctx.asSub(reader).get(ALERTS).expect(200);
  });
});
