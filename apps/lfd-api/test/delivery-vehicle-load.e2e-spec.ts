/**
 * E2E du **chargement d'un véhicule** — dimensions utiles, caisse réfrigérée
 * et énergie
 * (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 2 bis).
 *
 * Ce que seul l'e2e prouve : l'aller-retour par les six colonnes, le volume
 * dérivé à la lecture, la charge du journal relue en base, et les quatre CHECK
 * écrits à la main dans la migration — qu'aucune écriture hors de l'agrégat ne
 * pose un véhicule à moitié décrit.
 */
import type { CreatedIdResponse, VehiclesView } from "@lfd/contracts";
import { checkJournalFact } from "@lfd/contracts/journal-facts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const VEHICLES = "/admin/livraison/vehicules";

/** Un grand fourgon : 330 × 170 × 176 cm = 9 873 L, et 400 L de froid. */
const CARGO = { lengthCm: 330, widthCm: 170, heightCm: 176 };
const COLD = { volumeLiters: 400, minTempC: 0, maxTempC: 4 };

let ctx: E2eContext;

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
});

function admin(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub(E2E_STAFF_SUB);
}

async function addVehicle(body: Record<string, unknown>): Promise<string> {
  const response = await admin().post(VEHICLES).send(body).expect(201);
  return jsonBody<CreatedIdResponse>(response).id;
}

async function fleet(): Promise<VehiclesView> {
  return jsonBody<VehiclesView>(await admin().get(VEHICLES).expect(200));
}

function code(response: Parameters<typeof jsonBody>[0]): string {
  return jsonBody<{ readonly code: string }>(response).code;
}

describe("le chargement d'un véhicule — aller-retour", () => {
  it("rend les dimensions, le volume DÉRIVÉ et la caisse réfrigérée", async () => {
    await addVehicle({
      name: "Master",
      plate: "AB-123-CD",
      cargo: CARGO,
      refrigeration: COLD,
      energy: "gas",
    });

    expect((await fleet()).vehicles[0]).toMatchObject({
      cargo: { ...CARGO, volumeLiters: 9873 },
      refrigeration: COLD,
      energy: "gas",
    });
  });

  it("un véhicule d'avant le lot 2 bis (sans les champs) est sec et sans dimensions", async () => {
    await addVehicle({ name: "Kangoo", plate: "AB-123-CD" });

    expect((await fleet()).vehicles[0]).toMatchObject({
      cargo: null,
      refrigeration: null,
      energy: null,
    });
  });

  it("la correction est complète : omettre le chargement l'efface, et le journal le dit", async () => {
    const id = await addVehicle({ name: "Master", plate: "AB-123-CD", cargo: CARGO });
    await admin()
      .put(`${VEHICLES}/${id}`)
      .send({
        name: "Master",
        plate: "AB-123-CD",
        cargo: CARGO,
        refrigeration: COLD,
        energy: "electric",
      })
      .expect(204);
    await admin().put(`${VEHICLES}/${id}`).send({ name: "Master", plate: "AB-123-CD" }).expect(204);

    expect((await fleet()).vehicles[0]).toMatchObject({
      cargo: null,
      refrigeration: null,
      energy: null,
    });
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: { startsWith: "delivery_vehicle." } },
      orderBy: { id: "asc" },
      select: { type: true, payload: true },
    });
    expect(facts.map((fact) => fact.payload)).toMatchObject([
      { cargo: CARGO, refrigeration: null, energy: null },
      {
        before: { cargo: CARGO, refrigeration: null, energy: null },
        after: { cargo: CARGO, refrigeration: COLD, energy: "electric" },
      },
      {
        before: { cargo: CARGO, refrigeration: COLD, energy: "electric" },
        after: { cargo: null, refrigeration: null, energy: null },
      },
    ]);
    for (const fact of facts) {
      expect(checkJournalFact(fact.type, fact.payload)).toBeNull();
    }
  });
});

