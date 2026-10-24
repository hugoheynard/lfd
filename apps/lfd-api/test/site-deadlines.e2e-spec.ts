/**
 * E2E de **l'échéance selon le site** (lots S2 et T0 des sites — doc
 * `documentation/sites/sites.md` §7, plan
 * `documentation/livraisons/transferts/plan-transfert-interne.md` §7).
 *
 * Ce que seul le vrai SQL prouve : le `siteId` relu du snapshot JSON de la
 * commande, les sites relus avec leurs créneaux, le départ des tournées résolu
 * par la livraison, et la colonne `production_order.site_id` figée à l'arrêt.
 *
 * Une frontière doublée en plus de la signature staff : le calcul routier.
 * OSRM n'est pas lancé en e2e ; un trajet fixe de 25 minutes le remplace, au
 * port que la livraison publie (`RoadTravelTimeReader`).
 */
import type { GpsPoint, ProductionDueThresholdsView } from "@lfd/contracts";

import { RoadTravelTimeReader } from "../src/delivery/channels/commerce/index.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { DayOrdersReader, ServiceDay } from "../src/production/channels/commerce/index.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { cardGatewayDouble, payByCard, placeOrder } from "./order-factory.js";

const TRAVEL_MINUTES = 25;
const DAY = serviceDay();

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

/** Le calcul routier doublé : une durée fixe, et chaque trajet demandé noté. */
class FixedRoad extends RoadTravelTimeReader {
  readonly asked: { readonly from: GpsPoint; readonly to: GpsPoint }[] = [];

  minutesBetween(from: GpsPoint, to: GpsPoint): Promise<number | null> {
    this.asked.push({ from, to });
    return Promise.resolve(TRAVEL_MINUTES);
  }
}

const road = new FixedRoad();
let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: RoadTravelTimeReader, value: road },
      { token: PaymentGateway, value: cardGatewayDouble("pi_echeance") },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  road.asked.length = 0;
  await ctx.reset();
});

const FOURNIL_GPS = { lat: 45.448, lng: 6.98 };
const VILLAGE_GPS = { lat: 45.5, lng: 6.9 };
const ADDRESS = {
  ligne1: "1 rue du Four",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

/** Le fournil (défaut, livre, départ des tournées), le village (transfert), un comptoir. */
async function seedSites(): Promise<{ village: string; fournil: string; counter: string }> {
  const fournil = await ctx.prisma.site.create({
    data: {
      label: "Le Labo",
      ...ADDRESS,
      isDefault: true,
      deliveryDeparture: true,
      gps: FOURNIL_GPS,
    },
  });
  const village = await ctx.prisma.site.create({
    data: {
      label: "Val Village",
      ...ADDRESS,
      supply: "transfer",
      counterSetupMinutes: 10,
      gps: VILLAGE_GPS,
      opening: { publicOpening: null, proPickup: { start: "07:30", end: "09:00" } },
    },
  });
  const counter = await ctx.prisma.site.create({ data: { label: "Comptoir", ...ADDRESS } });
  return { village: village.id, fournil: fournil.id, counter: counter.id };
}

/** Les SKU du catalogue de test, un par commande : la vue se lit par ligne. */
const VIL = "VIE-001";
const CPT = "VIE-002";
const OLD = "VIE-003";

/**
 * Un retrait pro réglé, pour le jour, avec un créneau 08:00–09:00 et une
 * ligne d'un SKU — passé par le vrai chemin (`placeOrder`, plan T). Rend son
 * numéro. Pro, et dans l'ouverture pro du village : le vrai chemin refuse un
 * particulier au village (pas d'ouverture publique) et une tranche qui
 * déborde de 07:30–09:00 — la fixture d'avant le plan T semait les deux.
 */
async function seedPickup(sku: string, siteId: string, buyer: Buyer): Promise<string> {
  const order = await placeOrder(ctx, {
    buyerUserId: buyer.userId,
    companyId: buyer.companyId,
    settlement: "card",
    forDay: DAY,
    window: { start: "08:00", end: "09:00" },
    fulfillment: { method: "pickup", pickupSiteId: siteId },
    lines: [{ sku, quantity: 3 }],
  });
  await payByCard(ctx, order);
  return order.orderNumber;
}

/**
 * Une commande d'avant S2 : le snapshot du point de retrait sans `siteId`.
 * La passation le pose toujours désormais ; aucune route ne produit plus cet
 * état, il est donc retiré après coup (plan T, 2026-10-25).
 */
async function forgetPickupSite(orderNumber: string): Promise<void> {
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { orderNumber },
    select: { id: true, pickupAddress: true },
  });
  const snapshot = row.pickupAddress;
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new TypeError(`la commande ${orderNumber} n'a pas de point de retrait`);
  }
  const { siteId: _siteId, ...beforeS2 } = snapshot;
  await ctx.prisma.order.update({ where: { id: row.id }, data: { pickupAddress: beforeS2 } });
}

interface Buyer {
  readonly userId: string;
  readonly companyId: string;
}

interface SeededDay {
  readonly village: string;
  readonly fournil: string;
  readonly counter: string;
  /** Le SKU de chaque commande, par numéro — l'arrêt du plan ne garde que le numéro. */
  readonly skuOf: ReadonlyMap<string, string>;
}

