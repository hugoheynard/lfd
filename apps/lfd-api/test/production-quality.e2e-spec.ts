import { randomUUID } from "node:crypto";
/**
 * E2E : **le contrôle qualité du superviseur** (plan
 * `documentation/production/plan-controle-qualite.md`, lot QC2), sur le vrai
 * Postgres jetable et le vrai MinIO.
 *
 * Ce que seule cette suite prouve :
 *
 * - les CHECK et l'unicité de la migration tiennent sous le vrai SQL ;
 * - la photo déposée est DÉPLACÉE dans le vrai bucket, et servie telle quelle ;
 * - le droit : `read` voit la pastille, pas la note ni la photo (D3) ;
 * - le journal est écrit dans la transaction, et un journal en panne annule le
 *   verdict (D9) ;
 * - l'idempotence par `id` à travers HTTP (D8).
 */
import type {
  ProductionPackingView,
  QualityBoardView,
  QualityChecksView,
  QualityPhotoUploaded,
} from "@lfd/contracts";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { settleCardPayments } from "./card-payments.js";
import { jpegOf } from "./delivery-procedure-scene.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";
import { storageKeys } from "./storage.js";

const MEMBER = "auth0|member-quality";
const READER = "staff-supervision-lecture";
const REFUSAL = "e2e_journal_qualite_en_panne";
const DAY = serviceDay();
const CROISSANT = "VIE-001";
const BAGUETTE = "PAI-001";
const PHOTO = jpegOf(40, 30);
const BASE = "/admin/supervision/quality";

const SITE = {
  label: "Boutique",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

/** Signature du jeton staff doublée : le jeton porteur EST le `sub`. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let intentCount = 0;
const issuedIntents: string[] = [];
const fakeGateway = {
  createIntent: () => {
    intentCount += 1;
    const id = `pi_e2e_quality_${String(intentCount)}`;
    issuedIntents.push(id);
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: fakeGateway },
    ],
  });
});

afterAll(async () => {
  await repairJournal();
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await repairJournal();
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
});

const admin = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

let sequence = 0;
/** Un ULID d'essai, distinct à chaque appel — l'écran en tire un par geste. */
function ulid(): string {
  sequence += 1;
  return `01JQC${String(sequence).padStart(21, "0")}`;
}

async function place(lines: readonly { sku: string; quantity: number }[]): Promise<void> {
  const point = await ctx.prisma.pickupAddress.findFirst({ select: { id: true } });
  const id =
    point?.id ?? (await ctx.prisma.pickupAddress.create({ data: { ...SITE, isDefault: true } })).id;
  await ctx
    .asSub(MEMBER)
    .post(`/orders`)
    .send({
      idempotencyKey: randomUUID(),
      companyId: null,
      requestedDeliveryDate: DAY,
      fulfillmentMethod: "pickup",
      pickupAddressId: id,
      note: "",
      lines,
    })
    .expect(201);
  await settleCardPayments(ctx, issuedIntents);
}

/**
 * Deux commandes — l'une de croissants, colisée ; l'autre de croissants et de
 * baguettes, pas colisée —, et la journée arrêtée. Rend l'id de chacune.
 */
async function seedDay(): Promise<{ packed: string; open: string }> {
  await place([{ sku: CROISSANT, quantity: 12 }]);
  await place([
    { sku: CROISSANT, quantity: 4 },
    { sku: BAGUETTE, quantity: 2 },
  ]);
  await admin().post(`/admin/production/batch/${DAY}/close`).expect(201);
  await admin()
    .put(`/admin/production/worksheet/${DAY}/lines/${CROISSANT}/done`)
    .send({ initials: "KA" })
    .expect(204);
  const orders = await ctx.prisma.productionOrder.findMany({
    where: { serviceDay: DAY },
    select: { orderId: true, reference: true, lines: { select: { sku: true } } },
  });
  const single = orders.find((order) => order.lines.length === 1);
  const mixed = orders.find((order) => order.lines.length === 2);
  if (single === undefined || mixed === undefined) {
    throw new Error(`La journée du ${DAY} n'a pas les deux commandes attendues.`);
  }
  await admin()
    .put(`/admin/production/packing/${DAY}/sheets/${single.reference}/lines/${CROISSANT}`)
    .send({ initials: "MB" })
    .expect(204);
  await admin()
    .post(`/admin/production/batch/${DAY}/sheets/${single.reference}/packed`)
    .expect(201);
  return { packed: single.orderId, open: mixed.orderId };
}

/** Une fiche `communication` à qui l'on ouvre la Supervision en LECTURE seulement. */
async function readOnlySupervisor(): Promise<void> {
  const row = await ctx.prisma.staffUser.create({
    data: {
      firstName: "Lecture",
      lastName: "Seule",
      email: `${READER}@lfc.test`,
      role: "communication",
      status: "active",
      auth0Id: READER,
    },
  });
  await ctx.prisma.staffPermissionOverride.create({
    data: { staffUserId: row.id, resource: "b2b_supervision", action: "read", effect: "allow" },
  });
}

async function deposit(bytes: Buffer = PHOTO, expected = 201): Promise<string> {
  const response = await admin()
    .post(`${BASE}/photos`)
    .attach("photo", bytes, "controle.jpg")
    .expect(expected);
  return jsonBody<QualityPhotoUploaded>(response).uploadId;
}

interface Verdict {
  readonly id?: string;
  readonly target: { kind: "line"; sku: string } | { kind: "order"; orderId: string };
  readonly verdict: "ok" | "warning" | "blocking";
  readonly note?: string | null;
  readonly uploadIds?: readonly string[];
}

function render(body: Verdict, expected = 201) {
  return admin()
    .post(`${BASE}/checks`)
    .send({
      id: body.id ?? ulid(),
      serviceDay: DAY,
      target: body.target,
      verdict: body.verdict,
      note: body.note ?? null,
      uploadIds: body.uploadIds ?? [],
    })
    .expect(expected);
}

async function board(): Promise<QualityBoardView> {
  return jsonBody<QualityBoardView>(await admin().get(`${BASE}?date=${DAY}`).expect(200));
}

async function facts(prefix = "production_quality.") {
  return ctx.prisma.activityEvent.findMany({
    where: { type: { startsWith: prefix } },
    orderBy: { id: "asc" },
    select: { type: true, subjectId: true, actorId: true, payload: true },
  });
}

async function breakJournal(type: string): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(
    `ALTER TABLE growth.activity_events
       ADD CONSTRAINT ${REFUSAL} CHECK (type <> '${type}') NOT VALID`,
  );
}

