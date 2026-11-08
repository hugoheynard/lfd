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
