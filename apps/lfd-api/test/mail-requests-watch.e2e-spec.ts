/**
 * La veille du courrier différé, contre le vrai Postgres (plan
 * `documentation/mail/plan-service-e-mails.md`, lot S8, § 25).
 *
 * Ce qu'un test unitaire ne peut pas dire : que la vraie requête compte les
 * demandes coincées et les échecs définitifs comme la règle les nomme, que la
 * route du cron est servie derrière le jeton machine, et que la cloche écrit
 * une seule notice par cas et par heure. Seul le transport est doublé.
 *
 * Les instants sont relatifs à maintenant : on VIEILLIT une demande en
 * reculant ses colonnes de date, comme si le temps avait passé.
 */
import { MailerIdempotencyInFlightError, type MailReceipt } from "@lfd/mailer";

import { Mail, type MailDemand } from "../src/mail/channels/requests/mail.js";
import { MailRequest } from "../src/mail/requests/domain/entities/mail-request.js";
import { MailRequestRepository } from "../src/mail/requests/domain/ports/mail-request.repository.js";
import type { MailDelivery } from "../src/mail/requests/domain/value-objects/mail-delivery.js";
import { MailDeliveryTally } from "../src/platform/mailer/delivery-tally/mail-delivery-tally.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { MAILER, type B2bMailer } from "../src/mail/templates/mailer.tokens.js";

import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

/** Le transport doublé : il répond toujours « même clé en cours ». */
class InFlightMailer implements B2bMailer {
  readonly enabled = true;

  send(): Promise<MailReceipt> {
    return Promise.reject(new MailerIdempotencyInFlightError("Resend : même clé en cours"));
  }
}

interface WatchReport {
  readonly stalled: number;
  readonly oldestStalledMinutes: number | null;
  readonly definitiveFailures: number;
  readonly alarms: readonly string[];
  readonly rejectedTemplates: readonly string[];
}

const KEY = "staff.restored:s8";

const RESTORED: MailDemand<"staff.access-restored"> = {
  template: "staff.access-restored",
  to: "equipe@example.test",
  data: { firstName: "Ada", backOfficeUrl: "https://admin.example.test" },
  idempotencyKey: KEY,
};

const MINUTE_MS = 60_000;

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [{ token: MAILER, value: new InFlightMailer() }] });
});

beforeEach(async () => {
  await ctx.reset();
});

afterAll(async () => {
  await ctx.close();
});

/** Une demande restée `sending` : le fournisseur a répondu « même clé en cours ». */
async function stuck(): Promise<void> {
  const mail = ctx.app.get(Mail);
  await ctx.app.get(UnitOfWork).run(() => mail.send(RESTORED));
  await ctx.drain();
}

function watch() {
  return ctx
    .http()
    .post("/admin/mail/requests/watch")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN);
}

async function watched(): Promise<WatchReport> {
  return jsonBody<WatchReport>(await watch().expect(200));
}

function mailAlarms() {
  return ctx.prisma.staffNotification.findMany({
    where: { idempotencyKey: { startsWith: "mail.backlog." } },
  });
}

describe("POST /admin/mail/requests/watch — la veille du courrier (S8)", () => {
  it("refuse un appel sans le jeton machine", async () => {
    await ctx.http().post("/admin/mail/requests/watch").expect(401);
  });

  it("une demande récente n'est pas coincée : rien ne sonne", async () => {
    await stuck();

    expect(await watched()).toEqual({
      stalled: 0,
      oldestStalledMinutes: null,
      definitiveFailures: 0,
      alarms: [],
      rejectedTemplates: [],
    });
    expect(await mailAlarms()).toEqual([]);
  });

  it("une demande en attente depuis 42 min sonne la cloche, une seule fois dans l'heure", async () => {
    await stuck();
    await ctx.prisma.mailRequest.update({
      where: { idempotencyKey: KEY },
      data: { requestedAt: new Date(Date.now() - 42 * MINUTE_MS) },
    });

    const report = await watched();
    await watched();

    expect(report).toMatchObject({ stalled: 1, definitiveFailures: 0, alarms: ["stalled"] });
    expect(report.oldestStalledMinutes).toBeGreaterThanOrEqual(42);
    const alarms = await mailAlarms();
    expect(alarms).toHaveLength(1);
    expect(alarms[0]).toMatchObject({ kind: "alert.mail", link: "/sante" });
    expect(alarms[0]?.body).toContain("1 e-mail attend depuis");
  });

  it("un envoi abandonné par le balayeur compte comme échec définitif", async () => {
    await stuck();
    const yesterday = new Date(daysAgo(1));
    await ctx.prisma.mailRequest.update({
      where: { idempotencyKey: KEY },
      data: { firstAttemptAt: yesterday, lastAttemptAt: yesterday },
    });
    await ctx
      .http()
      .post("/admin/mail/requests/sweep")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);

    const report = await watched();

    expect(report).toMatchObject({ definitiveFailures: 1, alarms: ["failed"] });
    const alarms = await mailAlarms();
    expect(alarms.map((alarm) => alarm.idempotencyKey)).toEqual([
      expect.stringMatching(/^mail\.backlog\.failed:/u),
    ]);
  });
});

