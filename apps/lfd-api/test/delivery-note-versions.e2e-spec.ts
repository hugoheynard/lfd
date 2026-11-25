/**
 * **Les versions du bon de livraison, et l'historique d'un départ partiel**
 * (`documentation/commandes/reliquat/reliquat.md`,
 * § 7) — sur le vrai Postgres.
 *
 * Ce que seul le vrai chemin prouve : le dépôt fige la version d'un bon à sa
 * naissance et à la décision du départ, dans la transaction de l'écriture ;
 * le PDF d'une version se rend de la version figée seule, sans tracer
 * d'impression ; les versions ne changent ni la Σ des BL ni le facturable ;
 * l'historique de la commande dit le signal, la décision, l'impression et la
 * lettre, avec qui et quand. Et la table refuse ce que sa migration interdit.
 *
 * Mailer doublé ; instants relus, jamais écrits en dur.
 */
import { Buffer } from "node:buffer";

import type { ActivityEventView, AdminDeliveryNoteView, AdminOrderView } from "@lfd/contracts";
import type request from "supertest";

import { MAILER } from "../src/mail/templates/mailer.tokens.js";
import type { Prisma } from "../src/platform/database/client/client.js";
import { pdfPages } from "../src/platform/pdf/__tests__/pdf-text.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { handOver } from "./order-factory.js";
import { bootstrapProductionDay, closeOrder, STAFF } from "./production-day-fixture.js";
import { accountOrder, decide, report, type Drawn } from "./shortfall-decision-scene.js";

