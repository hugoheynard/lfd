/**
 * E2E **les fiches de fonction au dossier du jour**
 * (`documentation/evenements/plan-evenements.md`, « L'impression dans le
 * dossier » et « Une version plus récente d'une fiche »).
 *
 * Ce que seuls le vrai SQL, le vrai stockage et le vrai câblage prouvent :
 * - le dossier d'un jour qui a un événement joint ses fiches à la fin, et le
 *   folio compte leurs pages ;
 * - chaque tirage lit les fiches EN VIGUEUR : une fiche remplacée après
 *   l'arrêt sort dans sa version nouvelle à l'extrait suivant ;
 * - la fenêtre d'impression dit qu'une fiche imprimée par #N a été remplacée.
 *
 * Doublée : la signature du jeton staff.
 */
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import type { EventCreated } from "@lfd/contracts";

import { pdfPages } from "../src/platform/pdf/__tests__/pdf-text.js";
import {
  depositedPdf,
  pageCountOf,
} from "../src/platform/pdf/__tests__/function-sheet-pdf.fixture.js";
import type { ProductionPrintOptionsView } from "../src/production/plan/application/queries/get-print-options.query.js";
import { DOSSIER_PARTS } from "../src/production/plan/domain/services/day-dossier-selection.js";
import { jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
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

const BATCH = `/admin/production/batch/${SERVICE_DAY}`;

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

function staff() {
  return ctx.asSub(STAFF);
}

async function declareEvent(name: string, date = SERVICE_DAY): Promise<string> {
  const response = await staff()
    .post("/admin/events")
    .set("Idempotency-Key", randomUUID())
    .send({ name, date })
    .expect(201);
  return jsonBody<EventCreated>(response).id;
}

async function deposit(eventId: string, fileName: string, pages: number): Promise<string> {
  const response = await staff()
    .post(`/admin/events/${eventId}/function-sheets`)
    .set("Idempotency-Key", randomUUID())
    .attach("file", await depositedPdf(fileName, pages), {
      filename: fileName,
      contentType: "application/pdf",
    })
    .expect(201);
  return jsonBody<{ id: string }>(response).id;
}

async function replace(eventId: string, sheetId: string, fileName: string, pages: number) {
  await staff()
    .post(`/admin/events/${eventId}/function-sheets/${sheetId}/replacement`)
    .set("Idempotency-Key", randomUUID())
    .attach("file", await depositedPdf(fileName, pages), {
      filename: fileName,
      contentType: "application/pdf",
    })
    .expect(201);
}

async function downloaded(route: string): Promise<Buffer> {
  const response = await staff()
    .get(route)
    .buffer()
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        callback(null, Buffer.concat(chunks));
      });
    })
    .expect(200);
  if (!Buffer.isBuffer(response.body)) {
    throw new TypeError(`${route} n'a pas rendu d'octets`);
  }
  return response.body;
}

describe("les fiches de fonction au dossier du jour", () => {
  it("joint à la fin un intercalaire et les pages des fiches, comptées par le folio", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    const eventId = await declareEvent("Mariage Dupont");
    await deposit(eventId, "deroule.pdf", 2);
    await deposit(eventId, "buffet.pdf", 1);
    // Un autre jour : ses fiches n'entrent pas.
    await deposit(await declareEvent("Salon", serviceDay(8)), "autre.pdf", 4);
    await closePlan(ctx);

    const whole = await downloaded(`${BATCH}/dossier.pdf`);
    // Les fiches seules : le BL du jour naît en tâche de fond après l'arrêt,
    // si bien que le reste du dossier n'a pas un compte de pages stable.
    const sheets = await downloaded(`${BATCH}/dossier.pdf?parts=functionSheets`);

    const total = await pageCountOf(whole);
    expect(await pageCountOf(sheets)).toBe(1 + 3);
    expect(total).toBeGreaterThan(1 + 3);
    const text = pdfPages(whole).join("\n");
    expect(text).toContain("Événement : Mariage Dupont");
    expect(text).toContain("1. deroule.pdf");
    expect(text).toContain("2. buffet.pdf");
    expect(text).not.toContain("autre.pdf");
    expect(text).toContain(`${String(total)}/${String(total)}`);
  });

  it("une fiche remplacée après l'arrêt sort dans sa version nouvelle à l'extrait suivant", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    const eventId = await declareEvent("Mariage Dupont");
    const sheetId = await deposit(eventId, "deroule.pdf", 2);
    await closePlan(ctx);
    await downloaded(`${BATCH}/dossier.pdf`);

    await replace(eventId, sheetId, "deroule-v2.pdf", 3);
    const extract = await downloaded(`${BATCH}/dossier.pdf?parts=functionSheets`);

    expect(await pageCountOf(extract)).toBe(1 + 3);
    const text = pdfPages(extract).join("\n");
    expect(text).toContain("deroule-v2.pdf");
    expect(text).not.toContain("1. deroule.pdf");
  });

  it("la fenêtre liste les fiches du jour et dit qu'une fiche imprimée par #1 a été remplacée", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    const eventId = await declareEvent("Mariage Dupont");
    const sheetId = await deposit(eventId, "deroule.pdf", 1);
    await staff()
      .post(`${BATCH}/provisional-print`)
      .set("Idempotency-Key", randomUUID())
      .send({ parts: [...DOSSIER_PARTS], groups: "all", orders: { kind: "all" } })
      .expect(201);

    await replace(eventId, sheetId, "deroule-v2.pdf", 1);
    const view = jsonBody<ProductionPrintOptionsView>(
      await staff().get(`${BATCH}/print-options`).expect(200),
    );

    expect(view.functionSheets?.map((sheet) => sheet.fileName)).toEqual(["deroule-v2.pdf"]);
    expect(view.prints.map((print) => print.functionSheetsReplaced)).toEqual([true]);
  });
});
