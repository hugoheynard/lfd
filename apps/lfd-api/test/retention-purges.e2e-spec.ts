/**
 * E2E **les purges de la boîte d'envoi (30 jours) et du suivi des e-mails
 * (1 an)** — `documentation/mail/plan-service-e-mails.md`, § 7 —
 * sur la vraie base.
 *
 * Ce que seule cette suite prouve : le SQL des deux règles (un message mort
 * garde tout le message, une demande en attente n'est jamais touchée), la
 * suppression des livraisons avec leur message malgré la clé `RESTRICT`, et
 * que le mode `dry-run` — le défaut, Hugo n'a pas activé la purge au
 * 2026-11-06 — compte juste sans toucher une ligne.
 *
 * Le mode est un RÉGLAGE, pas un provider interne : il est remplacé par
 * suite (`OUTBOX_PURGE_MODE`, `MAIL_REQUEST_PURGE_MODE`), comme une variable
 * d'environnement le ferait, et tout le reste est le vrai chemin.
 *
 * L'ancienneté est relative à maintenant (`daysAgo`) : le `Clock` de l'API lit
 * le même mur.
 */
import { MAIL_REQUEST_PURGE_MODE } from "../src/mail/requests/domain/services/mail-request-retention.js";
import { OUTBOX_PURGE_MODE } from "../src/platform/outbox/outbox-retention.js";
import type { PurgeMode } from "../src/platform/retention/purge-mode.js";
import { bootstrapE2e, daysAgo, type E2eContext } from "./e2e-harness.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const OUTBOX_ROUTE = "/admin/outbox/purge";
const MAIL_ROUTE = "/admin/mail/requests/purge";

interface DeliverySeed {
  readonly subscriber: string;
  readonly deliveredAt: string | null;
}

let ctx: E2eContext;

function modeOverrides(mode: PurgeMode): { token: unknown; value: unknown }[] {
  return [
    { token: OUTBOX_PURGE_MODE, value: mode },
    { token: MAIL_REQUEST_PURGE_MODE, value: mode },
  ];
}

async function seedMessage(id: string, occurredAt: string, deliveries: readonly DeliverySeed[]) {
  await ctx.prisma.outboxMessage.create({
    data: {
      id,
      key: `test.fact:${id}`,
      type: "test.fact",
      payload: {},
      occurredAt: new Date(occurredAt),
      deliveries: {
        create: deliveries.map((delivery) => ({
          subscriber: delivery.subscriber,
          nextAttemptAt: new Date(occurredAt),
          deliveredAt: delivery.deliveredAt === null ? null : new Date(delivery.deliveredAt),
          attempts: delivery.deliveredAt === null ? 10 : 1,
        })),
      },
    },
  });
}

/** Le jeu commun : un livré ancien, un livré récent, un mort ancien, un à moitié livré. */
async function seedOutbox(): Promise<void> {
  await seedMessage("old_delivered", daysAgo(40), [
    { subscriber: "a", deliveredAt: daysAgo(39) },
    { subscriber: "b", deliveredAt: daysAgo(38) },
  ]);
  await seedMessage("recent_delivered", daysAgo(29), [
    { subscriber: "a", deliveredAt: daysAgo(29) },
  ]);
  await seedMessage("old_dead", daysAgo(90), [
    { subscriber: "a", deliveredAt: daysAgo(89) },
    { subscriber: "b", deliveredAt: null },
  ]);
  await seedMessage("old_partly_recent", daysAgo(60), [
    { subscriber: "a", deliveredAt: daysAgo(59) },
    { subscriber: "b", deliveredAt: daysAgo(10) },
  ]);
  await seedMessage("old_without_delivery", daysAgo(60), []);
}

