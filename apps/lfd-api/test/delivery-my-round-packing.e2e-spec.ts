/**
 * E2E de **« Ma tournée » qui suit le colisage, et du chargement par le
 * livreur** (`documentation/livraisons/parcours-du-livreur.md`, PL4 et PL1).
 *
 * - la fiche de chaque arrêt : les produits de la commande, SANS un champ
 *   d'argent alors que la base en porte ;
 * - l'avancement : un bac déclaré, une commande prête ;
 * - la version de « ma tournée » : elle bouge sur un bac déclaré (journal de
 *   la livraison, par le nouveau déclencheur de `delivery_bin`) et sur une
 *   commande prête (journal du commerce, par son port) ;
 * - le chargement de SA tournée : le scan charge le bac ; la tournée d'un
 *   autre est un 404, en lecture comme en geste.
 *
 * ⚠️ « Prête » est posée en écrivant le statut de la commande (`ready`), comme
 * le fait la projection du commerce à l'événement du fournil : la commande de
 * la scène est semée en Prisma (dette des factories du commerce, `factories.ts`),
 * sans ligne de production à colisser.
 */
import type {
  DayVersionView,
  DeliveryLoadingPlanView,
  DeliveryLoadingRoundView,
  MyDeliveryRoundView,
} from "@lfd/contracts";

import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import {
  ADMIN_VERIFIER_OVERRIDE,
  addVehicle,
  admin,
  assign,
  forgetCustomer,
  openRound,
  roundOf,
  ROUNDS,
} from "./delivery-rounds-scene.js";
import { declareBins, loadingOf } from "./delivery-loading-scene.js";
import { forgetRoutingScene, seedLocatedDelivery } from "./delivery-routing-scene.js";
import { MY_ROUND, seedDriverRole, staffWithRole } from "./delivery-driver-scene.js";

const DAY = serviceDay();
const POINT = { lat: 45.6, lng: 6.1 };
/** Ce qui ne doit JAMAIS apparaître dans la vue du livreur. */
const MONEY = /cents|price|total|amount|prix|montant|vat|tva/iu;

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  forgetCustomer();
  forgetRoutingScene();
  await seedDriverRole(ctx);
});

/** Une tournée de deux arrêts situés, affectée à `staffUserId`. */
async function myRoundOfTwo(staffUserId: string): Promise<{
  readonly roundId: string;
  readonly orders: readonly [string, string];
}> {
  const roundId = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
  const first = await seedLocatedDelivery(ctx, DAY, POINT);
  const second = await seedLocatedDelivery(ctx, DAY, POINT);
  await assign(ctx, DAY, roundId, first);
  await assign(ctx, DAY, roundId, second);
  const { version } = await roundOf(ctx, DAY, roundId);
  await admin(ctx).put(`${ROUNDS}/${roundId}/livreur`).send({ staffUserId, version }).expect(204);
  return { roundId, orders: [first, second] };
}

/** Une ligne de commande, AVEC ses prix — c'est ce que la fiche ne doit pas laisser passer. */
async function addLine(orderId: string, sku: string, name: string, quantity: number) {
  await ctx.prisma.orderLine.create({
    data: {
      orderId,
      sku,
      productNameSnapshot: name,
      quantity,
      unitPriceMillicents: 123_000,
      lineTotalCents: 1230 * quantity,
      unitPriceTtcCents: 1300,
      lineTotalTtcCents: 1300 * quantity,
    },
  });
}

async function view(agent: ReturnType<E2eContext["asSub"]>, roundId: string) {
  return jsonBody<MyDeliveryRoundView>(await agent.get(`${MY_ROUND}/${roundId}`).expect(200));
}

async function versionOf(agent: ReturnType<E2eContext["asSub"]>): Promise<number> {
  return jsonBody<DayVersionView>(await agent.get(`${MY_ROUND}/version?date=${DAY}`).expect(200))
    .version;
}

describe("la fiche de l'arrêt et l'avancement du colisage (PL4)", () => {
  it("porte les produits, SANS un champ d'argent alors que la base en a", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, orders } = await myRoundOfTwo(paul.id);
    await addLine(orders[0], "VIE-001", "Croissant", 6);
    await addLine(orders[0], "PAI-002", "Pain", 4);

    const mine = await view(paul.agent, roundId);

    // L'ordre suit l'identifiant des lignes : on compare l'ensemble.
    expect([...(mine.stops[0]?.sheet ?? [])].sort((a, b) => a.sku.localeCompare(b.sku))).toEqual([
      { sku: "PAI-002", name: "Pain", quantity: 4, requiresCold: false },
      { sku: "VIE-001", name: "Croissant", quantity: 6, requiresCold: false },
    ]);
    expect(mine.stops[1]?.sheet).toEqual([]);
    expect(JSON.stringify(mine)).not.toMatch(MONEY);
  });

  it("suit une déclaration de bac et une commande prête — « 1 arrêt prêt sur 2 »", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, orders } = await myRoundOfTwo(paul.id);

    const before = await view(paul.agent, roundId);
    expect(before.stops.map((stop) => [stop.packing, stop.binsDeclared])).toEqual([
      ["in_progress", 0],
      ["in_progress", 0],
    ]);
    expect({ ready: before.readyStops, of: before.stopCount }).toEqual({ ready: 0, of: 2 });

    await declareBins(ctx, orders[0], 2);
    await ctx.prisma.order.update({ where: { id: orders[0] }, data: { status: "ready" } });

    const after = await view(paul.agent, roundId);
    expect(after.stops.map((stop) => [stop.packing, stop.binsDeclared])).toEqual([
      ["ready", 2],
      ["in_progress", 0],
    ]);
    expect({ ready: after.readyStops, of: after.stopCount }).toEqual({ ready: 1, of: 2 });
  });
});

