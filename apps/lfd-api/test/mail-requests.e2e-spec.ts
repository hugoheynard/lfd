/**
 * La porte du bloc `mail`, contre le vrai Postgres (plan
 * `documentation/mail/plan-service-e-mails.md`, S1).
 *
 * Ce qu'un test unitaire ne peut pas dire : que la demande tombe AVEC la
 * transaction de l'appelant, que la boîte d'envoi la livre une fois validée,
 * qu'un rejeu n'envoie pas deux fois, et que le suivi est bien rangé dans le
 * schéma `mail`. Seul le transport est doublé (le mailer), comme ailleurs.
 */
import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

import { Mail, type MailDemand } from "../src/mail/channels/requests/mail.js";
import { DeliverRequestedMail } from "../src/mail/requests/application/deliver-requested-mail.handler.js";
import { ImmediateMailInsideUnitOfWorkError } from "../src/mail/requests/domain/errors/mail-request.errors.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import type { B2bMails } from "../src/mail/templates/mail-templates.js";
import { MAILER, type B2bMailer } from "../src/mail/templates/mailer.tokens.js";

import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

/** Ce que le mailer doublé a reçu — l'envoi, pas son rendu. */
interface SentMail {
  readonly to: string;
  readonly template: string;
  readonly idempotencyKey: string | undefined;
}

/** Le transport doublé : il compte, et rend un identifiant fournisseur. */
class RecordingMailer implements B2bMailer {
  readonly enabled = true;
  readonly sent: SentMail[] = [];

  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    this.sent.push({ to: args.to, template: args.template, idempotencyKey: args.idempotencyKey });
    return Promise.resolve({ providerId: `re_${this.sent.length}` });
  }

  reset(): void {
    this.sent.length = 0;
  }
}

/** L'émetteur a échoué APRÈS avoir demandé son e-mail. */
class CallerFailed extends TypeError {}

const RESTORED: MailDemand<"staff.access-restored"> = {
  template: "staff.access-restored",
  to: "equipe@example.test",
  data: { firstName: "Ada", backOfficeUrl: "https://admin.example.test" },
  idempotencyKey: "staff.restored:e2e",
};

const mailer = new RecordingMailer();
let ctx: E2eContext;
let mail: Mail;
let unitOfWork: UnitOfWork;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [{ token: MAILER, value: mailer }] });
  mail = ctx.app.get(Mail);
  unitOfWork = ctx.app.get(UnitOfWork);
});

beforeEach(async () => {
  await ctx.reset();
  mailer.reset();
});

afterAll(async () => {
  await ctx.close();
});

async function requestInTransaction(): Promise<string> {
  const requested = await unitOfWork.run(() => mail.send(RESTORED));
  return requested.requestId;
}

describe("request — la demande écrite avec la transaction de l'appelant", () => {
  it("une demande validée part une fois, et son suivi dit « envoyée »", async () => {
    await requestInTransaction();
    await ctx.drain();

    expect(mailer.sent).toEqual([
      {
        to: "equipe@example.test",
        template: "staff.access-restored",
        idempotencyKey: "staff.restored:e2e",
      },
    ]);
    const row = await ctx.prisma.mailRequest.findUniqueOrThrow({
      where: { idempotencyKey: "staff.restored:e2e" },
    });
    expect(row).toMatchObject({
      template: "staff.access-restored",
      brand: "lfd",
      recipient: "equipe@example.test",
      locale: null,
      status: "sent",
      providerId: "re_1",
    });
    expect(row.sentAt).not.toBeNull();
  });

  it("une transaction annulée n'écrit rien et n'envoie rien", async () => {
    await expect(
      unitOfWork.run(async () => {
        await mail.send(RESTORED);
        throw new CallerFailed("l'appelant tombe après avoir demandé");
      }),
    ).rejects.toThrow(CallerFailed);
    await ctx.drain();

    expect(mailer.sent).toEqual([]);
    expect(await ctx.prisma.mailRequest.count()).toBe(0);
    expect(await ctx.prisma.outboxMessage.count()).toBe(0);
  });

  it("une demande répétée, puis une livraison rejouée, n'envoient qu'une fois", async () => {
    await requestInTransaction();
    await requestInTransaction();
    await ctx.drain();

    const message = await ctx.prisma.outboxMessage.findFirstOrThrow();
    const subscriber = ctx.app.get(DeliverRequestedMail);
    await unitOfWork.run(() =>
      subscriber.handle({ eventId: message.id, type: message.type, payload: payloadOf(message) }),
    );

    expect(await ctx.prisma.outboxMessage.count()).toBe(1);
    expect(await ctx.prisma.mailRequest.count()).toBe(1);
    expect(mailer.sent).toHaveLength(1);
  });
});

