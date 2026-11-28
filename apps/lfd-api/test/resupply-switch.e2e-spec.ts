/**
 * E2E de **l'interrupteur du réassort** — Réglages › Production › Fournil,
 * global, éteint par défaut (décidé par Hugo le 2026-11-28 ;
 * `reassort-boutiques/plan-interrupteur-du-reassort.md`).
 *
 * Ce qui ne s'éprouve qu'ici : le défaut sans ligne, le refus des écritures
 * par le vrai serveur alors que les lectures passent, et la lecture ouverte
 * sous chacun des quatre droits quand la pose reste à `production_settings:write`.
 */
import type { ResupplySwitchView } from "@lfd/contracts";
import type request from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

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

function admin(): request.Agent {
  return ctx.asSub(E2E_STAFF_SUB);
}

/** Un rôle créé à l'écran, qui ne tient que ces droits, et une personne qui le porte. */
async function holderOf(
  key: string,
  grants: readonly { resource: string; action: string }[],
): Promise<request.Agent> {
  await admin().post("/admin/staff-roles").send({ key, label: key, grants }).expect(201);
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

async function seedSite(): Promise<string> {
  const site = await ctx.prisma.site.create({
    data: {
      label: "Val Village",
      ligne1: "1 place",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
    },
    select: { id: true },
  });
  return site.id;
}

/** Une écriture du réassort que le garde arbitre avant tout contrôle du corps. */
function createTemplate(siteId: string): request.Test {
  return admin().post(`/admin/resupply-templates/sites/${siteId}`).send({});
}

describe("l'interrupteur du réassort", () => {
  it("jamais posé : éteint, sans auteur, et aucune ligne en base", async () => {
    const view = jsonBody<ResupplySwitchView>(
      await admin().get("/admin/resupply-switch").expect(200),
    );

    expect(view).toEqual({ enabled: false, updatedAt: null, updatedBy: null });
    expect(await ctx.prisma.resupplySwitch.count()).toBe(0);
  });

  it("éteint : une écriture du réassort est refusée (409), la lecture passe", async () => {
    const siteId = await seedSite();

    const refused = await createTemplate(siteId).expect(409);
    expect(refused.body).toMatchObject({ code: "resupply.disabled" });
    await admin().get(`/admin/resupply-templates/sites/${siteId}`).expect(200);
    await admin().get(`/admin/site-resupplies/sites/${siteId}`).expect(200);
  });

  it("éteint : finir un réassort déjà envoyé passe le garde (recevoir, monté, annuler)", async () => {
    const siteId = await seedSite();
    const unknown = "resupply_inconnu";

    // Le garde laisse passer : la réponse est celle du cas, jamais le 409 de l'interrupteur.
    const finishing = [
      admin().post(`/admin/resupply-receipts/${siteId}/resupplies/${unknown}/receive`).send({}),
      admin().post(`/admin/bakehouse-resupplies/sites/${siteId}/${unknown}/mounted`).send({}),
      admin().post(`/admin/site-resupplies/sites/${siteId}/${unknown}/cancel`).send({}),
    ];
    for (const call of finishing) {
      const response = await call;
      expect(response.body).not.toMatchObject({ code: "resupply.disabled" });
    }
  });

  it("allumé : l'écriture passe le garde ; réécrit, il reste une seule ligne", async () => {
    const siteId = await seedSite();

    await admin().put("/admin/resupply-switch").send({ enabled: true }).expect(204);
    const view = jsonBody<ResupplySwitchView>(
      await admin().get("/admin/resupply-switch").expect(200),
    );
    expect(view.enabled).toBe(true);
    expect(view.updatedAt).not.toBeNull();
    expect(view.updatedBy).not.toBeNull();

    // Corps vide : la validation répond 400, preuve que le garde a laissé passer.
    await createTemplate(siteId).expect(400);

    await admin().put("/admin/resupply-switch").send({ enabled: false }).expect(204);
    await createTemplate(siteId).expect(409);
    expect(await ctx.prisma.resupplySwitch.count()).toBe(1);
  });

  it("refuse une charge mal formée (400)", async () => {
    await admin().put("/admin/resupply-switch").send({ enabled: "oui" }).expect(400);
    await admin().put("/admin/resupply-switch").send({}).expect(400);
    expect(await ctx.prisma.resupplySwitch.count()).toBe(0);
  });

  it.each(["production_settings", "production_resupply", "handover_counter", "resupply_templates"])(
    "lisible sous %s:read, mais pas posable sans production_settings:write (403)",
    async (resource) => {
      const reader = await holderOf(`lecture-${resource.replaceAll("_", "-")}`, [
        { resource, action: "read" },
      ]);

      await reader.get("/admin/resupply-switch").expect(200);
      await reader.put("/admin/resupply-switch").send({ enabled: true }).expect(403);
    },
  );

  it("sans aucun des quatre droits, ni lire ni poser (403)", async () => {
    const other = await holderOf("autre", [{ resource: "lfc_order_settings", action: "write" }]);

    await other.get("/admin/resupply-switch").expect(403);
    await other.put("/admin/resupply-switch").send({ enabled: true }).expect(403);
  });

  it("sous production_settings:write, la pose passe", async () => {
    const writer = await holderOf("reglages-fournil", [
      { resource: "production_settings", action: "write" },
    ]);

    await writer.put("/admin/resupply-switch").send({ enabled: true }).expect(204);
  });
});
