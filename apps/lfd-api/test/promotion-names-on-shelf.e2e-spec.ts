/**
 * E2E — **le nom d'une baisse au rayon** (règle de Hugo, 2026-11-02 ;
 * `documentation/promotions/promotions.md`, « Ce que voit le client »), sur le
 * vrai Postgres :
 *
 * 1. un particulier lit le libellé Particuliers de la promotion « dans le prix
 *    affiché » qui a baissé le prix ;
 * 2. un pro lit le libellé Pros de la même promotion ;
 * 3. une mercuriale seule baisse le prix SANS nom : la clé est absente.
 *
 * Les fenêtres sont relatives (`daysAgo`) : elles sont jugées à l'horloge.
 */
import type { ShopCatalogueView, ShopItemView } from "@lfd/contracts";

import { CustomerRole } from "../src/platform/database/client/client.js";
import { PricingMaterialsCache } from "../src/lafoliecoffee/pricing/infrastructure/pricing-materials.cache.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

const MEMBER = "auth0|noms-pro";
/** VIE-001-1 vaut 2,00 € dans le catalogue qui facture (`seedE2eCatalog`). */
const SKU = "VIE-001-1";
const CANONICAL_MILLICENTS = 200_000;
const NEGOTIATED_MILLICENTS = 150_000;

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let ctx: E2eContext;
let companyId = "";

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
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  const company = await createCompany(ctx.prisma);
  await attachTo(ctx.prisma, member.id, company.id, CustomerRole.orders);
  companyId = company.id;
  await ctx.prisma.$executeRawUnsafe("SELECT public.bascule_des_promotions()");
  ctx.app.get(PricingMaterialsCache).invalidate();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** « −20 % pour tout le monde, dans le prix affiché », nommée par audience. */
async function poseNamedPromotion(): Promise<void> {
  await staff()
    .post("/admin/promotions")
    .send({
      internalName: "Folie Coffee",
      label: { fr: "Offre Folie Coffee", en: null, it: null },
      audienceLabels: {
        individuals: { fr: "Folie Coffee −20 %", en: null, it: null },
        pros: { fr: "Remise pro Folie Coffee", en: "Folie Coffee trade discount", it: null },
      },
      reason: null,
      effect: { kind: "percent_off", value: 2_000 },
      ownFloor: null,
      validFrom: daysAgo(1),
      validTo: null,
      audiences: [{ kind: "everyone", companyId: null }],
      fulfillment: { kind: "displayed_price" },
      scope: { mode: "all_except", rules: [] },
      conditions: [],
    })
    .expect(201);
  ctx.app.get(PricingMaterialsCache).invalidate();
}

async function poseMercuriale(): Promise<void> {
  await staff()
    .post(`/admin/pricing/companies/${companyId}/mercuriale`)
    .set(INTENT_KEY, freshIntent())
    .send({
      label: "Mercuriale Café Dupont",
      validFrom: daysAgo(1),
      // Dans trente jours : `daysAgo` d'un nombre négatif.
      validTo: daysAgo(-30),
      lines: [{ sku: SKU, unitPriceMillicents: NEGOTIATED_MILLICENTS }],
    })
    .expect(201);
  ctx.app.get(PricingMaterialsCache).invalidate();
}

function itemOf(view: ShopCatalogueView): ShopItemView | undefined {
  return view.items.find((item) => item.sku === SKU);
}

async function publicShelf(language = "fr"): Promise<ShopItemView | undefined> {
  return itemOf(
    jsonBody<ShopCatalogueView>(
      await ctx.http().get("/shop/catalogue").query({ lang: language }).expect(200),
    ),
  );
}

/** Le rayon reconnu ne prend pas de langue (vérifié le 2026-11-02) : il sert le français. */
async function proShelf(): Promise<ShopItemView | undefined> {
  return itemOf(
    jsonBody<ShopCatalogueView>(await ctx.asSub(MEMBER).get("/shop/catalogue/mine").expect(200)),
  );
}

describe("le nom des promotions du prix affiché, au rayon", () => {
  it("un particulier lit le libellé Particuliers", async () => {
    await poseNamedPromotion();

    const item = await publicShelf();

    expect(item?.catalogPriceMillicents).toBeDefined();
    expect(item?.promotionNames).toEqual(["Folie Coffee −20 %"]);
  });

  it("un pro lit le libellé Pros", async () => {
    await poseNamedPromotion();

    const item = await proShelf();

    expect(item?.catalogPriceMillicents).toBe(CANONICAL_MILLICENTS);
    expect(item?.promotionNames).toEqual(["Remise pro Folie Coffee"]);
  });

  it("🔴 une mercuriale seule baisse le prix SANS nom", async () => {
    await poseMercuriale();

    const item = await proShelf();

    expect(item?.unitPriceMillicents).toBe(NEGOTIATED_MILLICENTS);
    expect(item?.catalogPriceMillicents).toBe(CANONICAL_MILLICENTS);
    expect(item).not.toHaveProperty("promotionNames");
  });
});
