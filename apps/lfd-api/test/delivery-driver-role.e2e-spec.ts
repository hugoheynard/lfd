/**
 * E2E du **rôle `livreur`** (`documentation/livraisons/livreur/plan-ma-tournee.md`,
 * MT1, MT-D1 v2) — le rôle est créé À L'ÉCRAN, par la vraie route des rôles
 * (sa migration a été retirée le 2026-10-01, `plan-droits-par-geste.md`,
 * DG-D6), et ce qu'il ouvre se lit sur les vraies routes.
 *
 * 🔴 Le livreur n'a QUE `delivery_driving:write` et `delivery_doorstep:write` :
 * pas même la cloche, qui ne filtre aucun destinataire — il y lirait les
 * alertes de compte et les demandes des clients, et les éteindrait pour tout
 * le monde. Les deux, et pas un seul : depuis l'audit 2026-10-07 (B8), qui
 * conduit sans les gestes à la porte n'est ni proposé ni affecté.
 */
import { type DeliveryDriversView, roleGrantsSchema, type StaffMeView } from "@lfd/contracts";
import type request from "supertest";
import type { Response } from "supertest";

import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import {
  ADMIN_VERIFIER_OVERRIDE,
  addVehicle,
  admin,
  openRound,
  ROUNDS,
  roundOf,
} from "./delivery-rounds-scene.js";
import { MY_ROUND, seedDriverRole, staffWithRole } from "./delivery-driver-scene.js";

const DAY = serviceDay();

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await seedDriverRole(ctx);
});

describe("le rôle `livreur`, créé à l'écran", () => {
  it("n'accorde que conduire et les gestes à la porte — ni cloche, ni commandes, ni chargement", async () => {
    const role = await ctx.prisma.staffRoleDefinition.findUniqueOrThrow({
      where: { key: "livreur" },
    });
    expect(roleGrantsSchema.parse(role.grants)).toEqual([
      { resource: "delivery_driving", action: "write" },
      { resource: "delivery_doorstep", action: "write" },
    ]);

    const { agent } = await staffWithRole(ctx, "livreur-paul");
    const me = jsonBody<StaffMeView>(await agent.get("/admin/me").expect(200));
    expect([...me.permissions].sort()).toEqual([
      "delivery_doorstep:read",
      "delivery_doorstep:write",
      "delivery_driving:read",
      "delivery_driving:write",
    ]);
  });

  it("le comptoir de la graine n'a pas le droit de conduire", async () => {
    const counter = await ctx.prisma.staffRoleDefinition.findUniqueOrThrow({
      where: { key: "comptoir" },
    });

    expect(
      roleGrantsSchema.parse(counter.grants).some((grant) => grant.resource === "delivery_driving"),
    ).toBe(false);
  });

  /**
   * Régression évitée (plan `plan-droits-par-geste.md`, DG-D6) : le rôle était
   * posé par une migration, ce que la règle « une migration ajoute une
   * ressource, jamais un droit à un rôle » interdit désormais. Une base semée
   * ne le connaît pas — il naît à l'écran.
   */
  it("n'existe pas dans une base semée : aucune migration ni graine ne le pose", async () => {
    await ctx.reset();

    expect(
      await ctx.prisma.staffRoleDefinition.findUnique({ where: { key: "livreur" } }),
    ).toBeNull();
  });
});

