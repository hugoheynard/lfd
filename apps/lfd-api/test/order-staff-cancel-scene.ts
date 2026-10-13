import { lineTotalCents } from "@lfd/money";
import type request from "supertest";

import { PrismaDayOrdersReader } from "../src/b2b/orders/infrastructure/prisma-day-orders.reader.js";
import {
  PaymentGateway,
  type IntentCancellation,
} from "../src/b2b/payments/domain/payment-gateway.js";
import {
  OrderClientele,
  OrderStatus,
  PaymentStatus,
} from "../src/platform/database/client/client.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { OutboxRelay } from "../src/platform/outbox/outbox-relay.js";
import { ProductionOrderWithdrawalDesk } from "../src/production/application/services/production-order-withdrawal.desk.js";
import {
  DayOrdersReader,
  OrderWithdrawalDesk,
  type ProducibleOrder,
  type ServiceDay,
} from "../src/production/channels/commerce/index.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  serviceDay,
  type E2eContext,
  type E2eOverride,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

/**
 * **La scène de l'annulation staff** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, lot C3) — partagée par
 * les deux suites, celle des gestes et celle des courses.
 *
 * Doublés : la signature des jetons (le jeton EST le `sub`), Stripe (une issue
 * d'annulation écrite d'avance), le courrier (enregistré). Et deux
 * ENVELOPPES, qui délèguent au vrai code : la lecture des commandes du
 * fournil (pour glisser une annulation entre sa lecture et son verrou) et le
 * guichet du retrait (pour faire tomber la transaction après Stripe). Tout le
 * reste tourne sur le vrai Postgres.
 *
 * Les commandes sont semées par Prisma, faute d'agrégat qui sache écrire une
 * commande à un état donné (même dette que `order-abandon.e2e-spec.ts`).
 */

export const DAY = serviceDay();

export const scene = {
  ctx: null as E2eContext | null,
  cancellation: { kind: "cancelled" } as IntentCancellation,
  cancelledIntents: [] as string[],
  mails: [] as { readonly to: string; readonly template: string; readonly data: unknown }[],
  /** Joué une fois, juste après la lecture des commandes par la clôture ou le retirage. */
  afterProducibleRead: null as (() => Promise<void>) | null,
  /** Nombre de retraits qui échoueront encore — une panne de base dans la transaction. */
  withdrawalFailures: 0,
};

export function context(): E2eContext {
  if (scene.ctx === null) {
    throw new Error("la scène n'est pas bootée");
  }
  return scene.ctx;
}

