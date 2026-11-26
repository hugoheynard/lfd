/**
 * E2E du **lien de paiement d'essai** (doc
 * `documentation/payment/les-liens-de-paiement.md`, « Le lien d'essai ») : un
 * vrai lien de 1 €, sujet `payment_test` du bloc `payment`, envoyé à un membre
 * du staff, payé par la page `/payer/…` et remboursé tout seul.
 *
 * Ce que seul le vrai SQL prouve :
 * - l'essai, son lien et la demande d'e-mail naissent dans UNE transaction —
 *   un membre suspendu fait tout tomber, rien n'est compté ;
 * - le plafond du jour est compté sous le verrou de l'envoi ;
 * - le paiement traverse le webhook des cartes et le sujet ; l'abonné durable
 *   demande le remboursement, l'exécuteur l'émet, et l'essai passe
 *   `refunded` à l'issue réussie seulement ;
 * - l'avis à la comptabilité part, et son corps dit l'essai.
 *
 * Frontières doublées : la signature du jeton staff, le prestataire de carte,
 * le mailer, la racine publique des origines, et l'horloge — décalée pour
 * franchir les 24 heures sans les attendre.
 */
import type { CreatedPayLinkTest, PayLinkIntent, PayLinkTestView } from "@lfd/contracts";
import { PAY_LINK_TEST_DAILY_LIMIT } from "@lfd/contracts";

import { MAILER } from "../src/mail/templates/mailer.tokens.js";
import { CardProviders } from "../src/payment/card/domain/ports/card-providers.js";
import { FixedOrigins } from "../src/payment/link/application/__tests__/pay-link-doubles.js";
import { PayLinkOrigins } from "../src/payment/link/domain/ports/pay-link-origins.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { AppConfig, type MailerConfig } from "../src/platform/config/app-config.js";
import { Clock } from "../src/platform/time/clock.js";
import { staffWithRole } from "./delivery-driver-scene.js";
import { cardPaid, E2eCardProviders, recordCardEvent } from "./card-payments.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";

const ROOT = "https://app.lfc.test";
const TESTS = "/admin/payment/link-tests";
const VIEW = "/pay-links/view";
const INTENT = "/pay-links/intent";
const STAFF_INBOX = "equipe@lfc.test";
const DAY_MS = 24 * 60 * 60 * 1000;
/** L'instant du prestataire : recopié, jamais comparé à l'horloge. */
const REFUNDED_AT = new Date(daysAgo(0));

const stubAdminVerifier = {
  verify: (sub: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: sub === "" ? E2E_STAFF_SUB : sub, scopes: [] }),
};

/** L'horloge métier, réelle, plus un décalage qu'on avance. */
class ShiftedClock extends Clock {
  offsetMs = 0;

  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }
}

interface SentMail {
  readonly to: string;
  readonly template: string;
  readonly data: unknown;
}
const sentMails: SentMail[] = [];
const recordingMailer = {
  enabled: true,
  send: (args: SentMail): Promise<{ providerId: null }> => {
    sentMails.push(args);
    return Promise.resolve({ providerId: null });
  },
};

/** La boîte de l'équipe posée : l'avis d'un paiement par lien y est demandé. */
class InboxConfig extends AppConfig {
  override mailerConfig(): MailerConfig {
    return { ...super.mailerConfig(), staffInbox: STAFF_INBOX };
  }
}

const cards = new E2eCardProviders("pi_plt");
const clock = new ShiftedClock();
let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: CardProviders, value: cards },
      { token: AppConfig, value: new InboxConfig() },
      { token: MAILER, value: recordingMailer },
      { token: Clock, value: clock },
      {
        token: PayLinkOrigins,
        value: new FixedOrigins([
          {
            name: "lafoliecoffee",
            label: "La Folie Coffee",
            providerApp: "la-folie-coffee",
            publicRoot: ROOT,
          },
          {
            name: "lafoliecoffee_test",
            label: "Essai — La Folie Coffee",
            providerApp: "la-folie-coffee",
            publicRoot: ROOT,
          },
        ]),
      },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  clock.offsetMs = 0;
  cards.provider.refundIssuances.splice(0);
  cards.provider.refundCalls.splice(0);
  sentMails.splice(0);
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub(E2E_STAFF_SUB);
}

/** Un rôle sans le droit des essais : celui des destinataires. */
const ROLE = "compta-sans-essai";

async function ensureRole(): Promise<void> {
  if ((await ctx.prisma.staffRoleDefinition.count({ where: { key: ROLE } })) > 0) {
    return;
  }
  await staff()
    .post("/admin/staff-roles")
    .send({ key: ROLE, label: "Compta", grants: [{ resource: "b2b_accounting", action: "read" }] })
    .expect(201);
}

