/**
 * E2E des **droits par geste** — `b2b_orders` découpé
 * (`documentation/livraisons/droits/plan-droits-par-geste.md`, DG-D1, 5.1, 5.1 bis,
 * 5.3), éprouvé route par route, en vrai HTTP.
 *
 * `b2b_orders` ouvrait cinq métiers : coliser emportait le droit de passer une
 * commande, et la comptabilité pouvait coliser. Chaque cas ci-dessous pose un
 * rôle créé À L'ÉCRAN (`POST /admin/staff-roles`, en administrateur) qui ne
 * tient QU'UN geste, et vérifie qu'il ouvre ses routes et elles seules.
 *
 * Un geste ouvert se lit « pas 403 » : la garde passe, et ce qui suit (données
 * absentes, corps invalide) n'est pas le sujet. Un geste fermé se lit 403 :
 * le refus de la garde, avant tout pipe.
 */
import type { RoleGrant } from "@lfd/contracts";
import type request from "supertest";

import { bootstrapE2e, E2E_STAFF_SUB, serviceDay, type E2eContext } from "./e2e-harness.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";

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
});

/** Un rôle créé à l'écran, qui ne tient que ces droits, et une personne qui le porte. */
async function holderOf(key: string, grants: readonly RoleGrant[]): Promise<request.Agent> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .post("/admin/staff-roles")
    .send({ key, label: key, grants })
    .expect(201);
  const sub = `staff-${key}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: key,
      email: `${key}@lfc.test`,
      role: null,
      roleKey: key,
      status: "active",
      auth0Id: sub,
    },
  });
  return ctx.asSub(sub);
}

type Call = (agent: request.Agent) => request.Test;

const ROUTES = {
  placeOrder: (agent) => agent.post("/admin/orders").send({}),
  quote: (agent) => agent.post("/admin/orders/quote").send({}),
  draft: (agent) => agent.get("/admin/order-drafts/societe-inconnue"),
  listOrders: (agent) => agent.get("/admin/orders"),
  orderDayVersion: (agent) => agent.get(`/admin/orders/day-version?date=${DAY}`),
  batch: (agent) => agent.get(`/admin/production/batch?date=${DAY}`),
  dayStatus: (agent) => agent.get(`/admin/production/batch/${DAY}/status`),
  worksheet: (agent) => agent.get(`/admin/production/worksheet?date=${DAY}`),
  packing: (agent) => agent.get(`/admin/packing/${DAY}/board`),
  packingSheet: (agent) => agent.get("/admin/production/packing/CMD-INCONNUE"),
  packed: (agent) => agent.post(`/admin/packing/${DAY}/orders/commande-inconnue/close`),
  version: (agent) => agent.get(`/admin/production/version?date=${DAY}`),
  handoverQueue: (agent) => agent.get(`/admin/handover/file?jour=${DAY}`),
  binsOfOrder: (agent) => agent.get("/admin/livraison/colisage/bacs?commande=CMD-INCONNUE"),
  binSheet: (agent) => agent.get("/admin/livraison/colisage/bacs/bac-inconnu"),
  proposal: (agent) => agent.get("/admin/livraison/colisage/proposition?commande=CMD-INCONNUE"),
  procedure: (agent) =>
    agent.get("/admin/companies/societe-inconnue/delivery-addresses/adresse-inconnue/procedure"),
} satisfies Record<string, Call>;

type RouteName = keyof typeof ROUTES;

async function statusOf(agent: request.Agent, route: RouteName): Promise<number> {
  return (await ROUTES[route](agent)).status;
}

/** Les routes qu'un porteur DOIT atteindre, et celles qui lui restent fermées. */
async function expectGates(
  agent: request.Agent,
  open: readonly RouteName[],
  closed: readonly RouteName[],
): Promise<void> {
  for (const route of open) {
    expect({ route, status: await statusOf(agent, route) }).not.toEqual({ route, status: 403 });
  }
  for (const route of closed) {
    expect({ route, status: await statusOf(agent, route) }).toEqual({ route, status: 403 });
  }
}

describe("un geste, ses routes et elles seules", () => {
  it("🔴 le colisage seul colise, lit la version — et prend 403 pour passer une commande", async () => {
    const agent = await holderOf("colisage-seul", [
      { resource: "production_packing", action: "write" },
    ]);

    await expectGates(
      agent,
      ["packing", "packingSheet", "packed", "version", "binsOfOrder", "proposal"],
      ["placeOrder", "quote", "draft", "listOrders", "batch", "dayStatus", "worksheet"],
    );
  });

  it("🔴 passer une commande seul : devis, brouillon, passation — pas de colisage", async () => {
    const agent = await holderOf("commande-seule", [
      { resource: "b2b_place_order", action: "write" },
    ]);

    await expectGates(
      agent,
      ["placeOrder", "quote", "draft"],
      ["packing", "packed", "binsOfOrder", "handoverQueue", "version", "listOrders"],
    );
  });

  it("passer une commande exige l'ÉCRITURE : une lecture n'ouvre même pas le brouillon", async () => {
    const agent = await holderOf("commande-lue", [{ resource: "b2b_place_order", action: "read" }]);

    await expectGates(agent, [], ["placeOrder", "quote", "draft"]);
  });

  it("le plan du soir seul : l'état, le lot du jour — pas la fiche d'atelier", async () => {
    const agent = await holderOf("plan-seul", [{ resource: "production_plan", action: "read" }]);

    await expectGates(agent, ["batch", "dayStatus", "version"], ["worksheet", "packing", "packed"]);
  });

  it("la fiche d'atelier seule : la fiche — pas l'état de la journée", async () => {
    const agent = await holderOf("fiche-seule", [
      { resource: "production_worksheet", action: "read" },
    ]);

    await expectGates(agent, ["worksheet", "version"], ["dayStatus", "batch", "packing"]);
  });

  it("le retrait seul : la file et la version du fournil — pas les commandes", async () => {
    const agent = await holderOf("retrait-seul", [
      { resource: "handover_counter", action: "read" },
    ]);

    await expectGates(
      agent,
      ["handoverQueue", "version"],
      ["listOrders", "placeOrder", "packing", "worksheet"],
    );
  });

  /**
   * Régression (audit `documentation/livraisons/audit-2026-10-07.md`, B6) : le
   * poste de retrait relit sa file sur la version des commandes, que seul
   * `b2b_orders:read` ouvrait — un rôle « retrait seul » prenait un 403 avalé
   * toutes les 15 s. Une version de journée n'est pas une commande.
   */
  it("🔴 le retrait seul lit la version des commandes — pas les commandes", async () => {
    const agent = await holderOf("retrait-version", [
      { resource: "handover_counter", action: "read" },
    ]);

    expect(await statusOf(agent, "orderDayVersion")).toBe(200);
    await expectGates(agent, [], ["listOrders"]);
  });

  it("🔴 lire les commandes n'ouvre plus aucun geste du fournil ni du retrait", async () => {
    const agent = await holderOf("commandes-seules", [{ resource: "b2b_orders", action: "write" }]);

    await expectGates(
      agent,
      ["listOrders"],
      ["placeOrder", "quote", "draft", "batch", "worksheet", "packing", "handoverQueue", "version"],
    );
  });

  it("le panneau « Bacs » s'ouvre au chargement comme au colisage — en écriture", async () => {
    const loader = await holderOf("chargement-seul", [
      { resource: "delivery_loading", action: "write" },
    ]);
    const packingReader = await holderOf("colisage-lu", [
      { resource: "production_packing", action: "read" },
    ]);

    await expectGates(loader, ["binsOfOrder", "proposal"], ["packing"]);
    // Lire le colisage n'est pas le faire : le panneau reste fermé (5.3).
    await expectGates(packingReader, ["packing", "version"], ["binsOfOrder", "proposal", "packed"]);
  });

  /**
   * 2026-10-02 : la fiche d'un bac — celle qu'ouvre son QR — se LIT. Elle
   * demandait l'écriture, que l'écran ne demandait pas : à qui lisait, la page
   * s'ouvrait sur un 403. Le panneau, lui, reste fermé (cas précédent).
   */
  it("🔴 la fiche d'un bac se lit sous le colisage OU le chargement, en lecture", async () => {
    const packingReader = await holderOf("colisage-lu", [
      { resource: "production_packing", action: "read" },
    ]);
    const loadingReader = await holderOf("chargement-lu", [
      { resource: "delivery_loading", action: "read" },
    ]);
    const ordersReader = await holderOf("commandes-lues", [
      { resource: "b2b_orders", action: "read" },
    ]);

    await expectGates(packingReader, ["binSheet"], ["binsOfOrder"]);
    await expectGates(loadingReader, ["binSheet"], ["binsOfOrder"]);
    await expectGates(ordersReader, [], ["binSheet"]);
  });

  it("🔴 la procédure de livraison a son droit : la fiche client ne l'ouvre plus", async () => {
    const companies = await holderOf("fiche-seule-client", [
      { resource: "b2b_companies", action: "write" },
    ]);
    const procedures = await holderOf("procedures-seules", [
      { resource: "delivery_procedures", action: "read" },
    ]);

    await expectGates(companies, [], ["procedure"]);
    await expectGates(procedures, ["procedure"], []);
  });
});
