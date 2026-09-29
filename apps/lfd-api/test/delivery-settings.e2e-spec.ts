/**
 * E2E des **bases paramétrables de la livraison** — la flotte et le point de
 * départ des tournées (`documentation/livraisons/plan-preparation-de-tournee.md`,
 * lot 2), et les deux droits qui les murent.
 *
 * Ce que seul l'e2e prouve : l'index unique PARTIEL sur la plaque (écrit à la
 * main dans la migration, Prisma ne le connaît pas), la lecture des points de
 * retrait par le canal que le commerce implémente, les droits lus en base, et
 * l'acteur des faits relu du contexte de requête.
 *
 * Le jeton porteur EST le `sub` : chaque rôle est une vraie fiche en base.
 */
import type {
  CreatedIdResponse,
  CreatedPickupResponse,
  DepartureView,
  PickupAddressView,
  StaffRole,
  VehiclesView,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const VEHICLES = "/admin/livraison/vehicules";
const DEPARTURE = "/admin/livraison/depart";

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

/** Sème une personne de ce rôle, déjà entrée, et rend son agent HTTP. */
async function asRole(role: StaffRole): Promise<ReturnType<E2eContext["asSub"]>> {
  const sub = `staff-${role}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: role,
      email: `${role}@lfc.test`,
      role,
      status: "active",
      auth0Id: sub,
    },
  });
  return ctx.asSub(sub);
}

async function addVehicle(name: string, plate: string): Promise<string> {
  const response = await admin().post(VEHICLES).send({ name, plate }).expect(201);
  return jsonBody<CreatedIdResponse>(response).id;
}

async function fleet(): Promise<VehiclesView> {
  return jsonBody<VehiclesView>(await admin().get(VEHICLES).expect(200));
}

async function addPoint(label: string, extra: Record<string, unknown> = {}): Promise<string> {
  const response = await admin()
    .post("/admin/pickup-addresses")
    .send({
      label,
      ligne1: "1 rue du Four",
      ligne2: "",
      codePostal: "73000",
      ville: "Chambéry",
      pays: "France",
      isDefault: false,
      ...extra,
    })
    .expect(201);
  return jsonBody<CreatedPickupResponse>(response).id;
}

async function departure(): Promise<DepartureView> {
  return jsonBody<DepartureView>(await admin().get(DEPARTURE).expect(200));
}

describe("la flotte", () => {
  it("ajoute, normalise la plaque, corrige, et liste dans l'ordre de création", async () => {
    const kangoo = await addVehicle("Kangoo blanc", "ab 123 cd");
    await addVehicle("Trafic", "EF456GH");

    await admin()
      .put(`${VEHICLES}/${kangoo}`)
      .send({ name: "Kangoo gris", plate: "AB-123-CD" })
      .expect(204);

    const { vehicles } = await fleet();
    expect(vehicles.map(({ name, plate, retiredAt }) => ({ name, plate, retiredAt }))).toEqual([
      { name: "Kangoo gris", plate: "AB-123-CD", retiredAt: null },
      { name: "Trafic", plate: "EF-456-GH", retiredAt: null },
    ]);
  });

  it("refuse une plaque mal formée (400) et un véhicule inconnu (404)", async () => {
    await admin().post(VEHICLES).send({ name: "X", plate: "AB-12" }).expect(400);
    await admin().post(`${VEHICLES}/absent/retrait`).expect(404);
  });

  it("🔴 refuse une plaque portée par un véhicule en service, en le NOMMANT (409)", async () => {
    await addVehicle("Kangoo blanc", "AB-123-CD");

    const refused = await admin()
      .post(VEHICLES)
      .send({ name: "Trafic", plate: "ab123cd" })
      .expect(409);

    expect(JSON.stringify(refused.body)).toContain("Kangoo blanc");
    expect((await fleet()).vehicles).toHaveLength(1);
  });

  it("retire à une date, libère la plaque, et la réactivation bute sur le nouveau porteur", async () => {
    const old = await addVehicle("Kangoo blanc", "AB-123-CD");

    await admin().post(`${VEHICLES}/${old}/retrait`).expect(204);
    await admin().post(`${VEHICLES}/${old}/retrait`).expect(409);
    const retired = (await fleet()).vehicles.find((vehicle) => vehicle.id === old);
    expect(retired?.retiredAt).not.toBeNull();
    expect(Date.parse(retired?.retiredAt ?? "")).toBeGreaterThanOrEqual(
      Date.parse(retired?.createdAt ?? ""),
    );

    await addVehicle("Kangoo neuf", "AB-123-CD");
    const refused = await admin().post(`${VEHICLES}/${old}/reactivation`).expect(409);
    expect(JSON.stringify(refused.body)).toContain("Kangoo neuf");
  });

  it("réactive un véhicule retiré dont la plaque est libre, et refuse de réactiver un actif", async () => {
    const id = await addVehicle("Kangoo blanc", "AB-123-CD");
    await admin().post(`${VEHICLES}/${id}/reactivation`).expect(409);

    await admin().post(`${VEHICLES}/${id}/retrait`).expect(204);
    await admin().post(`${VEHICLES}/${id}/reactivation`).expect(204);

    expect((await fleet()).vehicles[0]?.retiredAt).toBeNull();
  });

  it("journalise chaque geste au nom de l'administrateur", async () => {
    const id = await addVehicle("Kangoo blanc", "AB-123-CD");
    await admin().put(`${VEHICLES}/${id}`).send({ name: "Kangoo", plate: "AB-123-CD" }).expect(204);
    await admin().post(`${VEHICLES}/${id}/retrait`).expect(204);
    await admin().post(`${VEHICLES}/${id}/reactivation`).expect(204);

    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: { startsWith: "delivery_vehicle." } },
      orderBy: { id: "asc" },
      select: { type: true, subjectId: true, actorType: true, actorId: true },
    });
    expect(facts).toEqual(
      ["added", "corrected", "retired", "reactivated"].map((verb) => ({
        type: `delivery_vehicle.${verb}`,
        subjectId: id,
        actorType: "staff",
        actorId: E2E_STAFF_ID,
      })),
    );
  });
});

describe("le point de départ", () => {
  it("part du point par défaut, puis du point choisi, auteur figé et fait au journal", async () => {
    const labo = await addPoint("Laboratoire", { gps: { lat: 45.57, lng: 5.92 } });
    const boutique = await addPoint("Boutique");

    const before = await departure();
    expect(before.source).toBe("default");
    expect(before.point).toMatchObject({ pickupAddressId: labo, gps: { lat: 45.57, lng: 5.92 } });
    expect(before.choices.map((choice) => choice.pickupAddressId)).toEqual([labo, boutique]);

    await admin().put(DEPARTURE).send({ pickupAddressId: boutique }).expect(204);

    const after = await departure();
    expect(after.source).toBe("explicit");
    expect(after.point).toMatchObject({ pickupAddressId: boutique, label: "Boutique", gps: null });
    expect(await ctx.prisma.deliveryDeparture.findFirst()).toMatchObject({
      pickupAddressId: boutique,
      updatedByStaffId: E2E_STAFF_ID,
      updatedByName: "Opérateur E2E",
    });
    const fact = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "delivery_departure.chosen" },
      select: { actorType: true, actorId: true },
    });
    expect(fact).toEqual({ actorType: "staff", actorId: E2E_STAFF_ID });
  });

  it("refuse un point qui n'existe pas (404), sans rien écrire", async () => {
    await addPoint("Laboratoire");
    await admin().put(DEPARTURE).send({ pickupAddressId: "ailleurs" }).expect(404);
    expect(await ctx.prisma.deliveryDeparture.count()).toBe(0);
  });

  it("un point choisi puis supprimé retombe sur le défaut, sans adresse inventée", async () => {
    const labo = await addPoint("Laboratoire");
    const boutique = await addPoint("Boutique");
    await admin().put(DEPARTURE).send({ pickupAddressId: boutique }).expect(204);

    await admin().delete(`/admin/pickup-addresses/${boutique}`).expect(204);

    const view = await departure();
    expect(view.source).toBe("default");
    expect(view.point?.pickupAddressId).toBe(labo);
  });
});

describe("le point GPS d'un point de retrait", () => {
  it("s'écrit, se garde quand la charge ne le porte pas, et s'efface par null", async () => {
    const id = await addPoint("Laboratoire", { gps: { lat: 45.57, lng: 5.92 } });
    const base = {
      label: "Laboratoire",
      ligne1: "1 rue du Four",
      ligne2: "",
      codePostal: "73000",
      ville: "Chambéry",
      pays: "France",
      isDefault: true,
    };
    const gpsOf = async (): Promise<unknown> =>
      jsonBody<readonly PickupAddressView[]>(
        await ctx.http().get("/pickup-addresses").expect(200),
      )[0]?.gps;

    expect(await gpsOf()).toEqual({ lat: 45.57, lng: 5.92 });
    await admin().patch(`/admin/pickup-addresses/${id}`).send(base).expect(204);
    expect(await gpsOf()).toEqual({ lat: 45.57, lng: 5.92 });
    await admin()
      .patch(`/admin/pickup-addresses/${id}`)
      .send({ ...base, gps: null })
      .expect(204);
    expect(await gpsOf()).toBeNull();
  });

  it("refuse une latitude hors bornes (400)", async () => {
    await admin()
      .post("/admin/pickup-addresses")
      .send({
        label: "X",
        ligne1: "1",
        codePostal: "1",
        ville: "V",
        pays: "F",
        gps: { lat: 91, lng: 0 },
      })
      .expect(400);
  });
});

describe("les droits de la livraison", () => {
  it("🔴 refuse la flotte et le départ au commercial (403), sans rien écrire", async () => {
    const commercial = await asRole("commercial");

    expect((await commercial.get(VEHICLES)).status).toBe(403);
    expect((await commercial.post(VEHICLES).send({ name: "X", plate: "AB-123-CD" })).status).toBe(
      403,
    );
    expect((await commercial.get(DEPARTURE)).status).toBe(403);
    expect(await ctx.prisma.deliveryVehicle.count()).toBe(0);
  });

  it("laisse le comptoir LIRE la flotte, pas la régler", async () => {
    const counter = await asRole("comptoir");

    expect((await counter.get(VEHICLES)).status).toBe(200);
    expect((await counter.post(VEHICLES).send({ name: "X", plate: "AB-123-CD" })).status).toBe(403);
  });

  it("laisse le support lire la feuille de route, qui n'est plus sous `b2b_orders`", async () => {
    const support = await asRole("support");
    const accounting = await asRole("comptabilite");
    const path = "/admin/livraison/feuille-de-route?jour=2026-01-01";

    expect((await support.get(path)).status).toBe(200);
    // Elle avait `b2b_orders:write` : la feuille lui est désormais fermée (Q8).
    expect((await accounting.get(path)).status).toBe(403);
  });
});
