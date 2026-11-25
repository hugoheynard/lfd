/**
 * E2E **une version plus récente d'une fiche de fonction**
 * (`documentation/evenements/plan-evenements.md`, « Une version plus récente
 * d'une fiche »).
 *
 * Ce que seul le vrai SQL et le vrai stockage prouvent :
 * - l'ancienne s'archive et reste au stockage, la nouvelle prend son rang —
 *   l'unicité partielle du rang le permet, parmi les fiches en vigueur seulement ;
 * - un remplacement rejoué sous la même clé ne range qu'une version ;
 * - refus : événement archivé (409), fiche inconnue (404), fiche retirée (409).
 *
 * Doublée : la signature du jeton staff.
 */
import type { EventCreated, EventDetailView } from "@lfd/contracts";

import { ProductionDocumentStore } from "../src/platform/storage/production-document-store.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";

const ROUTE = "/admin/events";
const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n", "latin1");
const NEWER = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%v2\n%%EOF\n", "latin1");

let ctx: E2eContext;
let keySeq = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

function admin() {
  return ctx.asSub(E2E_STAFF_SUB);
}

/** Une clé d'intention au format attendu (UUID), distincte à chaque appel. */
function nextKey(): string {
  keySeq += 1;
  return `00000000-0000-4000-8000-${String(keySeq).padStart(12, "0")}`;
}

async function create(): Promise<string> {
  const response = await admin()
    .post(ROUTE)
    .set("Idempotency-Key", nextKey())
    .send({ name: "Salon", date: serviceDay(10) })
    .expect(201);
  return jsonBody<EventCreated>(response).id;
}

async function deposit(eventId: string, fileName: string): Promise<string> {
  const response = await admin()
    .post(`${ROUTE}/${eventId}/function-sheets`)
    .set("Idempotency-Key", nextKey())
    .attach("file", PDF, { filename: fileName, contentType: "application/pdf" })
    .expect(201);
  return jsonBody<{ id: string }>(response).id;
}

function replace(eventId: string, sheetId: string, key = nextKey()) {
  return admin()
    .post(`${ROUTE}/${eventId}/function-sheets/${sheetId}/replacement`)
    .set("Idempotency-Key", key)
    .attach("file", NEWER, { filename: "a-v2.pdf", contentType: "application/pdf" });
}

async function detail(eventId: string): Promise<EventDetailView> {
  return jsonBody<EventDetailView>(await admin().get(`${ROUTE}/${eventId}`).expect(200));
}

describe("remplacer une fiche de fonction", () => {
  it("archive l'ancienne, gardée au stockage ; la nouvelle prend son rang, une fois par intention", async () => {
    const eventId = await create();
    const first = await deposit(eventId, "a.pdf");
    const second = await deposit(eventId, "b.pdf");
    const key = nextKey();
    const newer = jsonBody<{ id: string }>(await replace(eventId, first, key).expect(201)).id;
    const again = jsonBody<{ id: string }>(await replace(eventId, first, key).expect(201)).id;
    expect(again).toBe(newer);

    expect((await detail(eventId)).functionSheets.map((s) => [s.id, s.fileName])).toEqual([
      [newer, "a-v2.pdf"],
      [second, "b.pdf"],
    ]);
    const store = ctx.app.get(ProductionDocumentStore);
    const old = await ctx.prisma.functionSheet.findUniqueOrThrow({ where: { id: first } });
    const row = await ctx.prisma.functionSheet.findUniqueOrThrow({ where: { id: newer } });
    expect(old.archivedAt).not.toBeNull();
    expect(row).toMatchObject({ position: old.position, replacesSheetId: first, archivedAt: null });
    expect(await store.readIfPresent(old.storageKey)).toEqual(PDF);
    expect(await store.readIfPresent(row.storageKey)).toEqual(NEWER);
    expect(await ctx.prisma.functionSheet.count()).toBe(3);

    // Un dépôt neuf prend toujours le plus haut rang + 1.
    const fresh = await deposit(eventId, "c.pdf");
    const freshRow = await ctx.prisma.functionSheet.findUniqueOrThrow({ where: { id: fresh } });
    expect(freshRow.position).toBe(2);
  });

  it("🔴 refuse sur un événement archivé (409), sans rien écrire", async () => {
    const eventId = await create();
    const sheet = await deposit(eventId, "a.pdf");
    await admin().delete(`${ROUTE}/${eventId}`).expect(204);
    expect((await replace(eventId, sheet)).status).toBe(409);
    expect(await ctx.prisma.functionSheet.count()).toBe(1);
  });

  it("404 sur une fiche inconnue, 409 sur une fiche retirée ou déjà remplacée", async () => {
    const eventId = await create();
    expect((await replace(eventId, "absente")).status).toBe(404);

    const retired = await deposit(eventId, "a.pdf");
    await admin().delete(`${ROUTE}/${eventId}/function-sheets/${retired}`).expect(204);
    expect((await replace(eventId, retired)).status).toBe(409);

    const replaced = await deposit(eventId, "b.pdf");
    await replace(eventId, replaced).expect(201);
    expect((await replace(eventId, replaced)).status).toBe(409);
    expect(await ctx.prisma.functionSheet.count()).toBe(3);
  });
});
