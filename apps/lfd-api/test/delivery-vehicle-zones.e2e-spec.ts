/**
 * E2E des **zones autorisées d'un véhicule**
 * (`documentation/livraisons/tournees/composition-automatique.md` §4, 2026-10-06).
 *
 * Ce que seul l'e2e prouve : la colonne tableau aller-retour et sa charge au
 * journal relue en base ; la zone FIGÉE d'une commande (`delivery_zone_id`)
 * lue à travers le canal du commerce jusqu'au calcul ; et l'étiquette « hors
 * zone » d'un arrêt glissé à la main, qui ne défait rien.
 */
import type { CreatedIdResponse, VehiclesView } from "@lfd/contracts";
import { checkJournalFact } from "@lfd/contracts/journal-facts";

import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import {
  ADMIN_VERIFIER_OVERRIDE,
  admin,
  assign,
  dayView,
  forgetCustomer,
  openRound,
  VEHICLES,
} from "./delivery-rounds-scene.js";
import {
  forgetRoutingScene,
  MEASURED,
  propose,
  ROAD_ROUTING_OVERRIDES,
  seedBinCatalog,
  seedDeparture,
  seedPlannableDelivery,
} from "./delivery-routing-scene.js";

const DAY = serviceDay();

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE, ...ROAD_ROUTING_OVERRIDES] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  forgetCustomer();
  forgetRoutingScene();
  await seedBinCatalog(ctx);
});

let plateSeq = 0;

async function addVehicle(name: string, allowedZoneIds?: readonly string[]): Promise<string> {
  plateSeq += 1;
  const response = await admin(ctx)
    .post(VEHICLES)
    .send({
      name,
      plate: `ZZ-${String(100 + plateSeq)}-ZZ`,
      cargo: MEASURED,
      ...(allowedZoneIds === undefined ? {} : { allowedZoneIds }),
    })
    .expect(201);
  return jsonBody<CreatedIdResponse>(response).id;
}

/**
 * Une zone de livraison du commerce. Semée en Prisma comme dans les autres
 * e2e de la livraison : c'est une donnée du commerce, que la livraison ne
 * connaît que par son identifiant.
 */
async function zone(label: string, prefix: string): Promise<string> {
  const created = await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: [prefix], label, feeMode: "amount", feeValue: 0 },
    select: { id: true },
  });
  return created.id;
}

/** Une livraison située, dans cette zone (figée à la passation : la colonne de la commande). */
async function deliveryIn(
  zoneId: string,
  gps: { readonly lat: number; readonly lng: number },
): Promise<string> {
  const orderId = await seedPlannableDelivery(ctx, DAY, gps);
  await ctx.prisma.order.update({ where: { id: orderId }, data: { deliveryZoneId: zoneId } });
  return orderId;
}

describe("la fiche d'un véhicule porte ses zones", () => {
  it("aller-retour trié, effacé par une correction qui les omet, et tracé au journal", async () => {
    const id = await addVehicle("Kangoo", ["z_sud", "z_nord", "z_sud"]);
    const fleet = async (): Promise<VehiclesView> =>
      jsonBody<VehiclesView>(await admin(ctx).get(VEHICLES).expect(200));

    const [added] = (await fleet()).vehicles;
    expect(added?.allowedZoneIds).toEqual(["z_nord", "z_sud"]);

    await admin(ctx)
      .put(`${VEHICLES}/${id}`)
      .send({ name: "Kangoo", plate: added?.plate, cargo: MEASURED })
      .expect(204);
    expect((await fleet()).vehicles[0]?.allowedZoneIds).toEqual([]);

    await ctx.drain();
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: { startsWith: "delivery_vehicle." } },
      orderBy: { id: "asc" },
      select: { type: true, payload: true },
    });
    expect(facts.map((fact) => fact.payload)).toMatchObject([
      { allowedZoneIds: ["z_nord", "z_sud"] },
      { before: { allowedZoneIds: ["z_nord", "z_sud"] }, after: { allowedZoneIds: [] } },
    ]);
    for (const fact of facts) {
      expect(checkJournalFact(fact.type, fact.payload)).toBeNull();
    }
  });

  it("refuse une zone vide (400), sans rien écrire", async () => {
    await admin(ctx)
      .post(VEHICLES)
      .send({ name: "Kangoo", plate: "ZZ-999-ZZ", allowedZoneIds: [""] })
      .expect(400);
    expect(await ctx.prisma.deliveryVehicle.count()).toBe(0);
  });
});

describe("« Proposer » respecte les zones", () => {
  async function scene(): Promise<{
    readonly north: string;
    readonly south: readonly string[];
    readonly nord: string;
    readonly sud: string;
  }> {
    await seedDeparture(ctx);
    const nord = await zone("Aix", "731");
    const sud = await zone("Montmélian", "738");
    return {
      nord,
      sud,
      north: await deliveryIn(nord, { lat: 45.69, lng: 5.91 }),
      south: [
        await deliveryIn(sud, { lat: 45.5, lng: 6.05 }),
        await deliveryIn(sud, { lat: 45.49, lng: 6.06 }),
      ],
    };
  }

  it("chaque commande va au véhicule de sa zone", async () => {
    const { nord, sud, north, south } = await scene();
    const kangoo = await addVehicle("Kangoo", [nord]);
    const trafic = await addVehicle("Trafic", [sud]);

    const view = await propose(ctx, `jour=${DAY}`);

    const of = (vehicleId: string): readonly string[] =>
      view.rounds
        .filter((round) => round.vehicleId === vehicleId)
        .flatMap((round) => round.stops.map((stop) => stop.orderId))
        .sort();
    expect(of(kangoo)).toEqual([north]);
    expect(of(trafic)).toEqual([...south].sort());
    expect(view.unfit).toEqual([]);
  });

  it("sans véhicule autorisé sur sa zone, la commande reste à répartir, raison « zone »", async () => {
    const { nord, south } = await scene();
    await addVehicle("Kangoo", [nord]);

    const view = await propose(ctx, `jour=${DAY}`);

    expect(view.unfit.map((order) => [order.orderId, order.reason]).sort()).toEqual(
      [...south].sort().map((orderId) => [orderId, "zone"]),
    );
  });
});

describe("un arrêt posé hors zone à la main", () => {
  it("est dit « hors zone » sur la composition, et rien n'est défait", async () => {
    const nord = await zone("Aix", "731");
    const sud = await zone("Montmélian", "738");
    const kangoo = await addVehicle("Kangoo", [nord]);
    const away = await deliveryIn(sud, { lat: 45.5, lng: 6.05 });
    const home = await deliveryIn(nord, { lat: 45.69, lng: 5.91 });
    const roundId = await openRound(ctx, DAY, kangoo);
    await assign(ctx, DAY, roundId, away);
    await assign(ctx, DAY, roundId, home);

    const stops = (await dayView(ctx, DAY)).rounds[0]?.stops ?? [];

    expect(stops.map((stop) => [stop.orderId, stop.outOfZone ?? false])).toEqual([
      [away, true],
      [home, false],
    ]);
    expect(stops.every((stop) => stop.signals.length === 0)).toBe(true);
  });
});