/**
 * Une demande acceptée (ou à blanc, `providerId` nul), et son retour s'il y en
 * a un — par l'agrégat, rangée par le port d'écriture du bloc.
 */
async function accepted(
  n: number,
  template: string,
  options: { readonly providerId?: string | null; readonly delivery?: MailDelivery } = {},
): Promise<void> {
  const at = new Date();
  const request = MailRequest.request({
    id: `mail_t1b_${n}`,
    template,
    brand: "lfc",
    recipient: `client${n}@example.test`,
    locale: "fr",
    idempotencyKey: `t1b:${n}`,
    requestedAt: at,
  });
  request.markSent(options.providerId === undefined ? `re_t1b_${n}` : options.providerId, at);
  if (options.delivery !== undefined) {
    request.recordDelivery({ delivery: options.delivery, kind: null, at });
  }
  await ctx.app.get(MailRequestRepository).save(request);
}

function rejectionAlarms() {
  return ctx.prisma.staffNotification.findMany({
    where: { idempotencyKey: { startsWith: "mail.rejected." } },
    orderBy: { idempotencyKey: "asc" },
  });
}

describe("les rebonds et plaintes d'hier font sonner la veille (T1b)", () => {
  it("une cloche par modèle, la sonde exclue, et pas de seconde sonnerie", async () => {
    await accepted(1, "customer.access-opened", { delivery: "bounced" });
    await accepted(2, "customer.access-opened", { delivery: "complained" });
    await accepted(3, "customer.order-ready", { delivery: "bounced" });
    await accepted(4, "ops.deploy-check", { delivery: "bounced" });
    await accepted(5, "customer.order-ready", { delivery: "delivered" });

    const report = await watched();
    await watched();

    expect([...report.rejectedTemplates].sort()).toEqual([
      "customer.access-opened",
      "customer.order-ready",
    ]);
    const alarms = await rejectionAlarms();
    expect(alarms).toHaveLength(2);
    expect(alarms.map((alarm) => alarm.link)).toEqual(["/emails/envois", "/emails/envois"]);
    expect(alarms.some((alarm) => alarm.body.includes("ops.deploy-check"))).toBe(false);
  });
});

describe("MailDeliveryTally — ce que la carte de santé lit au suivi (T1b)", () => {
  it("compte les acceptés par retour, sans la sonde ni le mode à blanc", async () => {
    await accepted(1, "customer.access-opened", { delivery: "bounced" });
    await accepted(2, "customer.access-opened", { delivery: "bounced" });
    await accepted(3, "customer.order-ready", { delivery: "complained" });
    await accepted(4, "customer.order-ready", { delivery: "delivered" });
    await accepted(5, "customer.order-ready", { delivery: "delayed" });
    await accepted(6, "customer.order-ready");
    await accepted(7, "customer.order-ready", { providerId: null });
    await accepted(8, "ops.deploy-check", { delivery: "bounced" });

    const figures = await ctx.app.get(MailDeliveryTally).read(new Date(daysAgo(7)));

    expect(figures).toEqual({
      awaitingReturn: 1,
      delayed: 1,
      delivered: 1,
      bounced: 2,
      complained: 1,
      mostRejectedTemplate: "customer.access-opened",
    });
  });
});