describe("le chargement d'un véhicule — refus", () => {
  it.each([
    [
      "une dimension hors bornes",
      { cargo: { ...CARGO, heightCm: 1001 } },
      "delivery.cargo_dimensions_invalid",
    ],
    [
      "une plage à l'envers",
      { refrigeration: { ...COLD, minTempC: 5 } },
      "delivery.refrigeration_invalid",
    ],
    [
      "un froid à −31 °C",
      { refrigeration: { ...COLD, minTempC: -31 } },
      "delivery.refrigeration_invalid",
    ],
    [
      "plus de froid que de place",
      { cargo: { lengthCm: 100, widthCm: 100, heightCm: 10 }, refrigeration: COLD },
      "delivery.refrigerated_volume_exceeds_cargo",
    ],
  ])("refuse %s (400), sans rien écrire", async (_case, load, expected) => {
    const refusal = await admin()
      .post(VEHICLES)
      .send({ name: "Master", plate: "AB-123-CD", ...load })
      .expect(400);

    expect(code(refusal)).toBe(expected);
    expect((await fleet()).vehicles).toEqual([]);
  });

  it("refuse une énergie hors de la liste dès la forme (400)", async () => {
    await admin()
      .post(VEHICLES)
      .send({ name: "Master", plate: "AB-123-CD", energy: "hydrogen" })
      .expect(400);
    expect((await fleet()).vehicles).toEqual([]);
  });

  it("refuse une dimension non entière dès la forme (400)", async () => {
    await admin()
      .post(VEHICLES)
      .send({ name: "Master", plate: "AB-123-CD", cargo: { ...CARGO, widthCm: 170.5 } })
      .expect(400);
  });

  it("une plaque déjà en service reste un 409, et le chargement n'est pas corrigé", async () => {
    await addVehicle({ name: "Kangoo", plate: "AB-123-CD" });
    const id = await addVehicle({ name: "Master", plate: "EF-456-GH", cargo: CARGO });

    await admin()
      .put(`${VEHICLES}/${id}`)
      .send({ name: "Master", plate: "AB-123-CD", refrigeration: COLD })
      .expect(409);

    const master = (await fleet()).vehicles.find((vehicle) => vehicle.id === id);
    expect(master).toMatchObject({ plate: "EF-456-GH", cargo: { ...CARGO }, refrigeration: null });
  });
});

describe("le chargement d'un véhicule — les CHECK en base", () => {
  async function write(id: string, assignments: string): Promise<unknown> {
    return ctx.prisma.$executeRawUnsafe(
      `UPDATE "production"."delivery_vehicle" SET ${assignments} WHERE "id" = $1`,
      id,
    );
  }

  it("refuse une dimension seule, un froid partiel, et une plage à l'envers", async () => {
    const id = await addVehicle({ name: "Master", plate: "AB-123-CD" });

    await expect(write(id, `"cargo_length_cm" = 300`)).rejects.toThrow(
      /delivery_vehicle_cargo_all_or_none/u,
    );
    await expect(write(id, `"refrigerated_volume_liters" = 400`)).rejects.toThrow(
      /delivery_vehicle_refrigeration_all_or_none/u,
    );
    await expect(
      write(
        id,
        `"refrigerated_volume_liters" = 400, "refrigerated_min_temp_c" = 5, "refrigerated_max_temp_c" = 4`,
      ),
    ).rejects.toThrow(/delivery_vehicle_refrigeration_range/u);
    await expect(
      write(
        id,
        `"cargo_length_cm" = 300, "cargo_width_cm" = 170, "cargo_height_cm" = 170, "refrigerated_volume_liters" = 400, "refrigerated_min_temp_c" = -18, "refrigerated_max_temp_c" = -18`,
      ),
    ).resolves.toBe(1);
  });

  it("refuse une énergie inconnue (L2b-C6)", async () => {
    const id = await addVehicle({ name: "Master", plate: "AB-123-CD" });

    await expect(write(id, `"energy" = 'hydrogen'`)).rejects.toThrow(
      /delivery_vehicle_energy_known/u,
    );
    await expect(write(id, `"energy" = 'petrol'`)).resolves.toBe(1);
  });
});