const recordingMailer = {
  enabled: true,
  send: (): Promise<{ providerId: null }> => Promise.resolve({ providerId: null }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay([{ token: MAILER, value: recordingMailer }]));
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const notesPath = (orderId: string): string => `/admin/orders/${orderId}/delivery-notes`;

async function notesOf(orderId: string): Promise<readonly AdminDeliveryNoteView[]> {
  return jsonBody<readonly AdminDeliveryNoteView[]>(
    await ctx.asSub(STAFF).get(notesPath(orderId)).expect(200),
  );
}

/** Le corps brut : supertest ne parse pas un PDF tout seul. */
function getPdf(path: string): request.Test {
  return ctx
    .asSub(STAFF)
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

async function pdfText(path: string): Promise<string> {
  const response = await getPdf(path).expect(200);
  const body: unknown = response.body;
  return pdfPages(Buffer.isBuffer(body) ? body : Buffer.alloc(0)).join("\n");
}

/** Une commande de 3 croissants, 1 au bac, le manque signalé et le départ décidé. */
async function decidedOrder(): Promise<Drawn> {
  const order = await accountOrder(ctx, 1);
  expect(await report(ctx, order.id)).toBe(204);
  expect((await decide(ctx, order.id)).status).toBe(204);
  return order;
}

describe("les versions du bon (B4b.1, B4b.2)", () => {
  it("fige le BL né (v1) et le BL du départ décidé (v2), dans l'ordre", async () => {
    const order = await decidedOrder();

    const [note] = await notesOf(order.id);
    expect(note?.versions.map((v) => [v.version, v.cause])).toEqual([
      [1, "born"],
      [2, "departure_decided"],
    ]);
    expect(note?.originKept).toBe(true);
    const [born, decided] = note?.versions ?? [];
    expect(Date.parse(decided?.recordedAt ?? "")).toBeGreaterThanOrEqual(
      Date.parse(born?.recordedAt ?? ""),
    );
    // La v1 a figé le contenu d'avant la décision : 3 croissants, rien de non livré.
    const rows = await ctx.prisma.deliveryNoteVersion.findMany({
      where: { note: { orderId: order.id } },
      orderBy: { contentVersion: "asc" },
    });
    expect(rows.map((row) => row.contentVersion)).toEqual([1, 2]);
    expect(rows[0]?.rendered).toMatchObject({
      note: { lines: [{ quantity: 3 }] },
      undelivered: [],
    });
    expect(rows[1]?.rendered).toMatchObject({
      note: { lines: [{ quantity: 1 }] },
      undelivered: [{ quantity: 2 }],
    });
  });

  it("rend le PDF de la v1 depuis la version figée, sans enregistrer d'impression", async () => {
    const order = await decidedOrder();
    const [note] = await notesOf(order.id);
    const number = note?.number ?? "";

    const original = await pdfText(`${notesPath(order.id)}/${number}/editions/1/client.pdf`);
    const final = await pdfText(`${notesPath(order.id)}/${number}/editions/2/client.pdf`);

    expect(original).not.toContain("Non livré");
    expect(final).toContain("Non livré");
    const row = await ctx.prisma.deliveryNote.findFirstOrThrow({ where: { orderId: order.id } });
    expect(row.printedAt).toBeNull();
    expect(await ctx.prisma.activityEvent.count({ where: { type: "delivery_note.printed" } })).toBe(
      0,
    );
  });

  it("une version absente répond 404 « non conservée »", async () => {
    const order = await decidedOrder();
    const [note] = await notesOf(order.id);

    const response = await ctx
      .asSub(STAFF)
      .get(`${notesPath(order.id)}/${note?.number ?? ""}/editions/7/client.pdf`)
      .expect(404);
    expect(response.body).toMatchObject({ code: "delivery_notes.version.not_kept" });
  });

  it("les versions ne changent ni la Σ des BL ni le facturable", async () => {
    const order = await decidedOrder();
    expect(await closeOrder(ctx, order.id)).toBe(204);
    await ctx.drain();
    await handOver(ctx, order);

    const notes = await ctx.prisma.deliveryNote.findMany({
      where: { orderId: order.id },
      include: { lines: true },
    });
    expect(notes).toHaveLength(1);
    expect(notes.flatMap((n) => n.lines).reduce((sum, line) => sum + line.quantity, 0)).toBe(1);
    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.billableTotalCents).toBe(notes[0]?.totalCents);
    // Ni la préparation ni la remise ne changent le contenu : pas de troisième version.
    expect(await ctx.prisma.deliveryNoteVersion.count()).toBe(2);
    const fiche = jsonBody<AdminOrderView>(
      await ctx.asSub(STAFF).get(`/admin/orders/${order.id}`).expect(200),
    );
    expect(fiche.billable).toMatchObject({
      totalCents: row.billableTotalCents,
      subtotalCents: row.billableSubtotalCents,
    });
    expect(fiche.shortfall?.decision).toMatchObject({
      departing: [{ quantity: 1, saleUnit: "piece" }],
    });
    expect(fiche.shortfall?.decision?.decidedByName).not.toBeUndefined();
  });
});

describe("l'historique d'un départ partiel (B4b.3)", () => {
  it("dit le signal, la décision, l'impression et la lettre, avec qui et quand", async () => {
    const order = await decidedOrder();
    const [note] = await notesOf(order.id);
    await getPdf(`${notesPath(order.id)}/${note?.number ?? ""}/client.pdf`).expect(200);
    await ctx
      .asSub(STAFF)
      .post(`/admin/orders/${order.id}/shortfall-letter`)
      .send({ message: "Il manque deux croissants." })
      .expect(204);
    await ctx.drain();

    const events = jsonBody<readonly ActivityEventView[]>(
      await ctx.asSub(STAFF).get(`/admin/orders/${order.id}/history`).expect(200),
    );
    const byType = (type: string): ActivityEventView | undefined =>
      events.find((event) => event.type === type);
    expect(byType("order.shortfall_reported")?.payload).toMatchObject({
      subjectLabel: order.orderNumber,
      rank: 1,
      lines: [{ due: 3, packed: 1 }],
    });
    expect(byType("order.shortfall_reported")?.payload["reportedBy"]).toBeDefined();
    expect(byType("order.shortfall_decided")).toBeDefined();
    expect(byType("delivery_note.printed")).toMatchObject({
      actorType: "staff",
      payload: { noteNumber: note?.number, contentVersion: 2 },
    });
    expect(byType("order.shortfall_letter_sent")).toMatchObject({
      actorType: "staff",
      payload: { subjectLabel: order.orderNumber },
    });
    for (const event of events) {
      expect(Number.isNaN(Date.parse(event.occurredAt))).toBe(false);
    }
  });

  it("deux signaux gardent deux lignes ; une seconde lettre est refusée et n'en écrit pas", async () => {
    const order = await accountOrder(ctx, 1);
    expect(await report(ctx, order.id)).toBe(204);
    expect(await report(ctx, order.id)).toBe(204);
    expect((await decide(ctx, order.id)).status).toBe(204);
    const letter = (): request.Test =>
      ctx
        .asSub(STAFF)
        .post(`/admin/orders/${order.id}/shortfall-letter`)
        .send({ message: "Il manque deux croissants." });
    await letter().expect(204);
    await letter().expect(409);

    const count = (type: string): Promise<number> =>
      ctx.prisma.activityEvent.count({ where: { type, subjectId: order.id } });
    expect(await count("order.shortfall_reported")).toBe(2);
    expect(await count("order.shortfall_letter_sent")).toBe(1);
  });
});

describe("la table des versions (migration 20261125150000)", () => {
  it("refuse une cause inconnue, un doublon de version et un bon inexistant", async () => {
    const order = await decidedOrder();
    const note = await ctx.prisma.deliveryNote.findFirstOrThrow({ where: { orderId: order.id } });
    let sequence = 0;
    const row = (
      over: Partial<Prisma.DeliveryNoteVersionUncheckedCreateInput>,
    ): Prisma.DeliveryNoteVersionUncheckedCreateInput => {
      sequence += 1;
      return {
        id: `v_schema_${String(sequence)}`,
        deliveryNoteId: note.id,
        contentVersion: 9,
        rendered: {},
        cause: "replanned",
        recordedAt: note.plannedAt,
        ...over,
      };
    };

    await expect(
      ctx.prisma.deliveryNoteVersion.create({ data: row({ cause: "printed" }) }),
    ).rejects.toThrow(/delivery_note_version_cause_known/);
    await expect(
      ctx.prisma.deliveryNoteVersion.create({ data: row({ contentVersion: 1 }) }),
    ).rejects.toThrow();
    await expect(
      ctx.prisma.deliveryNoteVersion.create({ data: row({ deliveryNoteId: "dn_absent" }) }),
    ).rejects.toThrow();
    await expect(
      ctx.prisma.deliveryNoteVersion.create({ data: row({ rendered: [] }) }),
    ).rejects.toThrow(/delivery_note_version_rendered_object/);
  });
});
