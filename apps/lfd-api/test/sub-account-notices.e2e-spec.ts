import { randomUUID } from "node:crypto";
/**
 * E2E des **avis au principal sur les faits de commande** (plan
 * `documentation/comptes-client/plan-notifications-sous-comptes.md`, lot N2).
 *
 * Ce que seul l'e2e prouve : les trois abonnés reçoivent les VRAIS faits
 * durables par le relais ; le principal prévenu est celui COPIÉ sur la
 * commande à la passation, même quand le site a changé de groupe depuis ;
 * les membres acceptés sont lus en base ; le journal d'envoi
 * `sub_account_notice_sends` arrête une relivraison.
 *
 * Sociétés, suivis et rattachements écrits par Prisma, comme
 * `sub-account-billing` ; passation, annulation et dérogations par HTTP.
 *
 * Doublés : la signature des jetons (le jeton EST le `sub`), Stripe, et le
 * courrier (enregistré).
 */
import { WORKSPACE_HEADER } from "@lfd/contracts";

import { CommandBus } from "@nestjs/cqrs";

import { ConfirmOrderPaymentCommand } from "../src/b2b/orders/application/commands/confirm-order-payment.command.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { NotifyPrincipalOnOrderPlaced } from "../src/b2b/sub-account-notices/application/handlers/notify-principal-on-order-placed.handler.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { COMMERCE_ORDER_PLACED } from "../src/delivery/channels/commerce/commerce-order-placed.fact.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const SERVICE_DAY = serviceDay();
const TEMPLATE = "customer.sub-account-activity";

let intents = 0;
const fakeGateway = {
  createIntent: () => {
    intents += 1;
    return Promise.resolve({
      paymentIntentId: `pi_n2_${String(intents)}`,
      clientSecret: `pi_n2_${String(intents)}_secret`,
    });
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

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
let seq = 0;
let pickupId = "pickup_absent";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      ADMIN_VERIFIER_OVERRIDE,
      { token: PaymentGateway, value: fakeGateway },
      { token: MAILER, value: recordingMailer },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  mails.splice(0);
  const point = await ctx.prisma.site.create({
    select: { id: true },
    data: {
      label: "Labo",
      ligne1: "1 rue du Four",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
  });
  pickupId = point.id;
});

/** Un membre de `companyId` ; `accepted: false` = une invitation jamais acceptée. */
async function member(
  companyId: string,
  role: CustomerRole,
  accepted = true,
  sub = `n2-${String((seq += 1))}`,
): Promise<string> {
  const user = await createUser(ctx.prisma, { auth0Sub: sub, email: `${sub}@alpes.test` });
  await attachTo(ctx.prisma, user.id, companyId, role);
  if (accepted) {
    await ctx.prisma.membership.updateMany({
      where: { userId: user.id, companyId },
      data: { acceptedAt: new Date(daysAgo(10)) },
    });
  }
  return `${sub}@alpes.test`;
}

interface Group {
  readonly principal: string;
  readonly site: string;
  /** Le `sub` de la gouvernante, owner du site ET admin du principal. */
  readonly housekeeper: string;
  readonly owner: string;
  readonly admin: string;
  readonly orders: string;
  readonly billing: string;
  readonly invited: string;
  readonly sibling: string;
}

/**
 * Un principal au terme mensuel, deux sites rattachés ; le premier le suit en
 * `billing` (il commande au compte du principal, qui voit le montant).
 */
async function group(): Promise<Group> {
  const principal = (await createCompany(ctx.prisma, { raisonSociale: "SAS Alpes Chalets" })).id;
  await ctx.prisma.company.update({
    where: { id: principal },
    data: { grantedTerms: ["monthly"] },
  });
  const site = (await createCompany(ctx.prisma, { raisonSociale: "", enseigne: "Chalet Gentiane" }))
    .id;
  const brother = (
    await createCompany(ctx.prisma, { raisonSociale: "", enseigne: "Chalet Arnica" })
  ).id;
  await ctx.prisma.company.updateMany({
    where: { id: { in: [site, brother] } },
    data: { parentCompanyId: principal },
  });
  await ctx.prisma.companyFollow.create({
    data: {
      companyId: site,
      parentId: principal,
      aspect: "billing",
      validFrom: new Date(daysAgo(30)),
    },
  });
  const housekeeper = `n2-gouvernante-${String((seq += 1))}`;
  await member(site, CustomerRole.owner, false, housekeeper);
  const housekeeperId = (
    await ctx.prisma.user.findUniqueOrThrow({ where: { auth0Sub: housekeeper } })
  ).id;
  await ctx.prisma.membership.create({
    data: {
      userId: housekeeperId,
      companyId: principal,
      role: CustomerRole.admin,
      acceptedAt: new Date(daysAgo(10)),
    },
  });
  return {
    principal,
    site,
    housekeeper,
    owner: await member(principal, CustomerRole.owner),
    admin: await member(principal, CustomerRole.admin),
    orders: await member(principal, CustomerRole.orders),
    billing: await member(principal, CustomerRole.billing),
    invited: await member(principal, CustomerRole.orders, false),
    sibling: await member(brother, CustomerRole.owner),
  };
}

/** La gouvernante est membre de deux sociétés : l'en-tête d'espace choisit le site. */
async function placeOrder(g: Group, settlement: "account" | "card"): Promise<string> {
  const response = await ctx
    .asSub(g.housekeeper)
    .post("/orders")
    .set(WORKSPACE_HEADER, g.site)
    .send({
      idempotencyKey: randomUUID(),
      requestedDeliveryDate: SERVICE_DAY,
      fulfillmentMethod: "pickup",
      requestedWindow: { start: "07:00", end: "08:00" },
      pickupAddressId: pickupId,
      settlement,
      note: "",
      lines: [{ sku: "VIE-001", quantity: 2 }],
    })
    .expect(201);
  await ctx.drain();
  return jsonBody<{ id: string }>(response).id;
}

async function cancel(orderId: string): Promise<void> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .post(`/admin/orders/${orderId}/cancel`)
    .send({ reason: "erreur de saisie" })
    .expect(204);
  await ctx.drain();
}