/** Trois commandes : le village, le comptoir sur place, et une d'avant S2 (sans `siteId`). */
async function seedDay(): Promise<SeededDay> {
  const sites = await seedSites();
  const user = await createUser(ctx.prisma, { auth0Sub: "auth0|client", email: "c@col.fr" });
  const company = await createCompany(ctx.prisma, { enseigne: "Hôtel du Col" });
  await attachTo(ctx.prisma, user.id, company.id);
  const buyer = { userId: user.id, companyId: company.id };
  const village = await seedPickup(VIL, sites.village, buyer);
  const counter = await seedPickup(CPT, sites.counter, buyer);
  // Avant S2 : le libellé seul. Même nom que le village — on ne rattrape pas par libellé.
  const old = await seedPickup(OLD, sites.village, buyer);
  await forgetPickupSite(old);
  await ctx
    .asSub(E2E_STAFF_SUB)
    .patch("/admin/delivery-availability")
    .send({ deliveryMarginMinutes: 50, pickupMarginMinutes: 20 })
    .expect(204);
  return {
    ...sites,
    skuOf: new Map([
      [village, VIL],
      [counter, CPT],
      [old, OLD],
    ]),
  };
}

function firstBefore(view: ProductionDueThresholdsView, sku: string): string | null | undefined {
  return view.lines.find((line) => line.sku === sku)?.thresholds[0]?.before;
}

describe("l'échéance du fournil selon le site (T0)", () => {
  it("cale le village sur le départ du transfert, et laisse le reste à l'ancien calcul", async () => {
    await seedDay();

    const view = jsonBody<ProductionDueThresholdsView>(
      await ctx
        .asSub(E2E_STAFF_SUB)
        .get(`/admin/production/batch/${DAY}/due-thresholds`)
        .expect(200),
    );

    // 07:30 (pros) − 10 min de mise en place − 25 min de route = 06:55 ; − 50 = 06:05.
    expect(firstBefore(view, VIL)).toBe("06:05");
    // Sur place, mise en place 0 : 08:00 − 20 = 07:40, comme avant les sites.
    expect(firstBefore(view, CPT)).toBe("07:40");
    // Sans `siteId` : l'ancien calcul, malgré le libellé du village.
    expect(firstBefore(view, OLD)).toBe("07:40");
    expect(road.asked).toEqual([{ from: FOURNIL_GPS, to: VILLAGE_GPS }]);
  });

  it("remet au fournil l'heure à destination : l'arrivée au village, la fenêtre ailleurs", async () => {
    const sites = await seedDay();

    const orders = await ctx.app.get(DayOrdersReader).producibleFor(ServiceDay.of(DAY));
    const bySku = new Map(
      orders.map((order) => [
        order.lines[0]?.sku ?? "",
        { dueAt: order.dueAt, siteId: order.siteId },
      ]),
    );

    expect(Object.fromEntries(bySku)).toEqual({
      [VIL]: { dueAt: "07:20", siteId: sites.village },
      [CPT]: { dueAt: "08:00", siteId: sites.counter },
      [OLD]: { dueAt: "08:00", siteId: null },
    });
  });

  it("fige le site sur le bon du fournil à l'arrêt du plan", async () => {
    const sites = await seedDay();

    await ctx.asSub(E2E_STAFF_SUB).post(`/admin/production/batch/${DAY}/close`).expect(201);

    const rows = await ctx.prisma.productionOrder.findMany({
      where: { serviceDay: DAY },
      select: { reference: true, siteId: true, dueAt: true },
    });
    const bySku = rows
      .map((row) => [sites.skuOf.get(row.reference), row.siteId, row.dueAt])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    expect(bySku).toEqual([
      [VIL, sites.village, "07:20"],
      [CPT, sites.counter, "08:00"],
      [OLD, null, "08:00"],
    ]);
  });

  /**
   * Régression : le compte à rebours lisait le périmètre du plan (`placed`) ;
   * l'arrêt confirme les commandes, et la section « Échéances » du dossier du
   * jour se vidait au moment où le fournil travaillait (fix 2026-10-24).
   */
  it("après l'arrêt du plan, les seuils du jour ne sont pas vides", async () => {
    await seedDay();
    const staff = ctx.asSub(E2E_STAFF_SUB);
    const before = jsonBody<ProductionDueThresholdsView>(
      await staff.get(`/admin/production/batch/${DAY}/due-thresholds`).expect(200),
    );

    await staff.post(`/admin/production/batch/${DAY}/close`).expect(201);
    await ctx.drain();
    // L'arrêt a confirmé les commandes : c'est l'état qui vidait les seuils.
    const statuses = await ctx.prisma.order.findMany({ select: { status: true } });
    expect(statuses.map((order) => order.status)).toEqual(["confirmed", "confirmed", "confirmed"]);

    const after = jsonBody<ProductionDueThresholdsView>(
      await ctx
        .asSub(E2E_STAFF_SUB)
        .get(`/admin/production/batch/${DAY}/due-thresholds`)
        .expect(200),
    );
    expect(after.lines.length).toBeGreaterThan(0);
    expect(after).toEqual(before);
  });
});