describe("sendAndAwaitReceipt — l'envoi immédiat", () => {
  it("envoie hors transaction, rend le reçu, et range le suivi", async () => {
    await expect(mail.sendAndAwaitReceipt(RESTORED)).resolves.toEqual({ providerId: "re_1" });

    expect(mailer.sent).toHaveLength(1);
    expect(
      await ctx.prisma.mailRequest.findUniqueOrThrow({
        where: { idempotencyKey: "staff.restored:e2e" },
      }),
    ).toMatchObject({ status: "sent", providerId: "re_1" });
    expect(await ctx.prisma.outboxMessage.count()).toBe(0);
  });

  it("refuse sous une unité de travail, sans rien envoyer ni écrire", async () => {
    await expect(unitOfWork.run(() => mail.sendAndAwaitReceipt(RESTORED))).rejects.toThrow(
      ImmediateMailInsideUnitOfWorkError,
    );

    expect(mailer.sent).toEqual([]);
    expect(await ctx.prisma.mailRequest.count()).toBe(0);
  });
});

/** La charge du message, telle que la boîte d'envoi la livre. */
function payloadOf(message: { readonly payload: unknown }): Readonly<Record<string, unknown>> {
  const { payload } = message;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new TypeError("charge de message inattendue");
  }
  return Object.fromEntries(Object.entries(payload));
}

/** Le sujet des e-mails (`plan-sujet-des-e-mails.md`, E1) : rangé, relu, et gardé à travers l'outbox. */
describe("les sujets d'une demande, dans `mail.mail_request_subject`", () => {
  const SUBJECTS = [
    { type: "order", id: "ord_e2e_1" },
    { type: "invoice", id: "inv_e2e_1" },
  ] as const;

  async function subjectsOf(idempotencyKey: string): Promise<readonly unknown[]> {
    const row = await ctx.prisma.mailRequest.findUniqueOrThrow({
      where: { idempotencyKey },
      select: { subjects: { select: { subjectType: true, subjectId: true } } },
    });
    return row.subjects;
  }

  it("différée : rangés avec la demande, portés par le fait, et intacts après l'envoi par la boîte d'envoi", async () => {
    await unitOfWork.run(() => mail.send({ ...RESTORED, subjects: SUBJECTS }));
    const message = await ctx.prisma.outboxMessage.findFirstOrThrow();
    expect(payloadOf(message)).toMatchObject({ subjects: SUBJECTS });

    await ctx.drain();

    expect(mailer.sent).toHaveLength(1);
    const row = await ctx.prisma.mailRequest.findUniqueOrThrow({
      where: { idempotencyKey: RESTORED.idempotencyKey },
    });
    expect(row.status).toBe("sent");
    expect(await subjectsOf(RESTORED.idempotencyKey)).toEqual(
      expect.arrayContaining([
        { subjectType: "order", subjectId: "ord_e2e_1" },
        { subjectType: "invoice", subjectId: "inv_e2e_1" },
      ]),
    );
  });

  it("immédiate : rangés à l'écriture du suivi, après l'envoi", async () => {
    await mail.sendAndAwaitReceipt({ ...RESTORED, subjects: [SUBJECTS[0]] });

    expect(await subjectsOf(RESTORED.idempotencyKey)).toEqual([
      { subjectType: "order", subjectId: "ord_e2e_1" },
    ]);
  });

  it("une seconde demande de même clé garde les sujets de la première", async () => {
    await unitOfWork.run(() => mail.send({ ...RESTORED, subjects: [SUBJECTS[0]] }));
    await unitOfWork.run(() => mail.send({ ...RESTORED, subjects: [SUBJECTS[1]] }));

    expect(await subjectsOf(RESTORED.idempotencyKey)).toEqual([
      { subjectType: "order", subjectId: "ord_e2e_1" },
    ]);
  });

  it("la purge d'une demande emporte ses sujets (ON DELETE CASCADE)", async () => {
    await unitOfWork.run(() => mail.send({ ...RESTORED, subjects: SUBJECTS }));
    await ctx.prisma.mailRequest.deleteMany({});

    expect(await ctx.prisma.mailRequestSubject.count()).toBe(0);
  });
});
