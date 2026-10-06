/**
 * E2E du **dossier du jour en PDF** (plan
 * `documentation/production/plan-envoi-du-dossier.md`, E1) : la route sert le
 * papier d'une journée arrêtée, et refuse celui d'une journée ouverte — il se
 * lit dans ce que la journée a figé, et une journée ouverte n'a rien figé.
 */
import { Buffer } from "node:buffer";

import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import {
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  STAFF,
  bootstrapProductionDay,
  closePlan,
  place,
} from "./production-day-fixture.js";

const ROUTE = `/admin/production/batch/${SERVICE_DAY}/dossier.pdf`;

let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
});

describe("GET admin/production/batch/:date/dossier.pdf", () => {
  it("sert le dossier d'une journée arrêtée, en PDF à télécharger", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    await closePlan(ctx);

    const response = await ctx
      .asSub(STAFF)
      .get(ROUTE)
      .buffer()
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          callback(null, Buffer.concat(chunks));
        });
      })
      .expect(200);

    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain(`dossier-du-jour-${SERVICE_DAY}`);
    expect(Buffer.isBuffer(response.body)).toBe(true);
    const body = response.body as Buffer;
    expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("refuse (409) le dossier d'une journée qui n'est pas arrêtée, en nommant le geste", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);

    const response = await ctx.asSub(STAFF).get(ROUTE).expect(409);
    expect(jsonBody<{ message: string }>(response).message).toContain("n'est pas arrêtée");
  });
});
