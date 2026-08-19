/**
 * E2E du **garde-fou de parité** — sur les deux vraies bases.
 *
 * Ce qu'aucun test unitaire ne prouverait : que la comparaison lit bien le
 * référentiel d'un côté et le miroir de l'autre, à travers leurs deux clients
 * Prisma. C'est exactement le point où la fusion des processus se voit — deux
 * bases, un seul appel, aucun réseau.
 */
import { B2bCatalogFeedPreview } from "../src/pim/channels/b2b-platform/products/feed-preview.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CheckCatalogParityService } from "../src/b2b/catalog/application/check-catalog-parity.service.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

/** Le référentiel doublé : ce qu'il publierait, posé test par test. */
class StubFeed extends B2bCatalogFeedPreview {
  products: { sku: string; name: string; priceCents: number }[] = [];

  preview(generatedAt: string) {
    return Promise.resolve({
      candidates: this.products.length,
      excluded: [],
      snapshot: {
        version: 1 as const,
        generatedAt,
        categories: [],
        products: this.products.map((variant) => ({
          id: `prd_${variant.sku}`,
          sku: variant.sku.replace(/-\d+$/, ""),
          name: variant.name,
          categoryId: "cat_vien",
          kind: "daily" as const,
          variants: [
            {
              sku: variant.sku,
              name: variant.name,
              priceCents: variant.priceCents,
              weightGrams: null,
              isDefault: true,
              position: 0,
            },
          ],
        })),
      },
    });
  }
}

const feed = new StubFeed();
let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: B2bCatalogFeedPreview, value: feed },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  feed.products = [];
});

/** Le miroir tel que la boutique le lit, réduit aux SKU semés par le harnais. */
async function mirrorOf(skus: readonly string[]) {
  const items = await ctx.prisma.catalogItem.findMany({ where: { sku: { in: [...skus] } } });
  return items.map((item) => ({ sku: item.sku, name: item.name, priceCents: item.priceCents }));
}

describe("le miroir face à sa source", () => {
  it("ne signale rien quand les deux disent la même chose", async () => {
    const [seeded] = await mirrorOf(["VIE-001-1"]);
    if (seeded === undefined) {
      throw new Error("le harnais doit semer VIE-001-1");
    }
    feed.products = [seeded];

    const report = await ctx.app.get(CheckCatalogParityService).check();

    expect(report.priceGaps).toEqual([]);
    expect(report.missing).toEqual([]);
  });

  it("voit un prix qui a bougé côté référentiel sans être repoussé", async () => {
    const [seeded] = await mirrorOf(["VIE-001-1"]);
    if (seeded === undefined) {
      throw new Error("le harnais doit semer VIE-001-1");
    }
    feed.products = [{ ...seeded, priceCents: seeded.priceCents + 25 }];

    const report = await ctx.app.get(CheckCatalogParityService).check();

    expect(report.priceGaps).toContainEqual({
      sku: "VIE-001-1",
      reference: seeded.priceCents + 25,
      mirror: seeded.priceCents,
    });
    expect(report.inSync).toBe(false);
  });

  /**
   * Le cas qui fait vendre ce qu'on ne vend plus : le référentiel ne publie
   * rien, la boutique continue son commerce.
   */
  it("voit ce que la boutique vend encore alors que le référentiel l'a retiré", async () => {
    const report = await ctx.app.get(CheckCatalogParityService).check();

    expect(report.stale).toContain("VIE-001-1");
    expect(report.inSync).toBe(false);
  });

  it("se lit par la route staff du catalogue", async () => {
    const response = await ctx.http().get("/admin/catalog/parity").set("Authorization", "Bearer s");

    expect(response.status).toBe(200);
    expect(jsonBody<{ inSync: boolean }>(response)).toHaveProperty("inSync");
  });

  it("refuse un appel anonyme — c'est l'état du catalogue vendu", async () => {
    const response = await ctx.http().get("/admin/catalog/parity");

    expect(response.status).toBe(401);
  });
});