describe("le mur de droits du livreur (MT1)", () => {
  /**
   * Les routes qu'un livreur ne doit PAS atteindre, nommées une à une : la
   * cloche, les commandes, la feuille de route du jour, le chargement, la
   * composition des tournées et la porte de départ du chargeur.
   */
  it("prend 403 partout ailleurs que sur sa page", async () => {
    const roundId = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
    const { agent } = await staffWithRole(ctx, "livreur-paul");

    const refused: readonly (readonly [string, () => request.Test])[] = [
      ["la cloche", () => agent.get("/admin/notifications")],
      ["les commandes", () => agent.get("/admin/orders")],
      ["la feuille de route", () => agent.get(`/admin/livraison/feuille-de-route?jour=${DAY}`)],
      ["le chargement", () => agent.get(`/admin/livraison/chargement?jour=${DAY}`)],
      ["la tournée au chargement", () => agent.get(`/admin/livraison/chargement/${roundId}`)],
      ["les tournées", () => agent.get(`/admin/livraison/tournees?jour=${DAY}`)],
      ["les livreurs proposables", () => agent.get("/admin/livraison/tournees/livreurs")],
      [
        "le départ du chargeur",
        () => agent.post(`/admin/livraison/tournees/${roundId}/depart`).send({ version: 1 }),
      ],
      [
        "l'affectation",
        () =>
          agent
            .put(`/admin/livraison/tournees/${roundId}/livreur`)
            .send({ staffUserId: "x", version: 1 }),
      ],
    ];
    for (const [name, call] of refused) {
      const response = await call();
      expect({ name, status: response.status }).toEqual({ name, status: 403 });
    }

    await agent.get(`${MY_ROUND}?date=${DAY}`).expect(200);
  });
});

describe("un livreur affectable tient les deux droits (audit 2026-10-07, B8)", () => {
  /** Un rôle qui conduit sans les gestes à la porte — créé à l'écran, comme le livreur. */
  const DRIVE_ONLY_ROLE = {
    key: "conducteur",
    label: "Conducteur",
    grants: [{ resource: "delivery_driving", action: "write" }],
  } as const;

  /** Les livreurs que l'écran Tournées propose. */
  async function proposed(): Promise<readonly string[]> {
    const { drivers } = jsonBody<DeliveryDriversView>(
      await admin(ctx).get(`${ROUNDS}/livreurs`).expect(200),
    );
    return drivers.map((driver) => driver.staffUserId);
  }

  /** Affecte `staffUserId` à la version courante, par la route de la composition. */
  async function assignDriver(roundId: string, staffUserId: string): Promise<Response> {
    const { version } = await roundOf(ctx, DAY, roundId);
    return admin(ctx).put(`${ROUNDS}/${roundId}/livreur`).send({ staffUserId, version });
  }

  /**
   * Régression (audit 2026-10-07, B8) : l'affectation ne lisait que
   * `delivery_driving:write`. Un conducteur sans `delivery_doorstep` était
   * proposé, affecté, chargeait et partait — puis prenait 403 à chaque geste à
   * la porte sans pouvoir terminer sa tournée, et rien ne l'avait dit.
   */
  it("🔴 conduire sans les gestes à la porte : absent de la liste, et l'affectation rend 409 en le disant", async () => {
    await ctx.asSub(E2E_STAFF_SUB).post("/admin/staff-roles").send(DRIVE_ONLY_ROLE).expect(201);
    const marc = await staffWithRole(ctx, "conducteur-marc", DRIVE_ONLY_ROLE.key);
    const roundId = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));

    expect(await proposed()).not.toContain(marc.id);
    const refused = await assignDriver(roundId, marc.id);

    expect(refused.status).toBe(409);
    const body = jsonBody<{ code: string; message: string }>(refused);
    expect(body.code).toBe("delivery.driver_without_doorstep");
    expect(body.message).toContain("mais pas « Gestes à la porte »");
    expect((await roundOf(ctx, DAY, roundId)).driver).toBeNull();
  });

  it("avec les deux droits : proposé, puis affecté", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const roundId = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));

    expect(await proposed()).toContain(paul.id);
    expect((await assignDriver(roundId, paul.id)).status).toBe(204);

    expect((await roundOf(ctx, DAY, roundId)).driver).toMatchObject({
      staffUserId: paul.id,
      canDrive: true,
    });
  });

  it("affecté, puis privé des gestes à la porte : l'écran Tournées le dit « sans accès »", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const roundId = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
    expect((await assignDriver(roundId, paul.id)).status).toBe(204);

    await ctx.prisma.staffPermissionOverride.create({
      data: {
        staffUserId: paul.id,
        resource: "delivery_doorstep",
        action: "write",
        effect: "deny",
      },
    });

    expect((await roundOf(ctx, DAY, roundId)).driver?.canDrive).toBe(false);
    expect(await proposed()).not.toContain(paul.id);
  });
});
