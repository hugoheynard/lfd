/**
 * E2E du **dossier du jour en PDF** (plan
 * `documentation/production/plan-envoi-du-dossier.md`, E1) : la route sert le
 * papier d'une journée arrêtée, et refuse celui d'une journée ouverte — il se
 * lit dans ce que la journée a figé, et une journée ouverte n'a rien figé.
 */
import { Buffer } from "node:buffer";

import { ProductionDayRepository } from "../src/production/domain/ports/production-day.repository.js";
import { pdfPages } from "../src/production/domain/services/__tests__/pdf-text.js";
import { ServiceDay } from "../src/production/domain/value-objects/service-day.value-object.js";
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

/** Télécharge le dossier et rend son texte, page par page. */
async function dossierPages(): Promise<readonly string[]> {
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
  return Buffer.isBuffer(response.body) ? pdfPages(response.body) : [];
}

describe("le bon figé à l'arrêt (E1b)", () => {
  it("la clôture fige ce que le commerce a résolu, et la journée le relit de la base", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    await closePlan(ctx);

    const day = await ctx.app.get(ProductionDayRepository).load(ServiceDay.of(SERVICE_DAY));
    // Une commande sans société, au retrait : la personne tient la raison
    // sociale, le point nommé précède l'adresse.
    expect(day.orders[0]?.sheetDetails).toEqual({
      tradeName: "",
      legalName: "Camille Durand",
      pickupLabel: "Boutique",
      address: { line1: "12 rue du Test", line2: "", postalCode: "73150", city: "Val d'Isère" },
      window: null,
      contact: null,
      signatureRequired: false,
      note: "",
      recurring: false,
    });
  });

  it("le dossier imprime le bon figé", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    await closePlan(ctx);

    const pages = await dossierPages();
    expect(pages[1]).toContain("Camille Durand");
    expect(pages[1]).toContain("Boutique");
    expect(pages[1]).toContain("73150 Val d'Isère");
  });

  it("une journée arrêtée avant le lot (colonnes vides) garde le rendu d'avant, sans « undefined »", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    await closePlan(ctx);
    // Ce qu'aucun geste ne produit plus : une ligne figée par le binaire d'avant.
    await ctx.prisma.productionOrder.updateMany({
      where: { serviceDay: SERVICE_DAY },
      data: { legalName: null, pickupLabel: null, addressLine1: null, addressCity: null },
    });

    const pages = await dossierPages();
    expect(pages[1]).toContain("Camille Durand");
    expect(pages.join("")).not.toMatch(/undefined/);
  });
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
