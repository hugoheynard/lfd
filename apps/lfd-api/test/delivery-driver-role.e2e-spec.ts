/**
 * E2E du **rôle `livreur`** (`documentation/livraisons/plan-ma-tournee.md`,
 * MT1, MT-D1 v2) — le rôle est semé par sa VRAIE migration, et ce qu'il ouvre
 * se lit sur les vraies routes.
 *
 * 🔴 Le livreur n'a QUE `delivery_driving:write` : pas même la cloche, qui ne
 * filtre aucun destinataire — il y lirait les alertes de compte et les
 * demandes des clients, et les éteindrait pour tout le monde.
 */
import { roleGrantsSchema, type StaffMeView } from "@lfd/contracts";
import type request from "supertest";

import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { ADMIN_VERIFIER_OVERRIDE, addVehicle, openRound } from "./delivery-rounds-scene.js";
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

describe("le rôle `livreur` posé par sa migration", () => {
  it("n'accorde que `delivery_driving:write` — ni cloche, ni commandes, ni chargement", async () => {
    const role = await ctx.prisma.staffRoleDefinition.findUniqueOrThrow({
      where: { key: "livreur" },
    });
    expect(roleGrantsSchema.parse(role.grants)).toEqual([
      { resource: "delivery_driving", action: "write" },
    ]);

    const { agent } = await staffWithRole(ctx, "livreur-paul");
    const me = jsonBody<StaffMeView>(await agent.get("/admin/me").expect(200));
    expect([...me.permissions].sort()).toEqual(["delivery_driving:read", "delivery_driving:write"]);
  });

  it("l'admin reçoit le droit de conduire ; le comptoir non", async () => {
    const admin = await ctx.prisma.staffRoleDefinition.findUniqueOrThrow({
      where: { key: "admin" },
    });
    const counter = await ctx.prisma.staffRoleDefinition.findUniqueOrThrow({
      where: { key: "comptoir" },
    });

    expect(roleGrantsSchema.parse(admin.grants)).toContainEqual({
      resource: "delivery_driving",
      action: "write",
    });
    expect(
      roleGrantsSchema.parse(counter.grants).some((grant) => grant.resource === "delivery_driving"),
    ).toBe(false);
  });

  it("rejouée, la migration ne duplique rien et ne réécrit pas un rôle existant", async () => {
    await ctx.prisma.staffRoleDefinition.update({
      where: { key: "livreur" },
      data: { label: "Livreur (édité à l'écran)" },
    });

    await seedDriverRole(ctx);

    const role = await ctx.prisma.staffRoleDefinition.findUniqueOrThrow({
      where: { key: "livreur" },
    });
    const admin = await ctx.prisma.staffRoleDefinition.findUniqueOrThrow({
      where: { key: "admin" },
    });
    expect(role.label).toBe("Livreur (édité à l'écran)");
    expect(
      roleGrantsSchema.parse(admin.grants).filter((grant) => grant.resource === "delivery_driving"),
    ).toHaveLength(1);
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
