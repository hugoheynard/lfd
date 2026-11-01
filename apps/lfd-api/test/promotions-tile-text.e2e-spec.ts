/**
 * E2E du texte d'une promotion sur les vignettes
 * (`documentation/promotions/plan-texte-de-la-vignette.md`, § 3), sur le vrai
 * Postgres : le texte réglé au back-office traverse la colonne et revient au
 * rayon dans la langue demandée ; vide, la valeur seule ; une promotion
 * « inscrits » ne se dit pas à un invité, texte ou non.
 *
 * Les fenêtres sont relatives (`daysAgo`) : elles sont jugées à l'horloge.
 */
import type { PromotionTermsPayload, PromotionView, ShopCatalogueView } from "@lfd/contracts";

import { PricingMaterialsCache } from "../src/b2b/pricing/infrastructure/pricing-materials.cache.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";

const REGISTERED = "auth0|vignette-inscrit";
const SKU = "VIE-001-1";
const TWENTY = { kind: "percent", basisPoints: 2_000 };
const COFFEE = { fr: "−20 % client Folie Coffee", en: "−20% Folie Coffee guests", it: null };

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

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
  await createUser(ctx.prisma, { auth0Sub: REGISTERED });
  // Un point ouvert aux deux clientèles : sans lui, « tout retrait » ne se
  // dit à personne — le rayon ne cite qu'un retrait que le lecteur peut choisir.
  await ctx
    .asSub(E2E_STAFF_SUB)
    .post("/admin/pickup-addresses")
    .send({
      label: "Le Labo",
      ligne1: "5 rue du Four",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      discounts: { b2b: null, b2c: null },
    })
    .expect(201);
  await ctx.prisma.$executeRawUnsafe("SELECT public.bascule_des_promotions()");
  ctx.app.get(PricingMaterialsCache).invalidate();
});

async function pose(over: Partial<PromotionTermsPayload>): Promise<string> {
  const created = jsonBody<{ id: string }>(
    await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/promotions")
      .send({
        internalName: "Folie Coffee",
        label: { fr: "−20 % Folie Coffee", en: null, it: null },
        reason: null,
        effect: { kind: "percent_off", value: 2_000 },
        ownFloor: null,
        validFrom: daysAgo(1),
        validTo: null,
        audiences: [{ kind: "everyone", companyId: null }],
        fulfillment: { kind: "basket", pickup: "all", delivery: "none" },
        scope: { mode: "all_except", rules: [] },
        conditions: [],
        ...over,
      })
      .expect(201),
  );
  ctx.app.get(PricingMaterialsCache).invalidate();
  return created.id;
}

async function offersOn(path: string, sub: string | null = null) {
  const agent = sub === null ? ctx.http() : ctx.asSub(sub);
  const view = jsonBody<ShopCatalogueView>(await agent.get(path).expect(200));
  return view.items.find((entry) => entry.sku === SKU)?.fulfillmentOffers;
}

describe("le texte d'une promotion sur la vignette", () => {
  it("un texte réglé est relu par l'admin et servi au rayon, dans la langue demandée", async () => {
    const id = await pose({ tileText: { fr: ` ${COFFEE.fr} `, en: COFFEE.en, it: "" } });

    const read = jsonBody<PromotionView>(
      await ctx.asSub(E2E_STAFF_SUB).get(`/admin/promotions/${id}`).expect(200),
    );
    expect(read.tileText).toEqual(COFFEE);
    expect(await offersOn("/shop/catalogue")).toEqual([{ effect: TWENTY, text: COFFEE.fr }]);
    expect(await offersOn("/shop/catalogue?lang=en")).toEqual([
      { effect: TWENTY, text: COFFEE.en },
    ]);
    // L'italien n'est pas traduit : repli sur le français.
    expect(await offersOn("/shop/catalogue?lang=it")).toEqual([
      { effect: TWENTY, text: COFFEE.fr },
    ]);
  });

  it("sans texte, la valeur seule — et jamais l'acheminement", async () => {
    await pose({});

    expect(await offersOn("/shop/catalogue")).toEqual([{ effect: TWENTY }]);
  });

  it("une promotion « inscrits » ne se dit pas à l'invité, mais à l'inscrit", async () => {
    await pose({
      audiences: [{ kind: "individuals_registered", companyId: null }],
      tileText: COFFEE,
    });

    expect(await offersOn("/shop/catalogue")).toBeUndefined();
    expect(await offersOn("/shop/catalogue/mine", REGISTERED)).toEqual([
      { effect: TWENTY, text: COFFEE.fr },
    ]);
  });

  it("une traduction sans français est refusée, en le nommant", async () => {
    const refused = await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/promotions")
      .send({
        internalName: "Sans français",
        label: { fr: "−20 %", en: null, it: null },
        tileText: { fr: "", en: "−20%", it: null },
        reason: null,
        effect: { kind: "percent_off", value: 2_000 },
        ownFloor: null,
        validFrom: daysAgo(1),
        validTo: null,
        audiences: [{ kind: "everyone", companyId: null }],
        fulfillment: { kind: "basket", pickup: "all", delivery: "none" },
        scope: { mode: "all_except", rules: [] },
        conditions: [],
      })
      .expect(400);
    expect(JSON.stringify(refused.body)).toContain("promotions.tile_text_without_french");
  });
});
