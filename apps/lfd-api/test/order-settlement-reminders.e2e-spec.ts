/**
 * E2E du **rappel de règlement** (plan
 * `documentation/commandes/reglement/architecture-abandon-du-reglement.md`, lot 10, Q6) : une
 * commande saisie par l'équipe avec un lien de paiement, pas réglée à l'heure
 * limite de sa journée, fait sonner la cloche — une fois.
 *
 * Ce que seul le vrai Postgres prouve : le `where` du lecteur (saisie par
 * l'équipe, intention Stripe, `placed`, non encaissée), la porte machine du
 * Cron Trigger, et l'anti-doublon de la cloche en base.
 *
 * Les commandes sont passées par le vrai chemin (plan T) — saisies par
 * l'équipe (`placeOrderForCustomer`) ou par le client (`placeOrder`), cinq jours
 * avant leur journée pour passer sous l'heure limite ; le règlement, le refus et
 * l'annulation passent par les vraies commandes. Seule la passerelle de carte
 * est doublée.
 */
import { CommandBus } from "@nestjs/cqrs";

import { CancelOrderCommand } from "../src/b2b/orders/application/commands/cancel-order.command.js";
import { ConfirmOrderPaymentCommand } from "../src/b2b/orders/application/commands/confirm-order-payment.command.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { CustomerRole, DeferredTerm } from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_ID,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { pickupSite, placeOrder, placeOrderForCustomer } from "./order-factory.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const ROUTE = "/admin/orders/settlement-reminders";
const KIND = "order.settlement_overdue";

/** Limite = trois jours avant, à minuit : demain est passé, dans dix jours ne l'est pas. */
const OVERDUE_DAY = serviceDay(1);
const OPEN_DAY = serviceDay(10);

/** Passée cinq jours avant : sous l'heure limite de demain comme de dans dix jours. */
const PLACED_DAYS_AGO = 5;

let ctx: E2eContext;
let seq = 0;

/** Passerelle de carte doublée : une intention par passation, rien d'autre. */
const fakeGateway = {
  createIntent: () => {
    const paymentIntentId = `pi_rappel_${String(seq)}`;
    return Promise.resolve({ paymentIntentId, clientSecret: `${paymentIntentId}_secret` });
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [{ token: PaymentGateway, value: fakeGateway }] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await ctx.prisma.orderCutoff.create({
    data: { pickupAddressId: null, weekday: null, daysBefore: 3, time: "00:00", graceMinutes: 0 },
  });
});

/** Ce qui arrive au règlement après la passation, par les vraies commandes. */
type Outcome = "pending" | "failed" | "paid" | "cancelled";

interface Seed {
  readonly day?: string;
  readonly byStaff?: boolean;
  /** `false` = saisie au compte : aucune intention, rien à encaisser. */
  readonly link?: boolean;
  readonly outcome?: Outcome;
}

/** Une société active, son acheteur, et — saisie au compte — un crédit accordé. */
async function buyerOf(onAccount: boolean): Promise<{ companyId: string; buyerUserId: string }> {
  const author = await createUser(ctx.prisma, {
    auth0Sub: `auth0|rappel-${seq}`,
    email: `rappel-${seq}@example.test`,
  });
  const company = await createCompany(ctx.prisma, { enseigne: "Hôtel des Cimes" });
  if (onAccount) {
    await ctx.prisma.company.update({
      where: { id: company.id },
      data: { grantedTerms: [DeferredTerm.monthly] },
    });
  }
  await attachTo(ctx.prisma, author.id, company.id, CustomerRole.owner);
  return { companyId: company.id, buyerUserId: author.id };
}

async function seedOrder(seed: Seed = {}): Promise<string> {
  seq += 1;
  const buyer = await buyerOf(seed.link === false);
  const common = {
    ...buyer,
    fulfillment: { method: "pickup" as const, pickupSiteId: await pickupSite(ctx.prisma) },
    forDay: seed.day ?? OVERDUE_DAY,
    placedAt: new Date(daysAgo(PLACED_DAYS_AGO)),
  };
  const order =
    seed.byStaff === false
      ? await placeOrder(ctx, { ...common, settlement: "card" })
      : await placeOrderForCustomer(ctx, {
          ...common,
          staffUserId: E2E_STAFF_ID,
          settlement: seed.link === false ? "account" : "link",
        });
  await settle(order, seed.outcome ?? "pending");
  return order.id;
}

/** Fait arriver au règlement ce que le test demande : webhook de carte, ou annulation staff. */
async function settle(
  order: { readonly id: string; readonly paymentIntentId: string | null },
  outcome: Outcome,
): Promise<void> {
  const bus = ctx.app.get(CommandBus);
  if (outcome !== "pending" && order.paymentIntentId !== null) {
    const card = outcome === "paid" ? "succeeded" : "failed";
    await bus.execute(new ConfirmOrderPaymentCommand(order.paymentIntentId, card));
  }
  if (outcome === "cancelled") {
    await bus.execute(new CancelOrderCommand(order.id, E2E_STAFF_ID, "Le client renonce."));
  }
  await ctx.drain();
}

async function pass(): Promise<{ readonly overdue: number }> {
  const response = await ctx
    .http()
    .post(ROUTE)
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  return jsonBody<{ readonly overdue: number }>(response);
}

const bells = () =>
  ctx.prisma.staffNotification.findMany({ where: { kind: KIND }, select: { link: true } });

describe(`POST ${ROUTE}`, () => {
  it("refuse sans jeton interne (401)", async () => {
    await ctx.http().post(ROUTE).expect(401);
  });

  it("sonne pour un lien non réglé passé l'heure limite, une seule fois", async () => {
    const orderId = await seedOrder();

    expect(await pass()).toEqual({ overdue: 1 });
    expect(await pass()).toEqual({ overdue: 1 });

    expect(await bells()).toEqual([{ link: `/commandes/${orderId}` }]);
  });

  it("une carte refusée compte aussi : le règlement n'est pas encaissé", async () => {
    await seedOrder({ outcome: "failed" });

    expect(await pass()).toEqual({ overdue: 1 });
  });

  it("se tait avant l'heure limite", async () => {
    await seedOrder({ day: OPEN_DAY });

    expect(await pass()).toEqual({ overdue: 0 });
    expect(await bells()).toEqual([]);
  });

  it("ignore ce qui n'est pas un lien de l'équipe resté en l'air", async () => {
    await seedOrder({ byStaff: false });
    await seedOrder({ link: false });
    await seedOrder({ outcome: "paid" });
    await seedOrder({ outcome: "cancelled" });

    expect(await pass()).toEqual({ overdue: 0 });
    expect(await bells()).toEqual([]);
  });
});
