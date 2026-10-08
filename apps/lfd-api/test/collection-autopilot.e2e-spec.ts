/**
 * E2E de la **constitution automatique** (plan
 * `documentation/facturation/plan-prelevement-automatique.md`, PA3).
 *
 * Ce que seul le vrai SQL prouve : le passage constitue sous l'auteur
 * `system` (le CHECK tient « aucune fiche staff »), les avis partent comme
 * pour le bouton, et la clé (entité, clôture) interdit une seconde tentative
 * — même après l'annulation du lot.
 *
 * 🔴 Aucun courriel ne part : le mailer est un double qui enregistre.
 *
 * ⚠️ Commandes, mandats et contacts écrits par Prisma : même dette que
 * `collection-batches.e2e-spec.ts`. Aucune date absolue : la clôture est le
 * dernier 1er du mois atteint, calculé par le domaine, et l'horloge FIXE est
 * posée relativement à elle.
 */
import type { CollectionCycleView, LegalEntityView } from "@lfd/contracts";

import type { CollectionAutopilotReport } from "../src/b2b/accounting/application/commands/run-collection-autopilot.command.js";
import { cycleToConstitute } from "../src/b2b/accounting/domain/services/billing-cycle.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const ICS = "FR72ZZZ123456";
const DEBTOR_RIB = {
  iban: "FR7630004000031234567890143",
  bic: "BNPAFRPP",
  holder: "Client e2e",
  line1: "1 rue du Test",
  line2: "",
  postalCode: "73000",
  city: "Chambéry",
  countryCode: "FR",
};
const BASE = "/admin/accounting/collection";
const ENTITIES = "/admin/accounting/legal-entities";
const AUTOPILOT = `${BASE}/autopilot`;

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

const sentMails: string[] = [];
/** Enregistre le destinataire. Rien ne part. */
const recordingMailer = {
  enabled: true,
  send: (args: { readonly to: string }): Promise<{ providerId: null }> => {
    sentMails.push(args.to);
    return Promise.resolve({ providerId: null });
  },
};

const clock = new FixedClock(new Date());
let ctx: E2eContext;
let seq = 0;
let closesAt: Date;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: MAILER, value: recordingMailer },
      { token: Clock, value: clock },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  sentMails.splice(0);
  closesAt = cycleToConstitute(new Date(daysAgo(0)), null).closesAt;
  // Deux heures après la clôture : passé le délai d'une heure par défaut.
  clock.set(new Date(closesAt.getTime() + 2 * HOUR_MS));
  await ctx.prisma.collectionFloor.create({
    data: { id: true, floorAt: new Date(closesAt.getTime() - 30 * DAY_MS) },
  });
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

/** Une entité ; complète (ICS + compte) sauf demande contraire, automatisme activé. */
async function entity(options: { readonly complete: boolean } = { complete: true }) {
  const response = await staff()
    .post(ENTITIES)
    .send({
      name: "La Folie Douce",
      legalForm: "SAS",
      siren: "552100554",
      rcs: "Chambéry B 552 100 554",
      shareCapitalCents: 1_000_000,
      vatNumber: "FR89552100554",
      address: {
        line1: "12 rue du Fournil",
        line2: "",
        postalCode: "73000",
        city: "Chambéry",
        countryCode: "FR",
      },
    })
    .expect(201);
  const id = jsonBody<{ id: string }>(response).id;
  if (options.complete) {
    await staff().put(`${ENTITIES}/${id}/creditor-identifier`).send({ ics: ICS }).expect(204);
    await staff()
      .put(`${ENTITIES}/${id}/creditor-account`)
      .send({ ...DEBTOR_RIB, iban: "FR1420041010050500013M02606", holder: "La Folie Douce" })
      .expect(204);
  }
  await staff().put(`${ENTITIES}/${id}/auto-collection`).send({ enabled: true }).expect(204);
  return id;
}

/** Un payeur avec mandat B2B actif, un détenteur joignable, et un bon du mois clos. */
async function payerWithOrder(entityId: string): Promise<void> {
  seq += 1;
  const company = await createCompany(ctx.prisma, { raisonSociale: "Boulangerie du Port" });
  await staff().put(`/admin/companies/${company.id}/bank-account`).send(DEBTOR_RIB).expect(204);
  await ctx.prisma.paymentMandate.create({
    data: {
      companyId: company.id,
      creditorId: entityId,
      reference: `RUM-AUTO-${String(seq)}`,
      status: "active",
      acceptedAt: new Date(closesAt.getTime() - 60 * DAY_MS),
      scheme: "B2B",
      paymentType: "recurrent",
    },
  });
  const owner = await createUser(ctx.prisma, {
    auth0Sub: `auto-owner-${String(seq)}`,
    email: "patron@port.test",
  });
  await attachTo(ctx.prisma, owner.id, company.id, CustomerRole.owner);
  await ctx.prisma.order.create({
    data: {
      orderNumber: `CMD-AUTO-${String(seq)}`,
      companyId: company.id,
      placedByUserId: owner.id,
      subtotalCents: 10_000,
      totalCents: 10_550,
      vatCents: 550,
      paymentStatus: "not_required",
      createdAt: new Date(closesAt.getTime() - 2 * DAY_MS),
      vatShares: [{ rate: 5.5, amountCents: 550 }],
      lines: {
        create: {
          sku: "PAIN-AUTO",
          productNameSnapshot: "Pain de l'automatisme",
          unitPriceMillicents: 10_000_000,
          vatRate: 5.5,
          quantity: 1,
          lineTotalCents: 10_000,
        },
      },
    },
  });
}