function notices(activity: string): SentMail[] {
  return mails.filter(
    (mail) =>
      mail.template === TEMPLATE &&
      (mail.data as { readonly activity: string }).activity === activity,
  );
}

const recipients = (sent: readonly SentMail[]): string[] => sent.map((mail) => mail.to).sort();

describe("une commande passée par un site", () => {
  it("prévient les membres acceptés du principal aux rôles par défaut — ni billing, ni l'auteur, ni le frère, ni l'invité", async () => {
    const g = await group();

    await placeOrder(g, "account");

    const sent = notices("placed");
    expect(recipients(sent)).toEqual([g.admin, g.orders, g.owner].sort());
    expect(sent[0]?.data).toMatchObject({
      siteName: "Chalet Gentiane",
      enteredByTeam: false,
      totalCents: expect.any(Number) as number,
    });
  });

  it("une dérogation qui retire le rôle orders le fait taire", async () => {
    const g = await group();
    await ctx
      .asSub(E2E_STAFF_SUB)
      .put(`/admin/companies/${g.principal}/sub-account-notices`)
      .send({ kind: "order_placed", role: "orders", enabled: false })
      .expect(204);

    await placeOrder(g, "account");

    expect(recipients(notices("placed"))).toEqual([g.admin, g.owner].sort());
  });

  it("un site qui ne suit ni billing ni pricing : le mail part sans montant (Q1)", async () => {
    const g = await group();
    await ctx.prisma.companyFollow.deleteMany({ where: { companyId: g.site } });

    // Commande carte : l'avis part au paiement confirmé (Hugo, 2026-10-20).
    await settleCard(await placeOrder(g, "card"), "succeeded");

    const sent = notices("placed");
    expect(sent).toHaveLength(3);
    expect(sent.every((mail) => (mail.data as { totalCents: unknown }).totalCents === null)).toBe(
      true,
    );
  });

  it("une relivraison du même fait n'envoie aucun doublon (journal d'envoi)", async () => {
    const g = await group();
    const orderId = await placeOrder(g, "account");
    const [journal] = await ctx.prisma.subAccountNoticeSend.findMany({ take: 1 });
    expect(journal).toBeDefined();
    const before = mails.length;

    const subscriber = ctx.app.get(NotifyPrincipalOnOrderPlaced, { strict: false });
    await ctx.app.get(UnitOfWork, { strict: false }).run(() =>
      subscriber.handle({
        eventId: journal?.eventId ?? "",
        type: COMMERCE_ORDER_PLACED,
        payload: { orderId },
      }),
    );

    expect(mails.length).toBe(before);
    expect(await ctx.prisma.subAccountNoticeSend.count()).toBe(3);
  });
});

