import type { ShopCatalogueView } from "@lfd/contracts";
import request from "supertest";

import { deliverAsFacts } from "./catalog-facts-delivery.js";
import { snapshotOf } from "./catalog-ingest-fixtures.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

/**
 * **La limite propre d'un article, sur la vitrine** (Hugo, 2026-10-21 —
 * `documentation/commandes/architecture-heure-limite-de-commande.md` §9) : la
 * limite que le référentiel descend avec l'article ne paraît que si elle est
 * plus stricte que la règle générale de la boutique, et jamais sa grâce.
 *
 * Traversé de bout en bout : le fait des règles du référentiel, la descente
 * au miroir, la table des heures limites et son interrupteur, la route.
 */
let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await ctx.prisma.catalogPriceHistory.deleteMany();
  await ctx.prisma.catalogItem.deleteMany();
  await ctx.prisma.catalogCategory.deleteMany();
  await ctx.prisma.orderCutoff.deleteMany();
});

const BUCHE = "BUC-001";
const TART = "TAR-001";
const BREAD = "PAI-001";

/** Trois articles : deux jours avant à 12 h, la veille à 18 h, et le jour même à 9 h. */
function pushWithLimits(): Promise<void> {
  return deliverAsFacts(
    ctx,
    snapshotOf(
      [
        { sku: BUCHE, priceMillicents: 300_000 },
        { sku: TART, priceMillicents: 200_000 },
        { sku: BREAD, priceMillicents: 100_000 },
      ],
      [
        {
          scope: { type: "product", id: `prd_${BUCHE}` },
          daysBefore: 2,
          time: "12:00",
          graceMinutes: 30,
        },
        {
          scope: { type: "variant", id: `var_${TART}` },
          daysBefore: 1,
          time: "18:00",
          graceMinutes: null,
        },
        {
          scope: { type: "product", id: `prd_${BREAD}` },
          daysBefore: 0,
          time: "09:00",
          graceMinutes: null,
        },
      ],
    ),
  );
}

async function generalRule(): Promise<void> {
  await ctx.prisma.orderCutoff.create({
    data: { pickupAddressId: null, weekday: null, daysBefore: 1, time: "23:00", graceMinutes: 0 },
  });
}

async function limits(): Promise<ReadonlyMap<string, unknown>> {
  const response = await request(ctx.app.getHttpServer()).get("/shop/catalogue");
  const body = response.body as ShopCatalogueView;
  return new Map(body.items.map((item) => [item.sku, item.orderTimeLimit ?? null]));
}

describe("la limite propre d'un article sur la vitrine", () => {
  it("ne sert que les limites plus strictes que la veille à 23 h, sans la grâce", async () => {
    await generalRule();
    await pushWithLimits();

    const shown = await limits();

    expect(shown.get(BUCHE)).toEqual({ daysBefore: 2, time: "12:00" });
    expect(shown.get(TART)).toEqual({ daysBefore: 1, time: "18:00" });
    expect(shown.get(BREAD)).toBeNull();
  });

  it("🔴 la clé reste ABSENTE du fil pour un article qui suit la règle générale", async () => {
    await generalRule();
    await pushWithLimits();

    const response = await request(ctx.app.getHttpServer()).get("/shop/catalogue");
    const bread = (response.body as ShopCatalogueView).items.find((item) => item.sku === BREAD);

    expect(Object.keys(bread ?? {})).not.toContain("orderTimeLimit");
  });

  it("aucune règle générale : toute limite d'article se montre", async () => {
    await pushWithLimits();

    expect((await limits()).get(BREAD)).toEqual({ daysBefore: 0, time: "09:00" });
  });
});
