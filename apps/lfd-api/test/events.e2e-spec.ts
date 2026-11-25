/**
 * E2E **les événements et leurs fiches de fonction**
 * (`documentation/evenements/plan-evenements.md`, E1–E2).
 *
 * Ce que seul le vrai SQL et le vrai stockage prouvent :
 * - le schéma `events` et ses `CHECK` (applications connues, PDF seul) ;
 * - la table archivés exclus, plus proche d'abord, fiches retirées non comptées ;
 * - le dépôt range le PDF au bucket du fournil et le sert à l'identique ;
 * - un dépôt rejoué sous la même clé ne range qu'une fiche ;
 * - un Excel est refusé avec le geste de sortie ;
 * - le retrait archive sans effacer ;
 * - le mur de la ressource `events`.
 *
 * Doublée : la signature du jeton staff.
 */
import type { EventCreated, EventDetailView, EventSummaryView } from "@lfd/contracts";

import { ProductionDocumentStore } from "../src/platform/storage/production-document-store.js";
import { staffWithRole } from "./delivery-driver-scene.js";
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
const XLSX = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
const READER_ROLE = {
  key: "lecteur-evenements",
  label: "Lecteur des événements",
  grants: [{ resource: "events", action: "read" }],
} as const;

const OTHER_ROLE = {
  key: "lecteur-commandes",
  label: "Lecteur des commandes",
  grants: [{ resource: "b2b_orders", action: "read" }],
} as const;

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

async function create(name: string, date: string, key = nextKey()): Promise<string> {
  const response = await admin()
    .post(ROUTE)
    .set("Idempotency-Key", key)
    .send({ name, date })
    .expect(201);
  return jsonBody<EventCreated>(response).id;
}

function deposit(
  eventId: string,
  bytes: Buffer,
  fileName: string,
  contentType: string,
  key = nextKey(),
) {
  return admin()
    .post(`${ROUTE}/${eventId}/function-sheets`)
    .set("Idempotency-Key", key)
    .attach("file", bytes, { filename: fileName, contentType });
}

async function detail(eventId: string): Promise<EventDetailView> {
  return jsonBody<EventDetailView>(await admin().get(`${ROUTE}/${eventId}`).expect(200));
}

describe("l'événement", () => {
  it("se crée une fois par intention, pour lafoliecoffee, et se relit au détail", async () => {
    const date = serviceDay(10);
    const key = nextKey();
    const id = await create("Salon du chocolat", date, key);
    expect(await create("Salon du chocolat", date, key)).toBe(id);

    expect(await ctx.prisma.event.count()).toBe(1);
    await expect(detail(id)).resolves.toEqual({
      id,
      name: "Salon du chocolat",
      date,
      applications: ["lafoliecoffee"],
      archivedAt: null,
      functionSheets: [],
    });
  });

  it("refuse un nom vide (400) sans rien écrire", async () => {
    const response = await admin()
      .post(ROUTE)
      .set("Idempotency-Key", nextKey())
      .send({ name: "  ", date: serviceDay(3) });
    expect(response.status).toBe(400);
    expect(await ctx.prisma.event.count()).toBe(0);
  });

  it("se renomme et se déplace", async () => {
    const id = await create("Salon", serviceDay(10));
    await admin()
      .patch(`${ROUTE}/${id}`)
      .send({ name: "Mariage", date: serviceDay(11) })
      .expect(204);
    await expect(detail(id)).resolves.toMatchObject({ name: "Mariage", date: serviceDay(11) });
  });

  it("s'archive sans s'effacer, et un second archivage garde le premier instant", async () => {
    const id = await create("Salon", serviceDay(10));
    await admin().delete(`${ROUTE}/${id}`).expect(204);
    const first = (await ctx.prisma.event.findUniqueOrThrow({ where: { id } })).archivedAt;
    await admin().delete(`${ROUTE}/${id}`).expect(204);
    expect(first).not.toBeNull();
    expect((await ctx.prisma.event.findUniqueOrThrow({ where: { id } })).archivedAt).toEqual(first);
    await admin().delete(`${ROUTE}/inconnu`).expect(404);
  });

  it("la table : archivés exclus, plus proche d'abord, fiches retirées non comptées", async () => {
    const far = await create("Lointain", serviceDay(30));
    const near = await create("Proche", serviceDay(2));
    const past = await create("Passé", serviceDay(-5));
    const archived = await create("Archivé", serviceDay(1));
    await admin().delete(`${ROUTE}/${archived}`).expect(204);
    const sheet = jsonBody<{ id: string }>(
      await deposit(near, PDF, "a.pdf", "application/pdf").expect(201),
    ).id;
    await deposit(near, PDF, "b.pdf", "application/pdf").expect(201);
    await admin().delete(`${ROUTE}/${near}/function-sheets/${sheet}`).expect(204);

    const rows = jsonBody<EventSummaryView[]>(await admin().get(ROUTE).expect(200));
    expect(rows.map((row) => row.id)).toEqual([near, far, past]);
    expect(rows[0]?.functionSheetCount).toBe(1);

    const windowed = jsonBody<EventSummaryView[]>(
      await admin()
        .get(ROUTE)
        .query({ from: serviceDay(0), to: serviceDay(10) })
        .expect(200),
    );
    expect(windowed.map((row) => row.id)).toEqual([near]);
  });

  it("🔴 le CHECK refuse une application inconnue, même écrite en direct", async () => {
    const id = await create("Salon", serviceDay(10));
    await expect(
      ctx.prisma.event.update({ where: { id }, data: { applications: ["vitrine"] } }),
    ).rejects.toThrow(/event_applications_known/u);
    await expect(
      ctx.prisma.event.update({ where: { id }, data: { applications: [] } }),
    ).rejects.toThrow(/event_applications_not_empty/u);
  });
});

