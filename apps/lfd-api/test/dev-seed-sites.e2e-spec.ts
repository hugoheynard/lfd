/**
 * E2E du **semis à la norme des sites** (2026-10-14) : chaque retrait porte son
 * site, les deux sites ont leurs couleurs, la journée porte des particuliers
 * aux deux sites et une livraison particulier, et « Tout recharger » retire les
 * retraits d'avant S2, qui n'ont pas de site.
 */
import type { DevSeedReport } from "@lfd/contracts";

import { CLIENT_RAISON_SOCIALE } from "../src/dev/seeding/client.seed.js";
import { FEATURED_SKUS } from "../src/dev/seeding/featured.seed.js";
import { bootstrapE2e, jsonBody, watchSeed, type E2eContext } from "./e2e-harness.js";
import { ADMIN_VERIFIER_OVERRIDE, admin } from "./delivery-rounds-scene.js";
import { seedDriverRole } from "./delivery-driver-scene.js";
import { PAYMENT_GATEWAY_OVERRIDE } from "./dev-scenario-scene.js";
import { ROAD_ROUTING_OVERRIDES } from "./delivery-routing-scene.js";
import { seedWeighedArticles } from "./weighed-catalog-scene.js";

const RELOAD = "/admin/dev/seed/reload";
/** Un rechargement complet sème des dizaines de commandes : cf. `dev-seed-driver.e2e-spec.ts`. */
const TIMEOUT_MS = 240_000;
const DAY_MS = 24 * 60 * 60 * 1000;

let ctx: E2eContext;
let report: DevSeedReport;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, PAYMENT_GATEWAY_OVERRIDE, ...ROAD_ROUTING_OVERRIDES],
  });
  // Surveillé : ce semis s'est figé en CI le 2026-10-26 sans rien dire.
  report = await watchSeed("dev-seed-sites · semis", async () => {
    await ctx.reset();
    // Les saumons au poids que la commande mêlée du scénario commande.
    await seedWeighedArticles(ctx);
    await seedDriverRole(ctx);
    return reload();
  });
}, TIMEOUT_MS);

afterAll(async () => {
  await ctx.close();
});

async function reload(): Promise<DevSeedReport> {
  const response = await admin(ctx).post(RELOAD);
  // Le corps dans l'échec : un refus du semis nomme sa cause, le statut seul non.
  const failure: unknown = response.status === 200 ? null : response.body;
  expect({ status: response.status, failure }).toEqual({ status: 200, failure: null });
  const body = jsonBody<DevSeedReport>(response);
  await ctx.drain();
  return body;
}

function siteIdOf(snapshot: unknown): string | null {
  if (typeof snapshot !== "object" || snapshot === null || !("siteId" in snapshot)) {
    return null;
  }
  return typeof snapshot.siteId === "string" ? snapshot.siteId : null;
}

async function sitesByLabel(): Promise<Map<string, string>> {
  const sites = await ctx.prisma.site.findMany({ select: { id: true, label: true } });
  return new Map(sites.map((site) => [site.label, site.id]));
}

function todayColumn(): Date {
  return new Date(`${report.orders.today}T00:00:00.000Z`);
}