describe("la version de « ma tournée » (PL4)", () => {
  it("bouge sur un bac déclaré, puis sur une commande prête — et pas sans rien", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { orders } = await myRoundOfTwo(paul.id);

    const start = await versionOf(paul.agent);
    expect(await versionOf(paul.agent)).toBe(start);

    await declareBins(ctx, orders[0], 1);
    const afterBin = await versionOf(paul.agent);
    expect(afterBin).toBeGreaterThan(start);

    await ctx.prisma.order.update({ where: { id: orders[1] }, data: { status: "ready" } });
    expect(await versionOf(paul.agent)).toBeGreaterThan(afterBin);
  });

  it("un bac annulé fait bouger la journée de son arrêt aussi", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { orders } = await myRoundOfTwo(paul.id);
    const [binId] = await declareBins(ctx, orders[0], 1);
    const before = await versionOf(paul.agent);

    await admin(ctx)
      .post(`/admin/livraison/colisage/bacs/${binId ?? ""}/annulation`)
      .expect(204);

    expect(await versionOf(paul.agent)).toBeGreaterThan(before);
  });

  it("refuse sans le droit de conduire", async () => {
    const counter = await staffWithRole(ctx, "vendeur", "comptoir", "comptoir");
    await counter.agent.get(`${MY_ROUND}/version?date=${DAY}`).expect(403);
  });
});

describe("charger depuis « Ma tournée » (PL1)", () => {
  it("le livreur lit le scan et le plan de SA tournée — les vues de l'écran de chargement", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, orders } = await myRoundOfTwo(paul.id);
    await declareBins(ctx, orders[0], 1);

    const loading = jsonBody<DeliveryLoadingRoundView>(
      await paul.agent.get(`${MY_ROUND}/${roundId}/chargement`).expect(200),
    );
    expect(loading).toEqual(await loadingOf(ctx, roundId));
    const plan = jsonBody<DeliveryLoadingPlanView>(
      await paul.agent.get(`${MY_ROUND}/${roundId}/chargement/plan`).expect(200),
    );
    expect(plan).toEqual(
      jsonBody<DeliveryLoadingPlanView>(
        await admin(ctx).get(`/admin/livraison/chargement/${roundId}/plan`).expect(200),
      ),
    );
  });

  it("le scan du livreur charge le bac, à son nom ; décharger le reprend", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId, orders } = await myRoundOfTwo(paul.id);
    const [binId] = await declareBins(ctx, orders[0], 1);

    await paul.agent.post(`${MY_ROUND}/${roundId}/chargement/bacs`).send({ binId }).expect(204);

    const load = await ctx.prisma.deliveryBinLoad.findFirstOrThrow({
      where: { binId: binId ?? "" },
      select: { loadedBy: true, loadedVia: true },
    });
    expect(load).toEqual({ loadedBy: paul.id, loadedVia: "scan" });

    await paul.agent
      .post(`${MY_ROUND}/${roundId}/chargement/bacs/${binId ?? ""}/dechargement`)
      .expect(204);
    const unloaded = await ctx.prisma.deliveryBinLoad.findFirstOrThrow({
      where: { binId: binId ?? "" },
      select: { loadedAt: true },
    });
    expect(unloaded.loadedAt).toBeNull();
  });

  it("🔴 la tournée d'un autre : 404 au scan, au plan et au chargement, rien n'est chargé", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const lea = await staffWithRole(ctx, "livreur-lea");
    const { roundId, orders } = await myRoundOfTwo(paul.id);
    const [binId] = await declareBins(ctx, orders[0], 1);

    await lea.agent.get(`${MY_ROUND}/${roundId}/chargement`).expect(404);
    await lea.agent.get(`${MY_ROUND}/${roundId}/chargement/plan`).expect(404);
    await lea.agent.post(`${MY_ROUND}/${roundId}/chargement/bacs`).send({ binId }).expect(404);

    expect(await ctx.prisma.deliveryBinLoad.count({ where: { loadedAt: { not: null } } })).toBe(0);
  });

  it("le livreur sans le droit du chargeur n'ouvre pas l'écran de chargement de l'admin", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const { roundId } = await myRoundOfTwo(paul.id);

    await paul.agent.get(`/admin/livraison/chargement/${roundId}`).expect(403);
  });
});
