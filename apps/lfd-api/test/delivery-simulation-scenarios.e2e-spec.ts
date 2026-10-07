/**
 * E2E des **scénarios du simulateur** et de « partir d'une vraie journée »
 * (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`, lot 9, L9-C7 et
 * L9-C8) — sur le vrai SQL : l'index partiel du nom, la relecture du `jsonb`,
 * les droits, et la copie d'un jour sans identifiant de commande.
 */
import type {
  CreatedIdResponse,
  DeliverySimulationFromDayView,
  DeliverySimulationPayload,
  DeliverySimulationScenarioSummaryView,
  DeliverySimulationScenarioView,
} from "@lfd/contracts";

import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import {
  addVehicle,
  ADMIN_VERIFIER_OVERRIDE,
  admin,
  forgetCustomer,
} from "./delivery-rounds-scene.js";
import {
  forgetRoutingScene,
  ROAD_ROUTING_OVERRIDES,
  seedLocatedDelivery,
} from "./delivery-routing-scene.js";

const SCENARIOS = "/admin/livraison/simulateur/scenarios";
const FROM_DAY = "/admin/livraison/simulateur/depuis-journee";
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
});

const SCENARIO: DeliverySimulationPayload = {
  stops: [
    { id: "a", label: "Chez A", gps: { lat: 45.56, lng: 5.92 }, window: null, stopMinutes: 10 },
  ],
  vehicles: ["Kangoo"],
  settings: {
    earliestDeparture: "06:00",
    maxRoundMinutes: 240,
    stopMinutes: 5,
    defaultMode: "new_rounds",
    multiplePassages: true,
  },
  departure: null,
};

async function record(name: string): Promise<string> {
  const response = await admin(ctx).post(SCENARIOS).send({ name, scenario: SCENARIO }).expect(201);
  return jsonBody<CreatedIdResponse>(response).id;
}

async function list(): Promise<readonly DeliverySimulationScenarioSummaryView[]> {
  return jsonBody<DeliverySimulationScenarioSummaryView[]>(
    await admin(ctx).get(SCENARIOS).expect(200),
  );
}

/** Une fiche `support` qui ne LIT que les tournées, par dérogation. */
async function roundsReader(): Promise<ReturnType<E2eContext["asSub"]>> {
  const sub = "staff-rounds-reader";
  const row = await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: "Lecteur",
      email: "lecteur@lfc.test",
      role: "support",
      status: "active",
      auth0Id: sub,
    },
  });
  await ctx.prisma.staffPermissionOverride.create({
    data: { staffUserId: row.id, resource: "delivery_rounds", action: "read", effect: "allow" },
  });
  return ctx.asSub(sub);
}

