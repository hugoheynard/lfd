/**
 * E2E des **passages de roue d'un véhicule**
 * (`documentation/livraisons/plan-geometrie-du-plancher.md`, G-D2, lot G4).
 *
 * Ce que seul l'e2e prouve : l'aller-retour par les quatre colonnes, la charge
 * du journal relue en base, le refus du domaine traduit en 400, et les deux
 * CHECK écrits à la main dans la migration `20260930100000_les_passages_de_roue`.
 */
import type { CreatedIdResponse, VehiclesView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const VEHICLES = "/admin/livraison/vehicules";

/** Un Trafic : 290 × 166 × 139 cm, passages à 60 cm du fond. */
const CARGO = { lengthCm: 290, widthCm: 166, heightCm: 139 };
const ARCHES = { lengthCm: 90, protrusionCm: 20, fromBackCm: 60, heightCm: 30 };

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

describe("les passages de roue — aller-retour", () => {
  it("rend les quatre cotes, et un véhicule sans passages rend null", async () => {
    await addVehicle({ name: "Trafic", plate: "AB-123-CD", cargo: CARGO, wheelArches: ARCHES });
    await addVehicle({ name: "Kangoo", plate: "EF-456-GH", cargo: CARGO });

    expect((await fleet()).vehicles.map((vehicle) => vehicle.wheelArches)).toEqual([ARCHES, null]);
  });

  it("la correction est complète : omettre les passages les efface, et le journal le dit", async () => {
    const id = await addVehicle({ name: "Trafic", plate: "AB-123-CD", cargo: CARGO });
    await admin()
      .put(`${VEHICLES}/${id}`)
      .send({ name: "Trafic", plate: "AB-123-CD", cargo: CARGO, wheelArches: ARCHES })
      .expect(204);
    await admin()
      .put(`${VEHICLES}/${id}`)
      .send({ name: "Trafic", plate: "AB-123-CD", cargo: CARGO })
      .expect(204);

    expect((await fleet()).vehicles[0]?.wheelArches).toBeNull();
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: { startsWith: "delivery_vehicle." } },
      orderBy: { id: "asc" },
      select: { payload: true },
    });
    expect(facts.map((fact) => fact.payload)).toMatchObject([
      { wheelArches: null },
      { before: { wheelArches: null }, after: { wheelArches: ARCHES } },
      { before: { wheelArches: ARCHES }, after: { wheelArches: null } },
    ]);
  });
});

describe("les passages de roue — refus", () => {
  it.each([
    ["des passages sans dimensions utiles", {}, "delivery.wheel_arches_without_cargo"],
    [
      "une saillie ≥ demi-largeur",
      { cargo: CARGO, wheelArches: { ...ARCHES, protrusionCm: 83 } },
      "delivery.wheel_arches_invalid",
    ],
    [
      "un passage qui sort du plancher",
      { cargo: CARGO, wheelArches: { ...ARCHES, fromBackCm: 201 } },
      "delivery.wheel_arches_invalid",
    ],
    [
      "un passage qui touche le plafond",
      { cargo: CARGO, wheelArches: { ...ARCHES, heightCm: 139 } },
      "delivery.wheel_arches_invalid",
    ],
  ])("refuse %s (400), sans rien écrire", async (_case, load, expected) => {
    const refusal = await admin()
      .post(VEHICLES)
      .send({ name: "Trafic", plate: "AB-123-CD", wheelArches: ARCHES, ...load })
      .expect(400);

    expect(code(refusal)).toBe(expected);
    expect((await fleet()).vehicles).toEqual([]);
  });

  it("refuse dès la forme des passages sans hauteur (400)", async () => {
    const withoutHeight = { lengthCm: 90, protrusionCm: 20, fromBackCm: 60 };
    await admin()
      .post(VEHICLES)
      .send({ name: "Trafic", plate: "AB-123-CD", cargo: CARGO, wheelArches: withoutHeight })
      .expect(400);
    expect((await fleet()).vehicles).toEqual([]);
  });

  it("une correction refusée laisse les passages en place", async () => {
    const id = await addVehicle({
      name: "Trafic",
      plate: "AB-123-CD",
      cargo: CARGO,
      wheelArches: ARCHES,
    });

    await admin()
      .put(`${VEHICLES}/${id}`)
      .send({
        name: "Trafic",
        plate: "AB-123-CD",
        cargo: { ...CARGO, widthCm: 40 },
        wheelArches: ARCHES,
      })
      .expect(400);

    expect((await fleet()).vehicles[0]).toMatchObject({ cargo: CARGO, wheelArches: ARCHES });
  });
});

describe("les passages de roue — les CHECK en base", () => {
  async function write(id: string, assignments: string): Promise<unknown> {
    return ctx.prisma.$executeRawUnsafe(
      `UPDATE "delivery"."delivery_vehicle" SET ${assignments} WHERE "id" = $1`,
      id,
    );
  }

  const ALL_FOUR = `"wheel_arch_length_cm" = 90, "wheel_arch_protrusion_cm" = 20, "wheel_arch_from_back_cm" = 60, "wheel_arch_height_cm" = 30`;

  it("refuse une cote seule, et des passages sans chargement", async () => {
    const bare = await addVehicle({ name: "Kangoo", plate: "AB-123-CD" });
    const measured = await addVehicle({ name: "Trafic", plate: "EF-456-GH", cargo: CARGO });

    await expect(write(measured, `"wheel_arch_length_cm" = 90`)).rejects.toThrow(
      /delivery_vehicle_wheel_arches_all_or_none/u,
    );
    await expect(write(bare, ALL_FOUR)).rejects.toThrow(
      /delivery_vehicle_wheel_arches_need_cargo/u,
    );
    await expect(write(measured, ALL_FOUR)).resolves.toBe(1);
  });
});
