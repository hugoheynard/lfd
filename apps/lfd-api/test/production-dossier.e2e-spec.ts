/**
 * E2E du **dossier du jour en PDF** (plan
 * `documentation/fournil/dossier-prod-du-jour.md`, E1) : la route sert le
 * papier d'une journée arrêtée, et refuse celui d'une journée ouverte — il se
 * lit dans ce que la journée a figé, et une journée ouverte n'a rien figé.
 */
import { Buffer } from "node:buffer";

import { DossierDispatchLog } from "../src/production/plan/domain/ports/dossier-dispatch.log.js";
import { ProductionDayRepository } from "../src/production/day/domain/ports/production-day.repository.js";
import { pdfPages } from "../src/platform/pdf/__tests__/pdf-text.js";
import { ServiceDay } from "../src/production/day/domain/value-objects/service-day.value-object.js";
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
async function dossierPages(query = ""): Promise<readonly string[]> {
  const response = await ctx
    .asSub(STAFF)
    .get(`${ROUTE}${query}`)
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
      // La tranche choisie à la passation (obligatoire depuis le 2026-10-14).
      window: { start: "07:00", end: "08:00" },
      contact: null,
      signatureRequired: false,
      note: "",
      recurring: false,
    });
  });

  it("le dossier imprime le bon figé", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    await closePlan(ctx);

    // La page de la fiche, cherchée par son titre : la couverture et une page
    // par rayon la précèdent depuis la nouvelle mise en page (2026-10-25).
    const sheet = orderSheetPage(await dossierPages());
    expect(sheet).toContain("Camille Durand");
    expect(sheet).toContain("Boutique");
    expect(sheet).toContain("73150 Val d'Isère");
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
    expect(orderSheetPage(pages)).toContain("Camille Durand");
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

describe("GET admin/production/batch/:date/dossier.pdf?parts=…&orders=… — un extrait du dossier figé", () => {
  it("ne tire que les fiches de commande, sans ranger l'extrait à la place du dossier", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    await closePlan(ctx);

    const extract = await dossierPages("?parts=orders");
    expect(extract.length).toBeGreaterThan(0);
    expect(extract.every((page) => !page.includes("Dossier de production du"))).toBe(true);
    expect(orderSheetPage(extract)).not.toBe("");

    const whole = await dossierPages();
    expect(whole[0]).toContain("Dossier de production du");
    expect(whole.length).toBeGreaterThan(extract.length);
  });

  it("refuse (400) une partie inconnue, en nommant le paramètre", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    await closePlan(ctx);
    await ctx.asSub(STAFF).get(`${ROUTE}?parts=menu`).expect(400);
  });

  it("refuse (400) une commande que la journée figée ne porte pas", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    await closePlan(ctx);
    const response = await ctx.asSub(STAFF).get(`${ROUTE}?orders=ord_inconnue`).expect(400);
    expect(jsonBody<{ message: string }>(response).message).toContain("ord_inconnue");
  });

  it("refuse (409) un extrait d'une journée qui n'est pas arrêtée", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    await ctx.asSub(STAFF).get(`${ROUTE}?parts=orders`).expect(409);
  });
});

/** La page de la fiche de commande, par son titre « … — Fiche de commande ». */
function orderSheetPage(pages: readonly string[]): string {
  return pages.find((page) => page.includes("Fiche de commande")) ?? "";
}

describe("la trace d'envoi : une issue, une fois", () => {
  /** Régression : `settle` écrivait sur la clé seule et écrasait une issue déjà posée. */
  it("un settle rejoué ne réécrit pas une issue déjà posée", async () => {
    const log = ctx.app.get(DossierDispatchLog);
    const slot = { serviceDay: SERVICE_DAY, occasionAt: new Date(), recipientId: "rcp_1" };
    expect(await log.claim(slot, "Marie Dupont", new Date())).toBe(true);

    await log.settle(slot, { kind: "sent", providerId: "prov_1" }, new Date());
    await log.settle(slot, { kind: "failed", failure: "rejoué" }, new Date());

    expect(await ctx.prisma.productionDossierDispatch.findMany()).toMatchObject([
      { outcome: "sent", providerId: "prov_1", failure: null },
    ]);
  });
});