/** Un membre de l'équipe à qui l'on envoie l'essai. */
async function recipient(sub = "anne-essai"): Promise<string> {
  await ensureRole();
  return (await staffWithRole(ctx, sub, ROLE)).id;
}

function post(staffUserId: string, key = freshIntent()) {
  return staff().post(TESTS).set(INTENT_KEY, key).send({ staffUserId });
}

async function send(staffUserId: string): Promise<CreatedPayLinkTest> {
  return jsonBody<CreatedPayLinkTest>(await post(staffUserId).expect(201));
}

async function list(): Promise<PayLinkTestView[]> {
  return jsonBody<PayLinkTestView[]>(await staff().get(TESTS).expect(200));
}

function tokenOf(url: string): string {
  return url.slice(`${ROOT}/payer/`.length);
}

/** Ouvre la page et crée l'intention ; rend la référence chez le prestataire. */
async function startPaying(url: string): Promise<string> {
  const before = cards.provider.issued.length;
  const intent = jsonBody<PayLinkIntent>(
    await ctx
      .http()
      .post(INTENT)
      .send({ token: tokenOf(url) })
      .expect(200),
  );
  expect(intent.amountCents).toBe(100);
  return cards.provider.issued[before] ?? "";
}

describe("envoyer un lien d'essai", () => {
  it("l'essai, son lien `payment_test` et l'e-mail au membre choisi ; la liste le sert", async () => {
    const anne = await recipient();

    const created = await send(anne);

    expect(created.url.startsWith(`${ROOT}/payer/`)).toBe(true);
    expect(
      await ctx.prisma.payLinkTest.findUniqueOrThrow({ where: { id: created.id } }),
    ).toMatchObject({
      state: "sent",
      amountCents: 100,
      createdByStaffId: E2E_STAFF_ID,
    });
    expect(await ctx.prisma.payLink.findMany({ where: { subjectId: created.id } })).toMatchObject([
      {
        subjectType: "payment_test",
        origin: "lafoliecoffee_test",
        payerLabel: "Essai du paiement par lien",
      },
    ]);
    const requests = await ctx.prisma.mailRequest.findMany({
      where: { template: "staff.pay-link-test" },
    });
    expect(requests).toMatchObject([
      {
        recipient: "anne-essai@lfc.test",
        idempotencyKey: `mail:payment.pay_link_test:${created.id}`,
      },
    ]);
    expect(await list()).toMatchObject([
      { id: created.id, state: "sent", url: created.url, paidAt: null, refundedAt: null },
    ]);
    const view = await ctx
      .http()
      .post(VIEW)
      .send({ token: tokenOf(created.url) })
      .expect(200);
    expect(view.body).toMatchObject({
      payable: true,
      amountCents: 100,
      payeeName: "Essai — La Folie Coffee",
      reference: "ESSAI — lien de paiement de 1 €",
    });
  });

  it("les destinataires : les membres actifs, sans adresse", async () => {
    const anne = await recipient();
    const suspended = await recipient("bruno-essai");
    await ctx.prisma.staffUser.update({ where: { id: suspended }, data: { status: "suspended" } });

    const body = jsonBody<{ staffUserId: string; label: string }[]>(
      await staff().get(`${TESTS}/recipients`).expect(200),
    );

    const ids = body.map((entry) => entry.staffUserId);
    expect(ids).toContain(anne);
    expect(ids).not.toContain(suspended);
    expect(JSON.stringify(body)).not.toContain("@");
  });

  it("un membre suspendu : refus nommé, et rien n'est écrit", async () => {
    const anne = await recipient();
    await ctx.prisma.staffUser.update({ where: { id: anne }, data: { status: "suspended" } });

    const refused = await post(anne).expect(409);

    expect((refused.body as { code: string }).code).toBe("mail.staff_member.unreachable");
    expect(await ctx.prisma.payLinkTest.count()).toBe(0);
    expect(await ctx.prisma.payLink.count()).toBe(0);
  });

  it("un membre inconnu : 404", async () => {
    const refused = await post("fiche-inconnue").expect(404);
    expect((refused.body as { code: string }).code).toBe("mail.staff_member.not_found");
  });

  it(`le plafond : ${String(PAY_LINK_TEST_DAILY_LIMIT)} par jour, puis un refus qui le dit`, async () => {
    const anne = await recipient();
    for (let sent = 0; sent < PAY_LINK_TEST_DAILY_LIMIT; sent += 1) {
      await send(anne);
    }

    const refused = await post(anne).expect(409);

    expect((refused.body as { code: string }).code).toBe("payment.pay_link_test.daily_limit");
    expect(await ctx.prisma.payLinkTest.count()).toBe(PAY_LINK_TEST_DAILY_LIMIT);
  });

  it("sans le droit `pay_link_test`, la liste et l'envoi sont refusés", async () => {
    const anne = await recipient();
    await staffWithRole(ctx, "compta-sans-droit", ROLE);

    await ctx.asSub("compta-sans-droit").get(TESTS).expect(403);
    await ctx
      .asSub("compta-sans-droit")
      .post(TESTS)
      .set(INTENT_KEY, freshIntent())
      .send({ staffUserId: anne })
      .expect(403);
  });
});

