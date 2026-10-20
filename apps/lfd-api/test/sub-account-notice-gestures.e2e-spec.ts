/**
 * E2E des **avis au principal sur un geste hors commande** (plan
 * `documentation/comptes-client/plan-notifications-sous-comptes.md`, lot N4a :
 * le problème signalé).
 *
 * Ce que seul l'e2e prouve : la demande et le fait durable
 * `order.problem_reported` s'écrivent ensemble par la vraie route ; le relais
 * livre le fait à l'abonné ; le principal prévenu est celui COPIÉ sur la
 * commande, et une commande sans copie (d'avant N1) ne prévient personne ;
 * le journal d'envoi arrête une relivraison.
 *
 * Sociétés et commande semées par Prisma (aucun chemin court vers une
 * commande retirée, dette de `test/factories.ts`) ; le signalement par HTTP.
 * Doublés : la signature des jetons (le jeton EST le `sub`) et le courrier.
 */
import { WORKSPACE_HEADER, type CreatedIdResponse } from "@lfd/contracts";

import { NotifyPrincipalOnOrderProblemReported } from "../src/b2b/sub-account-notices/application/handlers/notify-principal-on-order-problem-reported.handler.js";
import { ORDER_PROBLEM_REPORTED } from "../src/b2b/contact/domain/order-problem-reported.fact.js";
import {
  OrderClientele,
  OrderStatus,
  PaymentStatus,
} from "../src/platform/database/client/client.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import {
  enableNotices,
  mailOf,
  noticeScene,
  recordOf,
  type NoticeScene,
} from "./sub-account-notice-scene.js";

const TEMPLATE = "customer.sub-account-gesture";

interface SentMail {
  readonly to: string;
  readonly template: string;
  readonly data: unknown;
}
const mails: SentMail[] = [];
const recordingMailer = {
  enabled: true,
  send: (args: SentMail): Promise<{ providerId: null }> => {
    mails.push(args);
    return Promise.resolve({ providerId: null });
  },
};

let ctx: E2eContext;
let seq = 0; // numéros de commande

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, { token: MAILER, value: recordingMailer }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  mails.splice(0);
});

/** Une commande RETIRÉE du site ; `principal` : la copie de N1, `null` : d'avant N1. */
async function fulfilledOrder(s: NoticeScene, principal: string | null): Promise<string> {
  const buyer = await ctx.prisma.user.findUniqueOrThrow({ where: { auth0Sub: s.housekeeper } });
  const order = await ctx.prisma.order.create({
    data: {
      orderNumber: `CMD-N4A-${String((seq += 1))}`,
      placedByUserId: buyer.id,
      companyId: s.site,
      principalCompanyId: principal,
      clientele: OrderClientele.pro,
      status: OrderStatus.fulfilled,
      subtotalCents: 2_000,
      discountCents: 0,
      totalCents: 2_000,
      paymentStatus: PaymentStatus.paid,
      requestedDeliveryDate: new Date(daysAgo(2)),
    },
    select: { id: true },
  });
  return order.id;
}

async function reason(): Promise<string> {
  const response = await ctx
    .asSub(E2E_STAFF_SUB)
    .post("/admin/request-reasons")
    .send({
      kind: "order_problem",
      label: { fr: "Produit abîmé", en: "Damaged product", it: "" },
      recipientEmail: "sav@lfc.test",
      position: 0,
      active: true,
      audience: "both",
      priority: "urgent",
    })
    .expect(201);
  return jsonBody<CreatedIdResponse>(response).id;
}

async function report(s: NoticeScene, orderId: string): Promise<void> {
  await ctx
    .asSub(s.housekeeper)
    .post(`/me/orders/${orderId}/problems`)
    .set(WORKSPACE_HEADER, s.site)
    .field("reasonId", await reason())
    .field("message", "Le pain était écrasé.")
    .expect(201);
  await ctx.drain();
}

const notices = (): SentMail[] => mails.filter((mail) => mail.template === TEMPLATE);
const recipients = (sent: readonly SentMail[]): string[] => sent.map((mail) => mail.to).sort();
const at = mailOf;

describe("un site signale un problème sur une commande retirée", () => {
  it("prévient owner, admin et orders du principal COPIÉ — ni billing, ni l'auteure, ni l'invité ; sans le message", async () => {
    const s = await noticeScene(ctx);
    const orderId = await fulfilledOrder(s, s.principal);

    await report(s, orderId);

    const sent = notices();
    expect(recipients(sent)).toEqual([at(s.admin), at(s.orders), at(s.owner)].sort());
    expect(sent[0]?.data).toMatchObject({
      gesture: "problem_reported",
      siteName: "Chalet Gentiane",
      byTeam: false,
    });
    expect(JSON.stringify(sent)).not.toContain("écrasé");
    expect(await ctx.prisma.outboxMessage.count({ where: { type: ORDER_PROBLEM_REPORTED } })).toBe(
      1,
    );
  });

  /** BLOQUANT 2 de vitruve : pas de repli sur la hiérarchie vivante. */
  it("une commande d'avant la copie du principal (N1) ne prévient personne, bien que le site ait un principal", async () => {
    const s = await noticeScene(ctx);
    const orderId = await fulfilledOrder(s, null);

    await report(s, orderId);

    expect(notices()).toEqual([]);
    expect(await ctx.prisma.customerRequest.count()).toBe(1);
  });

  it("une relivraison du même fait n'envoie aucun doublon (journal d'envoi)", async () => {
    const s = await noticeScene(ctx);
    await report(s, await fulfilledOrder(s, s.principal));
    const [row] = await ctx.prisma.outboxMessage.findMany({
      where: { type: ORDER_PROBLEM_REPORTED },
    });
    const before = notices().length;

    const subscriber = ctx.app.get(NotifyPrincipalOnOrderProblemReported, { strict: false });
    await ctx.app.get(UnitOfWork, { strict: false }).run(() =>
      subscriber.handle({
        eventId: row?.id ?? "",
        type: ORDER_PROBLEM_REPORTED,
        payload: recordOf(row?.payload),
      }),
    );

    expect(notices()).toHaveLength(before);
    expect(await ctx.prisma.subAccountNoticeSend.count()).toBe(3);
  });
});

describe("l'interrupteur des avis du principal (Hugo, 2026-10-20)", () => {
  it("par défaut aucun mail ; activé, le mail part ; coupé ensuite, plus rien — et rien n'est rattrapé", async () => {
    const s = await noticeScene(ctx, false);

    await report(s, await fulfilledOrder(s, s.principal));
    expect(notices()).toEqual([]);
    expect(await ctx.prisma.subAccountNoticeSend.count()).toBe(0);

    await enableNotices(ctx, s.principal);
    await report(s, await fulfilledOrder(s, s.principal));
    // Un seul signalement prévenu : celui d'avant l'activation n'est pas rattrapé.
    expect(recipients(notices())).toEqual([at(s.admin), at(s.orders), at(s.owner)].sort());

    await enableNotices(ctx, s.principal, false);
    await report(s, await fulfilledOrder(s, s.principal));
    expect(notices()).toHaveLength(3);
  });
});
