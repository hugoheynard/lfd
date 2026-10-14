/**
 * E2E de la **plaque facultative** (Hugo, 2026-10-14 : « seul le nom du
 * véhicule devrait être obligatoire, ensuite des warnings »).
 *
 * Ce que seul l'e2e prouve : la colonne relâchée par la migration
 * `20261014300000_la_plaque_facultative` ; l'index unique partiel qui tient
 * deux `NULL` pour distincts mais refuse toujours deux plaques identiques en
 * service ; les avertissements servis dans la vue ; le fait journalisé qui
 * passe le contrat avec une plaque `null`.
 */
import type { CreatedIdResponse, VehiclesView } from "@lfd/contracts";
import { checkJournalFact } from "@lfd/contracts/journal-facts";

import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { ADMIN_VERIFIER_OVERRIDE, admin, VEHICLES } from "./delivery-rounds-scene.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

async function add(body: Record<string, unknown>): Promise<string> {
  const response = await admin(ctx).post(VEHICLES).send(body).expect(201);
  return jsonBody<CreatedIdResponse>(response).id;
}

async function fleet(): Promise<VehiclesView> {
  return jsonBody<VehiclesView>(await admin(ctx).get(VEHICLES).expect(200));
}

describe("Un véhicule sans plaque", () => {
  it("entre par son seul nom, et sa fiche dit ce qui lui manque", async () => {
    const id = await add({ name: "Fourgon neuf" });

    const view = (await fleet()).vehicles.find((vehicle) => vehicle.id === id);
    expect(view).toMatchObject({ name: "Fourgon neuf", plate: null });
    expect(view?.gaps.map((gap) => gap.code)).toEqual(["no_plate", "no_cargo"]);
  });

  it("deux véhicules sans plaque coexistent, deux plaques identiques en service non", async () => {
    await add({ name: "Fourgon A" });
    await add({ name: "Fourgon B", plate: "" });
    await add({ name: "Kangoo", plate: "AB-123-CD" });

    const refused = await admin(ctx)
      .post(VEHICLES)
      .send({ name: "Trafic", plate: "ab 123 cd" })
      .expect(409);

    expect(jsonBody<{ code: string }>(refused).code).toBe("delivery.license_plate_in_service");
    expect((await fleet()).vehicles.map((vehicle) => vehicle.plate)).toEqual([
      null,
      null,
      "AB-123-CD",
    ]);
  });

  it("une correction pose puis efface la plaque, et le journal le relit au contrat", async () => {
    const id = await add({ name: "Fourgon neuf" });
    await admin(ctx)
      .put(`${VEHICLES}/${id}`)
      .send({ name: "Fourgon neuf", plate: "EF-456-GH" })
      .expect(204);
    await admin(ctx)
      .put(`${VEHICLES}/${id}`)
      .send({ name: "Fourgon neuf", plate: null })
      .expect(204);

    expect((await fleet()).vehicles[0]?.plate).toBeNull();
    await ctx.drain();
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: { startsWith: "delivery_vehicle." } },
      orderBy: { id: "asc" },
      select: { type: true, payload: true },
    });
    expect(facts.map((fact) => fact.type)).toEqual([
      "delivery_vehicle.added",
      "delivery_vehicle.corrected",
      "delivery_vehicle.corrected",
    ]);
    for (const fact of facts) {
      expect(checkJournalFact(fact.type, fact.payload)).toBeNull();
    }
  });
});