describe("une commande annulée", () => {
  it("principal résilié : personne n'est prévenu ; suspendu : il l'est (Q2)", async () => {
    const g = await group();
    const first = await placeOrder(g, "account");
    const second = await placeOrder(g, "account");

    await ctx.prisma.company.update({ where: { id: g.principal }, data: { status: "suspended" } });
    await cancel(first);
    // Annulée par l'équipe : la gouvernante, admin du principal, n'a pas fait
    // CE geste — elle est prévenue comme les autres.
    expect(recipients(notices("cancelled"))).toEqual(
      [g.admin, g.orders, g.owner, `${g.housekeeper}@alpes.test`].sort(),
    );

    await ctx.prisma.company.update({ where: { id: g.principal }, data: { status: "terminated" } });
    await cancel(second);
    expect(notices("cancelled")).toHaveLength(4);
  });

  /**
   * Le BLOQUANT de vitruve (§7) : relire `parent_company_id` à la livraison
   * ferait fuiter une commande d'avant le changement de groupe vers le
   * nouveau principal.
   */
  it("un site rattaché ailleurs APRÈS sa commande : c'est l'ancien principal qui est prévenu, jamais le nouveau", async () => {
    const g = await group();
    const orderId = await placeOrder(g, "account");
    const other = (await createCompany(ctx.prisma, { raisonSociale: "SAS Autre Groupe" })).id;
    const stranger = await member(other, CustomerRole.owner);
    // Détacher puis rattacher : la base refuse un remplacement direct.
    await ctx.prisma.company.update({ where: { id: g.site }, data: { parentCompanyId: null } });
    await ctx.prisma.company.update({ where: { id: g.site }, data: { parentCompanyId: other } });

    await cancel(orderId);

    const sent = recipients(notices("cancelled"));
    expect(sent).toEqual([g.admin, g.orders, g.owner, `${g.housekeeper}@alpes.test`].sort());
    expect(sent).not.toContain(stranger);
  });
});

/** Le webhook Stripe, rejoué par sa commande — comme `order-payment-reprise`. */
async function settleCard(orderId: string, outcome: "succeeded" | "failed"): Promise<void> {
  const { stripePaymentIntentId } = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { stripePaymentIntentId: true },
  });
  await ctx.app
    .get(CommandBus)
    .execute(new ConfirmOrderPaymentCommand(stripePaymentIntentId ?? "", outcome));
  await ctx.drain();
}

describe("une commande CARTE d'un site (Hugo, 2026-10-20)", () => {
  it("rien à la passation ; l'avis « passée » part au paiement confirmé", async () => {
    const g = await group();
    await ctx.prisma.companyFollow.deleteMany({ where: { companyId: g.site } });

    const orderId = await placeOrder(g, "card");
    expect(notices("placed")).toEqual([]);

    await settleCard(orderId, "succeeded");

    expect(recipients(notices("placed"))).toEqual([g.admin, g.orders, g.owner].sort());
  });

  it("refus de carte d'une commande au compte du principal : owner et billing", async () => {
    const g = await group();
    const orderId = await placeOrder(g, "card");
    const { billedCompanyId } = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { billedCompanyId: true },
    });
    expect(billedCompanyId).toBe(g.principal);

    await settleCard(orderId, "failed");

    expect(recipients(notices("payment_failed"))).toEqual([g.billing, g.owner].sort());
  });
});

describe("une commande saisie par l'équipe pour un site", () => {
  it("prévient le principal, dit « saisie par l'équipe », et la gouvernante n'en est pas l'auteur", async () => {
    const g = await group();
    const buyer = await ctx.prisma.user.findUniqueOrThrow({ where: { auth0Sub: g.housekeeper } });

    await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/orders")
      .send({
        companyId: g.site,
        buyerUserId: buyer.id,
        settlement: "account",
        requestedDeliveryDate: SERVICE_DAY,
        fulfillmentMethod: "pickup",
        pickupAddressId: pickupId,
        requestedWindow: { start: "07:00", end: "08:00" },
        lines: [{ sku: "VIE-001", quantity: 2 }],
      })
      .expect(201);
    await ctx.drain();

    const sent = notices("placed");
    expect(recipients(sent)).toEqual(
      [g.admin, g.orders, g.owner, `${g.housekeeper}@alpes.test`].sort(),
    );
    expect(sent.every((mail) => (mail.data as { enteredByTeam: boolean }).enteredByTeam)).toBe(
      true,
    );
  });
});
