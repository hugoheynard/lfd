/**
 * L'envoi hors de la transaction de livraison et son balayeur, contre le vrai
 * Postgres (plan `documentation/editeur-de-contenu/plan-service-e-mails.md`,
 * lot S1b, § 8).
 *
 * Ce qu'un test unitaire ne peut pas dire : que `sending` est bien rangé par
 * la vraie transaction de livraison, que l'envoi part après la validation,
 * que la requête du balayeur trouve les orphelins par l'index réel, et que le
 * cron les atteint par sa route. Seul le transport est doublé (le mailer).
 *
 * Les instants sont relatifs à maintenant : on VIEILLIT une tentative en
 * reculant ses deux colonnes de date, comme si le temps avait passé.
 */
import { MailerIdempotencyInFlightError, type MailReceipt, type SendMailArgs } from "@lfd/mailer";

import { Mail, type MailDemand } from "../src/mail/channels/requests/mail.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import type { B2bMails } from "../src/mail/templates/mail-templates.js";
import { MAILER, type B2bMailer } from "../src/mail/templates/mailer.tokens.js";

import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

/** Le transport doublé : il compte ce qu'il accepte, ou répond « même clé en cours ». */
class ScriptedMailer implements B2bMailer {
  readonly enabled = true;
  readonly accepted: string[] = [];
  inFlight = false;

  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    if (this.inFlight) {
      return Promise.reject(new MailerIdempotencyInFlightError("Resend : même clé en cours"));
    }
    this.accepted.push(args.idempotencyKey ?? "");
    return Promise.resolve({ providerId: `re_${this.accepted.length}` });
  }

  reset(): void {
    this.accepted.length = 0;
    this.inFlight = false;
  }
}

const KEY = "staff.restored:s1b";

const RESTORED: MailDemand<"staff.access-restored"> = {
  template: "staff.access-restored",
  to: "equipe@example.test",
  data: { firstName: "Ada", backOfficeUrl: "https://admin.example.test" },
  idempotencyKey: KEY,
};

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

const mailer = new ScriptedMailer();
let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [{ token: MAILER, value: mailer }] });
});

beforeEach(async () => {
  await ctx.reset();
  mailer.reset();
});

afterAll(async () => {
  await ctx.close();
});

async function requestAndDeliver(): Promise<void> {
  const mail = ctx.app.get(Mail);
  await ctx.app.get(UnitOfWork).run(() => mail.send(RESTORED));
  await ctx.drain();
}

/** Une demande restée `sending` : le fournisseur a répondu « même clé en cours ». */
async function orphan(): Promise<void> {
  mailer.inFlight = true;
  await requestAndDeliver();
  mailer.inFlight = false;
}

async function age(firstAttemptAt: Date, lastAttemptAt: Date): Promise<void> {
  await ctx.prisma.mailRequest.update({
    where: { idempotencyKey: KEY },
    data: { firstAttemptAt, lastAttemptAt },
  });
}

async function sweep(): Promise<Readonly<Record<string, number>>> {
  return jsonBody<Readonly<Record<string, number>>>(
    await ctx
      .http()
      .post("/admin/mail/requests/sweep")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200),
  );
}

function row() {
  return ctx.prisma.mailRequest.findUniqueOrThrow({ where: { idempotencyKey: KEY } });
}

describe("S1b — l'envoi après la validation", () => {
  it("une demande passe `sending` puis `sent`, envoyée une seule fois", async () => {
    await requestAndDeliver();

    expect(mailer.accepted).toEqual([KEY]);
    const sent = await row();
    expect(sent).toMatchObject({ status: "sent", providerId: "re_1", attempts: 1 });
    expect(sent.firstAttemptAt).not.toBeNull();

    expect(await sweep()).toMatchObject({ examined: 0 });
    expect(mailer.accepted).toHaveLength(1);
  });

  it("un 409 « même clé en cours » laisse la demande `sending`", async () => {
    await orphan();

    expect(await row()).toMatchObject({ status: "sending", attempts: 1, failedAt: null });
    expect(mailer.accepted).toEqual([]);
  });
});

describe("S1b — le balayeur, par la route du cron", () => {
  it("reprend un orphelin `sending` avec la même clé", async () => {
    await orphan();
    const stale = new Date(Date.now() - FIFTEEN_MINUTES_MS);
    await age(stale, stale);

    expect(await sweep()).toMatchObject({ examined: 1, sent: 1 });

    expect(mailer.accepted).toEqual([KEY]);
    expect(await row()).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("laisse un envoi engagé récemment", async () => {
    await orphan();

    expect(await sweep()).toMatchObject({ examined: 0 });
    expect(await row()).toMatchObject({ status: "sending" });
  });

  it("passe `failed` sans envoi une demande de plus de 23 h", async () => {
    await orphan();
    const yesterday = new Date(daysAgo(1));
    await age(yesterday, yesterday);

    expect(await sweep()).toMatchObject({ examined: 1, abandoned: 1, sent: 0 });

    expect(mailer.accepted).toEqual([]);
    const abandoned = await row();
    expect(abandoned.status).toBe("failed");
    expect(abandoned.failureReason).toContain("23 h");
  });
});
