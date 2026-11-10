import type request from "supertest";

import { SitedDayOrders } from "../src/lafoliecoffee/orders/application/services/sited-day-orders.service.js";
import type { CardPaymentCancellation } from "../src/card-payment/channels/requests/index.js";
import { CardProviders } from "../src/card-payment/domain/ports/card-providers.js";
import { MAILER } from "../src/mail/templates/mailer.tokens.js";
import { OutboxRelay } from "../src/platform/outbox/outbox-relay.js";
import { ProductionOrderWithdrawalDesk } from "../src/production/application/services/production-order-withdrawal.desk.js";
import {
  DayOrdersReader,
  OrderWithdrawalDesk,
  type ProducibleOrder,
  type OrderWithdrawalAllowance,
  type ServiceDay,
} from "../src/production/channels/commerce/index.js";
import { cardProvidersDouble, type E2eCardProvider } from "./card-payments.js";
import { started, untilBlocked } from "./day-lock-race.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  serviceDay,
  type E2eContext,
  type E2eOverride,
} from "./e2e-harness.js";

/**
 * **La scène de l'annulation staff** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, lot C3) — partagée par
 * les deux suites, celle des gestes et celle des courses.
 *
 * Doublés : la signature des jetons (le jeton EST le `sub`), le prestataire de
 * carte (une issue d'annulation écrite d'avance, sur le jeton `CardProviders`
 * du bloc `card-payment`, lot P0.c2), le courrier (enregistré). Et deux
 * ENVELOPPES, qui délèguent au vrai code : la lecture des commandes du
 * fournil (pour glisser une annulation entre sa lecture et son verrou) et le
 * guichet du retrait (pour faire tomber la transaction après Stripe). Tout le
 * reste tourne sur le vrai Postgres.
 *
 * Les commandes sont passées par le vrai chemin (`placeOrder`, plan T), dans
 * `order-staff-cancel-orders.ts` ; deux états qu'aucun geste court ne
 * produit y restent écrits en base, datés au-dessus de leur écriture.
 */

export const DAY = serviceDay();

/** Le prestataire de carte doublé : ses intentions s'appellent `pi_passation_<n>`. */
const cards = cardProvidersDouble("pi_passation");

export const scene = {
  ctx: null as E2eContext | null,
  /** L'issue de la prochaine annulation d'intention — portée par le prestataire doublé. */
  get cancellation(): CardPaymentCancellation {
    return cards.provider.cancellation;
  },
  set cancellation(outcome: CardPaymentCancellation) {
    cards.provider.cancellation = outcome;
  },
  /** Les intentions dont l'annulation a été demandée au prestataire. */
  cancelledIntents: cards.provider.cancelled,
  mails: [] as { readonly to: string; readonly template: string; readonly data: unknown }[],
  /** Joué une fois, juste après la lecture des commandes par la clôture ou le retirage. */
  afterProducibleRead: null as (() => Promise<void>) | null,
  /** Nombre de retraits qui échoueront encore — une panne de base dans la transaction. */
  withdrawalFailures: 0,
};

/** Le prestataire de carte doublé de la scène — celui du remboursement s'y branche (P1.c). */
export function sceneCardProvider(): E2eCardProvider {
  return cards.provider;
}

export function context(): E2eContext {
  if (scene.ctx === null) {
    throw new Error("la scène n'est pas bootée");
  }
  return scene.ctx;
}

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
    const rows = await context().app.get(SitedDayOrders, { strict: false }).producibleFor(day);
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
  withdraw: (day: ServiceDay, orderId: string, allowance: OrderWithdrawalAllowance) => {
    if (scene.withdrawalFailures > 0) {
      scene.withdrawalFailures -= 1;
      return Promise.reject(new Error("la connexion à la base est tombée"));
    }
    return context()
      .app.get(ProductionOrderWithdrawalDesk, { strict: false })
      .withdraw(day, orderId, allowance);
  },
};

/** `extra` : d'autres doublures, propres à une suite (l'horloge du bon, lot C3b). */
export async function bootScene(extra: readonly E2eOverride[] = []): Promise<E2eContext> {
  scene.ctx = await bootstrapE2e({
    overrides: [
      ADMIN_VERIFIER_OVERRIDE,
      { token: CardProviders, value: cards },
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

/**
 * Lance `gesture` pendant la lecture des commandes par la clôture ou le
 * retirage, et attend qu'il se range derrière leur verrou : depuis 52561f210
 * la lecture se fait sous le verrou, et le geste ne peut plus passer avant.
 * Rend de quoi lire sa réponse une fois l'arrêt terminé.
 */
export function gestureDuringRead(
  gesture: () => PromiseLike<request.Response>,
): () => Promise<request.Response> {
  let pending: Promise<request.Response> | null = null;
  scene.afterProducibleRead = async () => {
    const response = started(gesture());
    pending = response;
    await untilBlocked(context(), 1, response);
  };
  return () => {
    if (pending === null) {
      throw new Error("la lecture sous verrou n'a pas eu lieu : le geste n'est jamais parti");
    }
    return pending;
  };
}