async function seedMailRequest(
  id: string,
  status: string,
  requestedAt: string,
  settledAt: string | null,
): Promise<void> {
  await ctx.prisma.mailRequest.create({
    data: {
      id,
      template: "customer.order-ready",
      brand: "lfc",
      recipient: `${id}@example.test`,
      locale: "fr",
      status,
      idempotencyKey: `key-${id}`,
      requestedAt: new Date(requestedAt),
      sentAt: status === "sent" && settledAt !== null ? new Date(settledAt) : null,
      failedAt: status !== "sent" && settledAt !== null ? new Date(settledAt) : null,
    },
  });
}

async function seedMail(): Promise<void> {
  await seedMailRequest("old_sent", "sent", daysAgo(400), daysAgo(400));
  await seedMailRequest("old_failed", "failed", daysAgo(380), daysAgo(370));
  await seedMailRequest("old_refused", "refused", daysAgo(500), daysAgo(500));
  await seedMailRequest("recent_sent", "sent", daysAgo(364), daysAgo(364));
  await seedMailRequest("old_requested", "requested", daysAgo(700), null);
  // Demandée il y a plus d'un an, mais partie il y a peu : l'issue compte.
  await seedMailRequest("late_sent", "sent", daysAgo(400), daysAgo(30));
}

async function post(route: string): Promise<Record<string, unknown>> {
  const response = await ctx
    .http()
    .post(route)
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  return response.body as Record<string, unknown>;
}

async function outboxIds(): Promise<string[]> {
  const rows = await ctx.prisma.outboxMessage.findMany({
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return rows.map((row) => row.id);
}

async function mailIds(): Promise<string[]> {
  const rows = await ctx.prisma.mailRequest.findMany({
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return rows.map((row) => row.id);
}

describe("les purges, activées (on)", () => {
  beforeAll(async () => {
    ctx = await bootstrapE2e({ overrides: modeOverrides("on") });
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
  });

  it("boîte d'envoi : supprime le seul message livré partout depuis 30 jours, avec ses livraisons", async () => {
    await seedOutbox();

    expect(await post(OUTBOX_ROUTE)).toMatchObject({ mode: "on", eligible: 1, purged: 1 });

    expect(await outboxIds()).toEqual([
      "old_dead",
      "old_partly_recent",
      "old_without_delivery",
      "recent_delivered",
    ]);
    expect(await ctx.prisma.outboxDelivery.count({ where: { eventId: "old_delivered" } })).toBe(0);
    // Idempotent : le passage rejoué ne trouve plus rien.
    expect(await post(OUTBOX_ROUTE)).toMatchObject({ purged: 0, eligible: 0 });
  });

  it("suivi des e-mails : supprime les demandes closes depuis un an, jamais une demande en attente", async () => {
    await seedMail();

    expect(await post(MAIL_ROUTE)).toMatchObject({ mode: "on", eligible: 3, purged: 3 });

    expect(await mailIds()).toEqual(["late_sent", "old_requested", "recent_sent"]);
  });

  it("refuse sans jeton machine", async () => {
    await ctx.http().post(OUTBOX_ROUTE).expect(401);
    await ctx.http().post(MAIL_ROUTE).expect(401);
  });
});

describe("les purges, à blanc (dry-run, le défaut)", () => {
  beforeAll(async () => {
    ctx = await bootstrapE2e({ overrides: modeOverrides("dry-run") });
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
  });

  it("compte ce qu'elles supprimeraient, et ne suppriment rien", async () => {
    await seedOutbox();
    await seedMail();

    const outbox = await post(OUTBOX_ROUTE);
    const mail = await post(MAIL_ROUTE);

    expect(outbox).toMatchObject({ mode: "dry-run", eligible: 1, purged: 0 });
    // La plus ancienne éligible est le message semé il y a 40 jours.
    const drift = new Date(String(outbox["oldest"])).getTime() - new Date(daysAgo(40)).getTime();
    expect(Math.abs(drift)).toBeLessThan(60_000);
    expect(mail).toMatchObject({ mode: "dry-run", eligible: 3, purged: 0 });
    expect(await outboxIds()).toHaveLength(5);
    expect(await mailIds()).toHaveLength(6);
  });
});
