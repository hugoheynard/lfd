/**
 * E2E de la **simulation du catalogue en production** (plan
 * `fournil/les-postes-du-fournil.md`, § 3.11), sur le vrai Postgres jetable.
 *
 * Ce que seule cette suite prouve : la route sous `production_workstations`,
 * la forme du mode et des sous-catégories refusée en 400, le PDF rangé dans le mode demandé sur le
 * vrai miroir du commerce, et rien d'écrit en base.
 */
import type { CreatedIdResponse } from "@lfd/contracts";
import type request from "supertest";

import { pdfPages } from "../src/platform/pdf/__tests__/pdf-text.js";
import { ADMIN_VERIFIER_OVERRIDE, admin } from "./delivery-rounds-scene.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";

const WORKSTATIONS = "/admin/production/workstations";
const SIMULATION = "/admin/production/simulation.pdf";

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

/** Le corps brut : supertest ne parse pas un PDF tout seul. */
function getPdf(agent: request.Agent, path: string): request.Test {
  return agent
    .get(path)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        callback(null, Buffer.concat(chunks));
      });
    });
}

/** Le texte du PDF, le tiret cadratin WinAnsi (0x97) rendu en « — ». */
function textOf(response: request.Response): string {
  const body: unknown = response.body;
  const bytes = Buffer.isBuffer(body) ? body : Buffer.alloc(0);
  return pdfPages(bytes)
    .map((page) => page.replaceAll("\u0097", "—"))
    .join("\n");
}

async function counts(): Promise<readonly number[]> {
  return [
    await ctx.prisma.productionDay.count(),
    await ctx.prisma.productionOrder.count(),
    await ctx.prisma.productionDossierDispatch.count(),
    await ctx.prisma.productionDisplaySettings.count(),
    await ctx.prisma.productionWorkstationProduct.count(),
    await ctx.prisma.activityEvent.count(),
  ];
}

describe("GET /admin/production/simulation.pdf", () => {
  it("mode boutique : un PDF rangé par rayon, marqué simulation", async () => {
    const response = await getPdf(admin(ctx), `${SIMULATION}?mode=shelf`).expect(200);

    expect(response.headers["content-type"]).toContain("application/pdf");
    const text = textOf(response);
    expect(text).toContain("SIMULATION — ne pas produire");
    expect(text).toContain("mode boutique");
    expect(text).toContain("Viennoiseries");
  });

  it("mode prod, quel que soit le réglage : rangé par poste, sans rien écrire", async () => {
    const pastry = jsonBody<CreatedIdResponse>(
      await admin(ctx)
        .post(WORKSTATIONS)
        .set(INTENT_KEY, freshIntent())
        .send({ name: "Pâtisserie" })
        .expect(201),
    ).id;
    await admin(ctx)
      .put(`${WORKSTATIONS}/placements`)
      .set(INTENT_KEY, freshIntent())
      .send({ productSkus: ["VIE-001"], workstationId: pastry })
      .expect(204);
    const before = await counts();

    const response = await getPdf(admin(ctx), `${SIMULATION}?mode=workstation`).expect(200);

    const text = textOf(response);
    expect(text).toContain("mode prod");
    expect(text).toContain("Pâtisserie");
    expect(text).toContain("à ranger");
    expect(await counts()).toEqual(before);
  });

  it("sous-catégories choisies à la demande, sans toucher au réglage", async () => {
    const before = await counts();

    for (const shown of ["true", "false"]) {
      const response = await getPdf(
        admin(ctx),
        `${SIMULATION}?mode=shelf&showSubcategories=${shown}`,
      ).expect(200);
      expect(textOf(response)).toContain("SIMULATION — ne pas produire");
    }
    expect(await counts()).toEqual(before);
  });

  it("400 sur un mode inconnu ou un affichage des sous-catégories mal formé", async () => {
    await admin(ctx).get(`${SIMULATION}?mode=bakery`).expect(400);
    await admin(ctx).get(SIMULATION).expect(400);
    await admin(ctx).get(`${SIMULATION}?mode=shelf&showSubcategories=oui`).expect(400);
  });

  it("403 sans la ressource des postes", async () => {
    await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: "support",
        email: "support@lfc.test",
        role: "support",
        status: "active",
        auth0Id: "staff-support",
      },
    });

    await ctx.asSub("staff-support").get(`${SIMULATION}?mode=shelf`).expect(403);
  });
});