describe("après 24 heures", () => {
  it("la page dit « plus valable », la liste « expiré », sans adresse", async () => {
    const created = await send(await recipient());
    clock.offsetMs = DAY_MS + 60_000;

    const view = await ctx
      .http()
      .post(VIEW)
      .send({ token: tokenOf(created.url) })
      .expect(200);
    expect(view.body).toEqual({ payable: false, reason: "cancelled" });
    expect(await list()).toMatchObject([{ id: created.id, state: "expired", url: null }]);
  });
});

describe("payer l'essai", () => {
  it("payé → remboursement demandé et émis → `refunded` à l'issue réussie ; l'avis dit l'essai", async () => {
    const created = await send(await recipient());
    const providerRef = await startPaying(created.url);
    cards.provider.refundIssuances.push({
      kind: "issued",
      refund: {
        refundId: "re_plt",
        amountCents: 100,
        currency: "eur",
        status: "pending",
        createdAt: REFUNDED_AT,
      },
    });

    await cardPaid(ctx, providerRef);

    const payment = await ctx.prisma.cardPayment.findFirstOrThrow({
      where: { subjectType: "payment_test", subjectId: created.id },
    });
    const request = await ctx.prisma.cardRefundRequest.findFirstOrThrow({
      where: { paymentId: payment.id },
    });
    expect(request).toMatchObject({ form: "remainder", reason: "pay_link_test", state: "issued" });
    expect(cards.provider.refundCalls).toHaveLength(1);
    // En attente de la banque : l'essai est payé, pas encore rendu.
    expect((await list())[0]).toMatchObject({ state: "paid", url: null, refundedAt: null });

    await recordCardEvent(ctx, (eventId) => ({
      kind: "refund",
      eventId,
      eventType: "refund.updated",
      providerRef,
      refundId: "re_plt",
      amountCents: 100,
      currency: "eur",
      status: "succeeded",
      createdAt: REFUNDED_AT,
      ours: { requestId: request.id, generation: 1 },
    }));

    const [view] = await list();
    expect(view).toMatchObject({ state: "refunded", url: null });
    expect(view?.refundedAt).not.toBeNull();
    expect(await ctx.prisma.outboxDelivery.count({ where: { lastError: { not: null } } })).toBe(0);

    await ctx.drain();
    const notices = sentMails.filter((mail) => mail.template === "staff.link-payment-received");
    expect(notices).toHaveLength(1);
    expect(notices[0]?.data).toMatchObject({
      amountCents: 100,
      payerLabel: "Essai du paiement par lien",
      applicationLabel: "Essai — La Folie Coffee",
      settledLabel: "ESSAI — lien de paiement de 1 €",
      refused: false,
    });
  });

  it("un remboursement qui échoue : `refund_failed`, et la cloche sonne", async () => {
    const created = await send(await recipient());
    const providerRef = await startPaying(created.url);
    cards.provider.refundIssuances.push({
      kind: "issued",
      refund: {
        refundId: "re_plt_ko",
        amountCents: 100,
        currency: "eur",
        status: "pending",
        createdAt: REFUNDED_AT,
      },
    });
    await cardPaid(ctx, providerRef);
    const payment = await ctx.prisma.cardPayment.findFirstOrThrow({
      where: { subjectType: "payment_test", subjectId: created.id },
    });
    const request = await ctx.prisma.cardRefundRequest.findFirstOrThrow({
      where: { paymentId: payment.id },
    });

    await recordCardEvent(ctx, (eventId) => ({
      kind: "refund",
      eventId,
      eventType: "refund.updated",
      providerRef,
      refundId: "re_plt_ko",
      amountCents: 100,
      currency: "eur",
      status: "failed",
      createdAt: REFUNDED_AT,
      ours: { requestId: request.id, generation: 1 },
    }));

    expect((await list())[0]).toMatchObject({ state: "refund_failed" });
    expect(
      await ctx.prisma.staffNotification.count({ where: { kind: "pay_link_test.refund_failed" } }),
    ).toBe(1);
  });
});