describe("le semis, à la norme des sites", () => {
  it("chaque retrait semé porte son site", async () => {
    const pickups = await ctx.prisma.order.findMany({
      where: { fulfillmentMethod: "pickup" },
      select: { pickupAddress: true },
    });

    expect(pickups.length).toBeGreaterThan(0);
    expect(pickups.filter((order) => siteIdOf(order.pickupAddress) === null)).toEqual([]);
  });

  it("le Labo a ses quatre couleurs, le Village ses deux de retrait et aucune de livraison", async () => {
    const sites = await ctx.prisma.site.findMany({
      select: {
        label: true,
        deliveryDeparture: true,
        pickupColorB2b: true,
        pickupColorB2c: true,
        deliveryColorB2b: true,
        deliveryColorB2c: true,
      },
      orderBy: { label: "asc" },
    });

    expect(sites).toEqual([
      {
        label: "Le Labo",
        deliveryDeparture: true,
        pickupColorB2b: "#f2c200",
        pickupColorB2c: "#f28c28",
        deliveryColorB2b: "#1f6fd1",
        deliveryColorB2c: "#7b4fc9",
      },
      {
        label: "Le Village",
        deliveryDeparture: false,
        pickupColorB2b: "#f2c200",
        pickupColorB2c: "#8a8f98",
        deliveryColorB2b: null,
        deliveryColorB2c: null,
      },
    ]);
  });

  it("la journée porte des retraits particulier aux deux sites, et aucune livraison particulier", async () => {
    const sites = await sitesByLabel();
    const personal = await ctx.prisma.order.findMany({
      where: { requestedDeliveryDate: todayColumn(), clientele: "public" },
      select: { fulfillmentMethod: true, pickupAddress: true, companyId: true },
    });
    const pickupSites = personal
      .filter((order) => order.fulfillmentMethod === "pickup")
      .map((order) => siteIdOf(order.pickupAddress));

    expect(personal.every((order) => order.companyId === null)).toBe(true);
    expect(pickupSites.filter((id) => id === sites.get("Le Labo"))).toHaveLength(2);
    // Trois depuis le 2026-10-19 : le Village ne remet plus qu'aux particuliers
    // (Hugo), ses deux retraits pros du jour sont devenus particuliers.
    expect(pickupSites.filter((id) => id === sites.get("Le Village"))).toHaveLength(3);
    // Hugo, 2026-10-25 : la livraison aux particuliers est FERMÉE en
    // développement — aucune ne doit apparaître dans les commandes du semis.
    expect(personal.filter((order) => order.fulfillmentMethod === "delivery")).toHaveLength(0);
  });

  /** Hugo (2026-10-19) : l'accueil public n'est plus vide après un rechargement. */
  it("la boutique publique porte ses « Incontournables » semés, et eux seuls", async () => {
    const shop = jsonBody<{ items: { sku: string; isFeatured: boolean }[] }>(
      await ctx.http().get("/shop/catalogue").expect(200),
    );
    const featured = shop.items
      .filter((item) => item.isFeatured)
      .map((item) => item.sku)
      .sort();

    expect(featured).toEqual([...FEATURED_SKUS.public].sort());
  });

  it("la mise en avant pro est posée sur ses articles", async () => {
    const pro = await ctx.prisma.catalogItem.findMany({
      where: { isDefault: true, override: { isFeaturedPro: true } },
      select: { productSku: true },
    });

    expect(pro.map((item) => item.productSku).sort()).toEqual([...FEATURED_SKUS.pro].sort());
  });

  /** Décision de Hugo (2026-10-19) : en dev, le Labo est le seul retrait des pros. */
  it("le Village ne remet qu'aux particuliers, et aucun retrait pro n'y est semé", async () => {
    const village = await ctx.prisma.site.findFirstOrThrow({
      where: { label: "Le Village" },
      select: { id: true, pickupForB2b: true, pickupForB2c: true },
    });
    const pros = await ctx.prisma.order.findMany({
      where: { clientele: "pro", fulfillmentMethod: "pickup" },
      select: { pickupAddress: true },
    });

    expect(village).toMatchObject({ pickupForB2b: false, pickupForB2c: true });
    expect(pros.length).toBeGreaterThan(0);
    expect(pros.filter((order) => siteIdOf(order.pickupAddress) === village.id)).toHaveLength(0);
  });

  it("le retrait particulier du Village part dans le transfert du jour", async () => {
    const village = (await sitesByLabel()).get("Le Village");
    const personal = await ctx.prisma.order.findMany({
      where: { requestedDeliveryDate: todayColumn(), clientele: "public" },
      select: { id: true, pickupAddress: true },
    });
    const villageOrder = personal.find((order) => siteIdOf(order.pickupAddress) === village);
    const items = await ctx.prisma.deliveryInternalTransferItem.count({
      where: { orderId: villageOrder?.id ?? "", detachedAt: null },
    });

    expect(items).toBe(1);
  });

  /**
   * Régression : les retraits d'avant S2 n'ont pas de site, et « Tout
   * recharger » les gardait — leur acheteur est membre du client gardé.
   */
  it(
    "« Tout recharger » retire un retrait sans site hors des journées du scénario",
    async () => {
      const victim = await ctx.prisma.order.findFirstOrThrow({
        where: {
          requestedDeliveryDate: todayColumn(),
          clientele: "public",
          fulfillmentMethod: "pickup",
          // L'acheteur du client gardé : la coupe des clients ne l'emporte pas,
          // c'est bien la coupe des retraits sans site qui est éprouvée.
          placedBy: {
            memberships: { some: { company: { raisonSociale: CLIENT_RAISON_SOCIALE } } },
          },
        },
        select: { id: true },
      });
      // Une commande d'avant S2 ne se fabrique plus par le domaine : on retire
      // le site d'une commande semée, et on la sort des journées du scénario.
      await ctx.prisma.order.update({
        where: { id: victim.id },
        data: {
          pickupAddress: { label: "Le Labo", ligne1: "Route de la Balme" },
          requestedDeliveryDate: new Date(todayColumn().getTime() - 10 * DAY_MS),
        },
      });

      const again = await reload();

      expect(again.reset).toMatchObject({ sitelessPickups: 1, sitelessPickupsKept: 0 });
      expect(await ctx.prisma.order.count({ where: { id: victim.id } })).toBe(0);
    },
    TIMEOUT_MS,
  );
});