async function repairJournal(): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(
    `ALTER TABLE growth.activity_events DROP CONSTRAINT IF EXISTS ${REFUSAL}`,
  );
}

describe("rendre un verdict", () => {
  it("OK, réserve et blocage — la pastille suit le plus récent, la quantité vient du compte", async () => {
    await seedDay();
    await render({ target: { kind: "line", sku: BAGUETTE }, verdict: "ok" });
    await render({ target: { kind: "line", sku: CROISSANT }, verdict: "warning", note: "Pâles" });
    await render({ target: { kind: "line", sku: CROISSANT }, verdict: "blocking", note: "Brûlés" });

    const view = await board();
    expect(view.lines).toEqual([
      expect.objectContaining({ sku: BAGUETTE, verdict: "ok", quantitySeen: 2, stale: false }),
      expect.objectContaining({ sku: CROISSANT, verdict: "blocking", quantitySeen: 16 }),
    ]);
    expect(view.heldOrderIds).toHaveLength(2);
  });

  it("refuse une réserve sans note (400), et la base elle-même refuse une note blanche", async () => {
    await seedDay();
    await render({ target: { kind: "line", sku: CROISSANT }, verdict: "warning" }, 400);

    await expect(
      ctx.prisma.productionQualityCheck.create({
        data: {
          id: "brut",
          serviceDay: DAY,
          targetKind: "line",
          sku: CROISSANT,
          quantitySeen: 1,
          verdict: "blocking",
          note: "   ",
          checkedBy: E2E_STAFF_ID,
          checkedAt: new Date(daysAgo(0)),
        },
      }),
    ).rejects.toThrow(/production_quality_check_note_required/u);
    await expect(ctx.prisma.productionQualityCheck.count()).resolves.toBe(0);
  });

  it("refuse une commande pas encore colisée (409) et une ligne hors compte (404)", async () => {
    const { open } = await seedDay();
    await render({ target: { kind: "order", orderId: open }, verdict: "ok" }, 409);
    await render({ target: { kind: "line", sku: "XXX-999" }, verdict: "ok" }, 404);
  });
});

describe("le poste de colisage voit la retenue (lot PC2)", () => {
  it("un blocage de ligne marque « retenue » les commandes qui la portent, un OK la lève", async () => {
    const { packed, open } = await seedDay();
    const heldOf = async (): Promise<Record<string, boolean | undefined>> => {
      const view = jsonBody<ProductionPackingView>(
        await admin().get(`/admin/production/packing?date=${DAY}`).expect(200),
      );
      return Object.fromEntries(view.sheets.map((sheet) => [sheet.orderId, sheet.qualityHeld]));
    };

    await render({ target: { kind: "line", sku: CROISSANT }, verdict: "blocking", note: "Brûlés" });
    expect(await heldOf()).toEqual({ [packed]: true, [open]: true });

    await render({ target: { kind: "line", sku: CROISSANT }, verdict: "ok" });
    expect(await heldOf()).toEqual({ [packed]: false, [open]: false });
  });
});

describe("l'idempotence par id (D8)", () => {
  it("un rejeu identique rend le même id sans second contrôle ; un autre contenu est refusé (409)", async () => {
    await seedDay();
    const id = ulid();
    const first = await render({ id, target: { kind: "line", sku: CROISSANT }, verdict: "ok" });
    const again = await render({ id, target: { kind: "line", sku: CROISSANT }, verdict: "ok" });

    expect(jsonBody<{ id: string }>(first).id).toBe(id);
    expect(jsonBody<{ id: string }>(again).id).toBe(id);
    await expect(ctx.prisma.productionQualityCheck.count()).resolves.toBe(1);
    expect((await facts()).map((fact) => fact.type)).toEqual(["production_quality.checked"]);

    await render(
      { id, target: { kind: "line", sku: CROISSANT }, verdict: "warning", note: "Autre" },
      409,
    );
  });
});

