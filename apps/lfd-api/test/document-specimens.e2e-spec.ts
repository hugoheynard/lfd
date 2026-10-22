/**
 * E2E de la **planche des documents** (Comptabilité) — les exemplaires que
 * chaque bloc sert sous `admin/document-specimens/`
 * (`documentation/comptabilite/planche-des-documents.md`).
 *
 * Ce que seul l'e2e prouve : les huit contrôleurs montés dans leurs quatre
 * blocs — le référentiel compris, hors de son préfixe `/pim` —, le même mur
 * (`b2b_accounting:read`), les en-têtes servis, et que rien ne s'écrit — ni
 * commande, ni facture, ni mandat, ni journée de fabrication.
 */
import { Buffer } from "node:buffer";

import type request from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (subject: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject, scopes: [] }),
};

const BASE = "/admin/document-specimens";
const DOCUMENTS = [
  "order-sheet-pro.pdf",
  "order-sheet-public.pdf",
  "invoice.pdf",
  "atelier-sheet.pdf",
  "round-paper.pdf",
  "sepa-mandate-b2b.pdf",
  "sepa-mandate-core.pdf",
  "order-summary.pdf",
  "allergen-matrix.pdf",
  "production-count.pdf",
  "day-dossier.pdf",
] as const;

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

/** Le corps brut : supertest ne parse pas un PDF tout seul. */
function getPdf(agent: ReturnType<E2eContext["asSub"]>, document: string): request.Test {
  return agent
    .get(`${BASE}/${document}`)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        callback(null, Buffer.concat(chunks));
      });
    });
}

async function counts(): Promise<readonly number[]> {
  return [
    await ctx.prisma.order.count(),
    await ctx.prisma.invoice.count(),
    await ctx.prisma.paymentMandate.count(),
    await ctx.prisma.productionDay.count(),
  ];
}

describe("GET /admin/document-specimens/*", () => {
  it.each(DOCUMENTS)("%s : un PDF non vide, servi en ligne", async (document) => {
    const response = await getPdf(ctx.asSub("staff-e2e"), document).expect(200);

    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain("inline");
    const body: unknown = response.body;
    expect(Buffer.isBuffer(body)).toBe(true);
    const bytes = Buffer.isBuffer(body) ? body : Buffer.alloc(0);
    expect(bytes.length).toBeGreaterThan(1_000);
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("n'écrit rien : ni commande, ni facture, ni mandat, ni journée de fabrication", async () => {
    const before = await counts();

    for (const document of DOCUMENTS) {
      await getPdf(ctx.asSub("staff-e2e"), document).expect(200);
    }

    expect(await counts()).toEqual(before);
  });

  it.each(DOCUMENTS)("%s : 401 sans jeton", async (document) => {
    await ctx.http().get(`${BASE}/${document}`).expect(401);
  });

  it("403 sans la lecture comptable", async () => {
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
    const support = ctx.asSub("staff-support");

    for (const document of DOCUMENTS) {
      await support.get(`${BASE}/${document}`).expect(403);
    }
  });
});