/** Un passage du cron, jeton présenté ; attend la livraison des avis. */
async function pass(): Promise<CollectionAutopilotReport> {
  const response = await ctx
    .http()
    .post(AUTOPILOT)
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  await ctx.drain();
  return jsonBody<CollectionAutopilotReport>(response);
}

async function cycle(entityId: string): Promise<CollectionCycleView> {
  return jsonBody<CollectionCycleView>(
    await staff().get(`${BASE}/cycle?legalEntityId=${entityId}`).expect(200),
  );
}

async function fiche(entityId: string): Promise<LegalEntityView> {
  return jsonBody<LegalEntityView>(await staff().get(`${ENTITIES}/${entityId}`).expect(200));
}

describe("la constitution automatique (PA3)", () => {
  it("prépare le lot sous l'auteur `system`, envoie les avis et range sa tentative", async () => {
    const id = await entity();
    await payerWithOrder(id);

    const report = await pass();

    expect(report.runs).toEqual([
      { legalEntityId: id, cycleClosesAt: closesAt.toISOString(), outcome: "constituted" },
    ]);
    const batch = await ctx.prisma.collectionBatch.findFirstOrThrow({
      where: { legalEntityId: id },
    });
    expect(batch).toMatchObject({ constitutedBy: "system", constitutedByStaffId: null });
    const notice = await ctx.prisma.collectionNotice.findFirstOrThrow({
      where: { batchId: batch.id },
    });
    expect(notice.status).toBe("sent");
    expect(sentMails).toEqual(["patron@port.test"]);
    expect((await cycle(id)).batches[0]?.constitutedBy).toBe("system");
    const constituted = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "collection.batch_constituted", subjectId: batch.id },
    });
    expect(constituted).toMatchObject({ actorType: "system", actorId: "collection-autopilot" });
    const ran = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "collection.autopilot_ran", subjectId: id },
    });
    expect(ran.payload).toMatchObject({ outcome: "constituted", batchCount: 1, message: null });
    expect((await fiche(id)).lastAutopilotRun).toMatchObject({
      cycleClosesAt: closesAt.toISOString(),
      outcome: "constituted",
      message: null,
    });
  });

  it("un second passage du même cycle ne fait rien", async () => {
    const id = await entity();
    await payerWithOrder(id);
    await pass();

    const second = await pass();

    expect(second.runs).toEqual([]);
    expect(await ctx.prisma.collectionBatch.count({ where: { legalEntityId: id } })).toBe(1);
    expect(await ctx.prisma.collectionAutopilotRun.count()).toBe(1);
  });

  it("annuler le lot ne relance pas l'automatisme : reconstituer reste un geste humain", async () => {
    const id = await entity();
    await payerWithOrder(id);
    await pass();
    const batch = await ctx.prisma.collectionBatch.findFirstOrThrow({
      where: { legalEntityId: id },
    });
    await staff().post(`${BASE}/batches/${batch.id}/cancel`).expect(204);

    expect((await pass()).runs).toEqual([]);
    const live = await ctx.prisma.collectionBatch.count({
      where: { legalEntityId: id, status: { not: "cancelled" } },
    });
    expect(live).toBe(0);
  });

  it("le bouton prépare toujours sous une fiche staff", async () => {
    const id = await entity();
    await payerWithOrder(id);

    await staff().post(`${BASE}/batches`).send({ legalEntityId: id }).expect(201);

    const batch = await ctx.prisma.collectionBatch.findFirstOrThrow({
      where: { legalEntityId: id },
    });
    expect(batch.constitutedBy).toBe("staff");
    expect(batch.constitutedByStaffId).not.toBeNull();
    expect((await cycle(id)).batches[0]?.constitutedBy).toBe("staff");
  });

  it("avant l'heure prévue, ou automatisme désactivé : rien, pas même une trace", async () => {
    const id = await entity();
    await payerWithOrder(id);
    clock.set(new Date(closesAt.getTime() + HOUR_MS / 2));
    expect((await pass()).runs).toEqual([]);

    clock.set(new Date(closesAt.getTime() + 2 * HOUR_MS));
    await staff().put(`${ENTITIES}/${id}/auto-collection`).send({ enabled: false }).expect(204);
    expect((await pass()).runs).toEqual([]);

    expect(await ctx.prisma.collectionAutopilotRun.count()).toBe(0);
    expect(await ctx.prisma.collectionBatch.count()).toBe(0);
  });

  it("un refus est rangé `failed` avec son message, et ne se retente pas", async () => {
    const id = await entity({ complete: false });

    expect((await pass()).runs.map((run) => run.outcome)).toEqual(["failed"]);
    expect((await pass()).runs).toEqual([]);

    const run = await ctx.prisma.collectionAutopilotRun.findFirstOrThrow();
    expect(run.outcome).toBe("failed");
    expect(run.message).not.toBeNull();
    expect((await fiche(id)).lastAutopilotRun).toMatchObject({
      outcome: "failed",
      message: run.message,
    });
  });

  it("rien à prélever : rangé, pas une erreur", async () => {
    await entity();

    expect((await pass()).runs.map((run) => run.outcome)).toEqual(["nothing_to_collect"]);
  });

  it("refuse sans jeton interne (401)", async () => {
    await ctx.http().post(AUTOPILOT).expect(401);
  });
});