describe("les photos, déposées puis rattachées (D8)", () => {
  it("le dépôt attend sous quality/pending, le verdict le déplace et le sert en write", async () => {
    const { packed } = await seedDay();
    const upload = await deposit();
    expect(await storageKeys("production")).toContain(`quality/pending/${upload}`);

    const id = ulid();
    await render({
      id,
      target: { kind: "order", orderId: packed },
      verdict: "warning",
      note: "Étiquette décollée",
      uploadIds: [upload],
    });

    const keys = await storageKeys("production");
    expect(keys).toContain(`quality/${DAY}/${id}/0`);
    expect(keys).not.toContain(`quality/pending/${upload}`);
    const served = await admin().get(`${BASE}/checks/${id}/photos/0`).expect(200);
    expect(served.headers["content-type"]).toBe("image/jpeg");
    expect(Buffer.compare(served.body as Buffer, PHOTO)).toBe(0);

    const detail = jsonBody<QualityChecksView>(
      await admin().get(`${BASE}/checks?date=${DAY}`).expect(200),
    );
    expect(detail.checks[0]).toMatchObject({
      id,
      note: "Étiquette décollée",
      photos: [{ position: 0, contentType: "image/jpeg" }],
    });
  });

  it("refuse un format inconnu au dépôt, et un dépôt déjà rattaché au verdict suivant", async () => {
    await seedDay();
    await deposit(Buffer.from("%PDF-1.7"), 400);
    const upload = await deposit();
    await render({ target: { kind: "line", sku: CROISSANT }, verdict: "ok", uploadIds: [upload] });
    await render(
      { target: { kind: "line", sku: CROISSANT }, verdict: "ok", uploadIds: [upload] },
      409,
    );
  });

  it("le balayage retire un dépôt de plus de 24 h jamais rattaché", async () => {
    const upload = await deposit();
    await ctx.prisma.productionQualityUpload.update({
      where: { id: upload },
      data: { uploadedAt: new Date(daysAgo(2)) },
    });

    const report = await ctx
      .http()
      .post("/admin/production/quality/sweep")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);

    expect(jsonBody<{ released: number }>(report).released).toBe(1);
    expect(await storageKeys("production")).not.toContain(`quality/pending/${upload}`);
    await ctx.http().post("/admin/production/quality/sweep").expect(401);
  });
});

describe("le droit (D3)", () => {
  it("read voit la pastille, jamais la note ni la photo ; write est exigé pour juger", async () => {
    const { packed } = await seedDay();
    const upload = await deposit();
    const id = ulid();
    await render({
      id,
      target: { kind: "order", orderId: packed },
      verdict: "blocking",
      note: "Adresse du client visible",
      uploadIds: [upload],
    });
    await readOnlySupervisor();
    const reader = ctx.asSub(READER);

    const pastille = await reader.get(`${BASE}?date=${DAY}`).expect(200);
    expect(JSON.stringify(pastille.body)).not.toContain("Adresse du client");
    await reader.get(`${BASE}/checks?date=${DAY}`).expect(403);
    await reader.get(`${BASE}/checks/${id}/photos/0`).expect(403);
    await reader.post(`${BASE}/photos`).attach("photo", PHOTO, "p.jpg").expect(403);
    await reader
      .post(`${BASE}/checks`)
      .send({
        id: ulid(),
        serviceDay: DAY,
        target: { kind: "order", orderId: packed },
        verdict: "ok",
        note: null,
        uploadIds: [],
      })
      .expect(403);
  });
});

describe("le journal (D9)", () => {
  it("un blocage de ligne nomme les commandes retenues ; un OK le lève — sous la fiche staff", async () => {
    await seedDay();
    await render({ target: { kind: "line", sku: CROISSANT }, verdict: "blocking", note: "Brûlés" });
    await render({ target: { kind: "line", sku: CROISSANT }, verdict: "ok" });

    const written = await facts();
    expect(written.map((fact) => fact.type)).toEqual([
      "production_quality.checked",
      "production_quality.hold_raised",
      "production_quality.checked",
      "production_quality.hold_lifted",
    ]);
    expect(written.every((fact) => fact.actorId === E2E_STAFF_ID)).toBe(true);
    const held = (written[1]?.payload as { heldOrders?: { name?: string }[] }).heldOrders ?? [];
    expect(held.map((order) => order.name?.startsWith("ORD-"))).toEqual([true, true]);
    expect((await board()).heldOrderIds).toEqual([]);
  });

  it("un journal en panne annule le verdict", async () => {
    await seedDay();
    await breakJournal("production_quality.hold_raised");
    await render(
      { target: { kind: "line", sku: CROISSANT }, verdict: "blocking", note: "Brûlés" },
      500,
    );
    await expect(ctx.prisma.productionQualityCheck.count()).resolves.toBe(0);
  });
});