let created = 0;
const fakeGateway = {
  createIntent: () => {
    created += 1;
    const id = `pi_passation_${String(created)}`;
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
  },
  retrieveIntent: () => Promise.reject(new Error("non utilisé")),
  cancelIntent: (id: string) => {
    scene.cancelledIntents.push(id);
    return Promise.resolve(scene.cancellation);
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
};

const recordingMailer = {
  enabled: true,
  send: (args: {
    readonly to: string;
    readonly template: string;
    readonly data: unknown;
  }): Promise<{ providerId: null }> => {
    scene.mails.push(args);
    return Promise.resolve({ providerId: null });
  },
};

/** La vraie lecture des commandes, puis le geste glissé avant le verrou. */
const dayOrders = {
  producibleFor: async (day: ServiceDay): Promise<readonly ProducibleOrder[]> => {
    const rows = await context()
      .app.get(PrismaDayOrdersReader, { strict: false })
      .producibleFor(day);
    const hook = scene.afterProducibleRead;
    scene.afterProducibleRead = null;
    if (hook !== null) {
      await hook();
    }
    return rows;
  },
};

/** Le vrai guichet, sauf quand une panne est demandée. */
const flakyDesk = {
  withdraw: (day: ServiceDay, orderId: string) => {
    if (scene.withdrawalFailures > 0) {
      scene.withdrawalFailures -= 1;
      return Promise.reject(new Error("la connexion à la base est tombée"));
    }
    return context()
      .app.get(ProductionOrderWithdrawalDesk, { strict: false })
      .withdraw(day, orderId);
  },
};

/** `extra` : d'autres doublures, propres à une suite (l'horloge du bon, lot C3b). */
export async function bootScene(extra: readonly E2eOverride[] = []): Promise<E2eContext> {
  scene.ctx = await bootstrapE2e({
    overrides: [
      ADMIN_VERIFIER_OVERRIDE,
      { token: PaymentGateway, value: fakeGateway },
      { token: MAILER, value: recordingMailer },
      { token: DayOrdersReader, value: dayOrders },
      { token: OrderWithdrawalDesk, value: flakyDesk },
      ...extra,
    ],
  });
  return scene.ctx;
}

export async function resetScene(): Promise<void> {
  await context().reset();
  scene.cancellation = { kind: "cancelled" };
  scene.cancelledIntents.splice(0);
  scene.mails.splice(0);
  scene.afterProducibleRead = null;
  scene.withdrawalFailures = 0;
}

export interface OrderSeed {
  readonly clientele?: OrderClientele;
  readonly status?: OrderStatus;
  readonly payment?: PaymentStatus;
  readonly totalCents?: number;
  readonly intent?: string | null;
  readonly voucherId?: string | null;
}

let seq = 0;

/** Une commande d'un croissant pour {@link DAY} — carte en attente, particulier, par défaut. */
export async function seedOrder(seed: OrderSeed = {}): Promise<{
  readonly orderId: string;
  readonly orderNumber: string;
  readonly intent: string | null;
}> {
  seq += 1;
  const ctx = context();
  const author = await createUser(ctx.prisma, {
    auth0Sub: `auth0|annulation-${String(seq)}`,
    email: `annulation-${String(seq)}@example.test`,
  });
  const clientele = seed.clientele ?? OrderClientele.public;
  let companyId: string | null = null;
  if (clientele === OrderClientele.pro) {
    const company = await createCompany(ctx.prisma, { enseigne: "Hôtel des Cimes" });
    companyId = company.id;
    await attachTo(ctx.prisma, author.id, company.id);
  }
  const totalCents = seed.totalCents ?? 1_055;
  const intent = seed.intent === undefined ? `pi_annulation_${String(seq)}` : seed.intent;
  const orderNumber = `CMD-ANNULATION-${String(seq)}`;
  const order = await ctx.prisma.order.create({
    data: {
      orderNumber,
      placedByUserId: author.id,
      companyId,
      clientele,
      status: seed.status ?? OrderStatus.placed,
      requestedDeliveryDate: new Date(`${DAY}T00:00:00.000Z`),
      fulfillmentMethod: "pickup",
      subtotalCents: totalCents === 0 ? 0 : 1_000,
      totalCents,
      vatCents: totalCents === 0 ? 0 : 55,
      paymentStatus: seed.payment ?? PaymentStatus.pending,
      stripePaymentIntentId: intent,
      loyaltyVoucherId: seed.voucherId ?? null,
      lines: {
        create: [
          {
            sku: "VIE-001",
            productNameSnapshot: "Croissant",
            unitPriceMillicents: 100_000,
            quantity: 1,
            lineTotalCents: lineTotalCents(100_000, 1),
          },
        ],
      },
    },
    select: { id: true },
  });
  return { orderId: order.id, orderNumber, intent };
}

/** Une commande à total nul, sans règlement — le régime `free`. */
export const seedFreeOrder = (seed: OrderSeed = {}) =>
  seedOrder({ payment: PaymentStatus.not_required, totalCents: 0, intent: null, ...seed });

export const REASON = "Le client a appelé : il part en vacances";

/** `POST /admin/orders/:id/cancel`, sous le `sub` donné (l'opérateur par défaut). */
export function cancelRequest(orderId: string, sub = E2E_STAFF_SUB, reason = REASON): request.Test {
  return context().asSub(sub).post(`/admin/orders/${orderId}/cancel`).send({ reason });
}

/** Livre ce que la boîte d'envoi porte, et attend les abonnés de fond. */
export async function deliver(): Promise<void> {
  const ctx = context();
  await ctx.app.get(OutboxRelay).sweep();
  await ctx.drain();
}

export function orderState(orderId: string) {
  return context().prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      status: true,
      paymentStatus: true,
      cancelledAt: true,
      cancelledBy: true,
      cancellationReason: true,
    },
  });
}

export const cancelledMails = () =>
  scene.mails.filter((mail) => mail.template === "customer.order-cancelled");

export const withdrawals = () => context().prisma.orderWithdrawal.findMany();
