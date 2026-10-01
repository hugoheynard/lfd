/**
 * E2E du **rôle `livreur`** (`documentation/livraisons/plan-ma-tournee.md`,
 * MT1, MT-D1 v2) — le rôle est créé À L'ÉCRAN, par la vraie route des rôles
 * (sa migration a été retirée le 2026-10-01, `plan-droits-par-geste.md`,
 * DG-D6), et ce qu'il ouvre se lit sur les vraies routes.
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

describe("le rôle `livreur`, créé à l'écran", () => {
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