describe("les fiches de fonction", () => {
  it("se déposent en PDF, une fois par intention, et se servent à l'identique", async () => {
    const eventId = await create("Salon", serviceDay(10));
    const key = nextKey();
    const first = jsonBody<{ id: string }>(
      await deposit(eventId, PDF, "deroule.pdf", "application/pdf", key).expect(201),
    ).id;
    const again = jsonBody<{ id: string }>(
      await deposit(eventId, PDF, "deroule.pdf", "application/pdf", key).expect(201),
    ).id;
    expect(again).toBe(first);

    const view = await detail(eventId);
    expect(view.functionSheets).toMatchObject([
      { id: first, fileName: "deroule.pdf", sizeBytes: PDF.length },
    ]);
    const row = await ctx.prisma.functionSheet.findUniqueOrThrow({ where: { id: first } });
    expect(await ctx.app.get(ProductionDocumentStore).readIfPresent(row.storageKey)).toEqual(PDF);

    const served = await admin()
      .get(`${ROUTE}/${eventId}/function-sheets/${first}`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(served.headers["content-type"]).toBe("application/pdf");
    expect(served.headers["content-disposition"]).toMatch(/^attachment/u);
    expect(served.body).toEqual(PDF);
  });

  it("🔴 refuse un Excel en disant d'exporter en PDF, sans rien écrire", async () => {
    const eventId = await create("Salon", serviceDay(10));
    const refused = await deposit(
      eventId,
      XLSX,
      "deroule.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(refused.status).toBe(400);
    expect(jsonBody<{ message: string }>(refused).message).toMatch(
      /Exportez la fiche en PDF depuis Excel/u,
    );
    expect(await ctx.prisma.functionSheet.count()).toBe(0);
  });

  it("🔴 refuse le dépôt sur un événement archivé (409)", async () => {
    const eventId = await create("Salon", serviceDay(10));
    await admin().delete(`${ROUTE}/${eventId}`).expect(204);
    const refused = await deposit(eventId, PDF, "a.pdf", "application/pdf");
    expect(refused.status).toBe(409);
    expect(await ctx.prisma.functionSheet.count()).toBe(0);
  });

  it("se retirent sans s'effacer : la ligne reste, le détail et le téléchargement ne la servent plus", async () => {
    const eventId = await create("Salon", serviceDay(10));
    const id = jsonBody<{ id: string }>(
      await deposit(eventId, PDF, "a.pdf", "application/pdf").expect(201),
    ).id;

    await admin().delete(`${ROUTE}/${eventId}/function-sheets/${id}`).expect(204);
    await admin().delete(`${ROUTE}/${eventId}/function-sheets/${id}`).expect(204);

    expect((await detail(eventId)).functionSheets).toEqual([]);
    const row = await ctx.prisma.functionSheet.findUniqueOrThrow({ where: { id } });
    expect(row.archivedAt).not.toBeNull();
    expect(await ctx.app.get(ProductionDocumentStore).readIfPresent(row.storageKey)).toEqual(PDF);
    await admin().get(`${ROUTE}/${eventId}/function-sheets/${id}`).expect(404);
  });
});

describe("le mur de la ressource `events`", () => {
  it("un lecteur lit la table, mais ne crée pas", async () => {
    await admin().post("/admin/staff-roles").send(READER_ROLE).expect(201);
    const reader = await staffWithRole(ctx, "lecteur", READER_ROLE.key);
    await reader.agent.get(ROUTE).expect(200);
    await reader.agent
      .post(ROUTE)
      .set("Idempotency-Key", nextKey())
      .send({ name: "Salon", date: serviceDay(3) })
      .expect(403);
  });

  it("un membre sans le droit ne lit rien", async () => {
    await admin().post("/admin/staff-roles").send(OTHER_ROLE).expect(201);
    const stranger = await staffWithRole(ctx, "sans-droit", OTHER_ROLE.key);
    await stranger.agent.get(ROUTE).expect(403);
  });
});
