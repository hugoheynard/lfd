/**
 * E2E de **la grille de prix d'un public** (`documentation/pricing/plan-export-grille-de-prix.md`,
 * § 5) : la parité avec le rayon — le prix après les remises du prix affiché
 * est celui que la vitrine sert au même public, le même jour —, la liste des
 * promotions qui remplit le panneau, et le fichier (BOM, point-virgule, nom).
 *
 * Les dates sont relatives à maintenant (`daysAgo`) : aucune n'est écrite en dur.
 */
import { CustomerRole } from "../src/platform/database/client/client.js";
import { lineTotalCents, pieces } from "@lfd/money";
import type {
  PriceGridExportPayload,
  PriceGridPromotionsView,
  ShopCatalogueView,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { posePromotion, promotionTerms, seedPickupPoint } from "./promotion-fixtures.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
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

const MEMBER = "auth0|membre-grille";
const PICKUP = "pk_grille";
const BOM = "﻿";

let companyId = "";

const staff = () => ctx.asSub("staff-e2e");

beforeEach(async () => {
  await ctx.reset();
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  const company = await createCompany(ctx.prisma);
  await attachTo(ctx.prisma, member.id, company.id, CustomerRole.orders);
  companyId = company.id;
  await seedPickupPoint(ctx, PICKUP);
  // −10 % au prix affiché, pour tous : la parité doit le porter.
  await posePromotion(
    staff(),
    promotionTerms({ internalName: "Automne", effect: { kind: "percent_off", value: 1_000 } }),
  );
});

function exportGrid(payload: Partial<PriceGridExportPayload>) {
  return staff()
    .post("/admin/pricing/price-grid/export")
    .send({
      audience: { kind: "individuals_guest" },
      day: null,
      fulfillment: { method: "pickup", pickupId: PICKUP },
      basketPromotions: [],
      pricePerKg: false,
      ...payload,
    });
}

/** La colonne « Prix affiché » de chaque SKU, en centimes. */
function displayedBySku(csv: string): ReadonlyMap<string, number> {
  // L'en-tête, une ligne vide, la ligne des titres, puis les articles.
  const lines = csv.split("\r\n");
  const data = lines.slice(lines.indexOf("") + 2).filter((line) => line !== "");
  return new Map(
    data.map((line) => {
      const cells = line.split(";");
      const sku = (cells[3] ?? "").replace(/"/gu, "");
      const [whole = "0", cents = "0"] = (cells[6] ?? "").split(",");
      return [sku, Number(whole) * 100 + Number(cents)];
    }),
  );
}

describe("la grille et le rayon disent le même prix", () => {
  it("un particulier sans compte : le TTC de la vitrine publique, article par article", async () => {
    const response = await exportGrid({}).expect(200);
    const shelf = jsonBody<ShopCatalogueView>(await ctx.http().get("/shop/catalogue").expect(200));

    const grid = displayedBySku(response.text);
    expect(shelf.items.length).toBeGreaterThan(0);
    expect(grid.size).toBe(shelf.items.length);
    for (const item of shelf.items) {
      expect([item.sku, grid.get(item.sku)]).toEqual([item.sku, item.unitPriceTtcCents]);
    }
  });

  it("une société : le HT de son rayon reconnu, article par article", async () => {
    const response = await exportGrid({ audience: { kind: "company", companyId } }).expect(200);
    const shelf = jsonBody<ShopCatalogueView>(
      await ctx.asSub(MEMBER).get("/shop/catalogue/mine").expect(200),
    );

    const grid = displayedBySku(response.text);
    const orderable = shelf.items.filter((item) => item.orderable !== false);
    expect(grid.size).toBe(orderable.length);
    for (const item of orderable) {
      expect([item.sku, grid.get(item.sku)]).toEqual([
        item.sku,
        lineTotalCents(item.unitPriceMillicents, pieces(1)),
      ]);
    }
  });
});

describe("le fichier", () => {
  it("UTF-8 avec BOM, point-virgule, nommé grille-<public>-<date>.csv", async () => {
    const response = await exportGrid({}).expect(200);

    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toMatch(
      /grille-particuliers-sans-compte-\d{4}-\d{2}-\d{2}\.csv/u,
    );
    expect(response.text.startsWith(BOM)).toBe(true);
    expect(response.text).toContain("Document indicatif, non contractuel.");
    expect(response.text).toContain("Retrait — Cœur de station");
  });
});

describe("les promotions du panneau", () => {
  it("se lisent selon l'acheminement, et une remise retenue prend sa colonne", async () => {
    const basketId = await posePromotion(
      staff(),
      promotionTerms({
        internalName: "Retrait",
        label: { fr: "Retrait −20 %", en: null, it: null },
        effect: { kind: "percent_off", value: 2_000 },
        fulfillment: { kind: "basket", pickup: "all", delivery: "none" },
      }),
    );
    const question = {
      audience: { kind: "individuals_guest" },
      day: null,
      fulfillment: { method: "pickup", pickupId: PICKUP },
    };

    const view = jsonBody<PriceGridPromotionsView>(
      await staff().post("/admin/pricing/price-grid/promotions").send(question).expect(200),
    );
    expect(view.basis).toBe("ttc");
    expect(view.basket.map((promotion) => promotion.id)).toEqual([basketId]);
    expect(view.displayedPrice).toHaveLength(1);

    const response = await exportGrid({
      basketPromotions: [{ promotionId: basketId, part: "column" }],
    }).expect(200);
    expect(response.text).toContain('"Retrait −20 % (remise au panier)"');
    expect(response.text).toContain('"20 %"');
  });
});