describe("les scénarios du simulateur (L9-C7)", () => {
  it("enregistre, liste par nom, rouvre, remplace", async () => {
    const mardi = await record("Mardi");
    await record("Lundi");

    const names = (await list()).map((s) => s.name);
    expect(names).toEqual(["Lundi", "Mardi"]);
    const summary = (await list()).find((s) => s.id === mardi);
    expect(summary).toMatchObject({ stops: 1, vehicles: 1 });
    expect(summary?.updatedBy).not.toBeNull();

    const view = jsonBody<DeliverySimulationScenarioView>(
      await admin(ctx).get(`${SCENARIOS}/${mardi}`).expect(200),
    );
    expect(view).toMatchObject({ id: mardi, name: "Mardi", scenario: SCENARIO });

    const bigger = { ...SCENARIO, vehicles: ["Kangoo", "Trafic"] };
    await admin(ctx)
      .put(`${SCENARIOS}/${mardi}`)
      .send({ name: "Mardi chargé", scenario: bigger })
      .expect(204);
    const replaced = jsonBody<DeliverySimulationScenarioView>(
      await admin(ctx).get(`${SCENARIOS}/${mardi}`).expect(200),
    );
    expect(replaced).toMatchObject({ name: "Mardi chargé", scenario: bigger });
  });

  it("refuse un nom déjà porté (409) ; archivé, le même nom se recrée", async () => {
    const first = await record("Mardi");
    await admin(ctx).post(SCENARIOS).send({ name: "Mardi", scenario: SCENARIO }).expect(409);

    await admin(ctx).post(`${SCENARIOS}/${first}/archiver`).expect(204);
    const second = await record("Mardi");

    expect((await list()).map((s) => s.id)).toEqual([second]);
    await admin(ctx).get(`${SCENARIOS}/${first}`).expect(404);
    await admin(ctx).post(`${SCENARIOS}/${first}/archiver`).expect(409); // déjà archivé
    expect(await ctx.prisma.deliverySimulationScenario.count()).toBe(2); // jamais supprimé
  });

  it("duplique sous un nom de copie unique", async () => {
    const mardi = await record("Mardi");

    const first = jsonBody<CreatedIdResponse>(
      await admin(ctx).post(`${SCENARIOS}/${mardi}/dupliquer`).expect(201),
    );
    await admin(ctx).post(`${SCENARIOS}/${mardi}/dupliquer`).expect(201);

    expect((await list()).map((s) => s.name)).toEqual([
      "Mardi",
      "Mardi (copie 2)",
      "Mardi (copie)",
    ]);
    await admin(ctx).get(`${SCENARIOS}/${first.id}`).expect(200);
  });

  it("un scénario devenu invalide en base se refuse en 409 qui le nomme, et s'archive", async () => {
    const id = await record("Mardi");
    await ctx.prisma.deliverySimulationScenario.update({
      where: { id },
      data: { scenario: { ...SCENARIO, stops: [] } },
    });

    const refused = await admin(ctx).get(`${SCENARIOS}/${id}`).expect(409);
    expect(JSON.stringify(refused.body)).toContain("Mardi");
    expect((await list())[0]).toMatchObject({ stops: 0 });
    await admin(ctx).post(`${SCENARIOS}/${id}/archiver`).expect(204);
  });

  it("refuse un nom vide ou un scénario invalide (400)", async () => {
    await admin(ctx).post(SCENARIOS).send({ name: "  ", scenario: SCENARIO }).expect(400);
    await admin(ctx)
      .post(SCENARIOS)
      .send({ name: "X", scenario: { ...SCENARIO, vehicles: [] } })
      .expect(400);
  });

  it("qui ne fait que LIRE les tournées voit la liste, mais n'écrit rien (403)", async () => {
    const id = await record("Mardi");
    const reader = await roundsReader();

    await reader.get(SCENARIOS).expect(200);
    await reader.get(`${SCENARIOS}/${id}`).expect(200);
    await reader.post(SCENARIOS).send({ name: "Autre", scenario: SCENARIO }).expect(403);
    await reader.put(`${SCENARIOS}/${id}`).send({ name: "Autre", scenario: SCENARIO }).expect(403);
    await reader.post(`${SCENARIOS}/${id}/dupliquer`).expect(403);
    await reader.post(`${SCENARIOS}/${id}/archiver`).expect(403);
  });
});

describe("partir d'une vraie journée (L9-C8)", () => {
  it("copie les livraisons situées, liste les autres, sans identifiant de commande", async () => {
    const located = await seedLocatedDelivery(ctx, DAY, { lat: 45.6, lng: 5.9 }, 12);
    const blind = await seedLocatedDelivery(ctx, DAY, null);
    await addVehicle(ctx, "Kangoo");
    const reader = await roundsReader();

    const view = jsonBody<DeliverySimulationFromDayView>(
      await reader.get(`${FROM_DAY}?jour=${DAY}`).expect(200),
    );

    expect(view.day).toBe(DAY);
    expect(view.scenario.stops).toEqual([
      {
        id: "j1",
        label: "Site 1",
        gps: { lat: 45.6, lng: 5.9 },
        window: null,
        stopMinutes: 12,
      },
    ]);
    expect(view.withoutPoint).toEqual([{ reference: "TRN-0002", label: "Site 2" }]);
    expect(view.scenario.vehicles).toEqual(["Kangoo"]);
    expect(view.scenario.departure).toBeNull();
    const body = JSON.stringify(view);
    expect(body).not.toContain(located);
    expect(body).not.toContain(blind);
  });

  it("refuse un jour mal formé (400)", async () => {
    await admin(ctx).get(`${FROM_DAY}?jour=demain`).expect(400);
  });
});
