import type request from "supertest";

import { OrderMailOrigins } from "../src/b2b/orders/domain/ports/order-mail-origins.js";
import { CommandBus } from "@nestjs/cqrs";

import { CancelOrderCommand } from "../src/b2b/orders/application/commands/cancel-order.command.js";
import { ConfirmOrderPaymentCommand } from "../src/b2b/orders/application/commands/confirm-order-payment.command.js";
import {
  CompanyStatus,
  CustomerRole,
  OrderStatus,
  PaymentStatus,
} from "../src/platform/database/client/client.js";
import { daysAgo, E2E_STAFF_ID, E2E_STAFF_SUB, serviceDay } from "./e2e-harness.js";
import { createCompany, createGuest, createUser } from "./factories.js";
import {
  handOver,
  payByCard,
  pickupSite,
  placeOrder,
  type PlacedTestOrder,
} from "./order-factory.js";
import { bootScene, context, scene } from "./order-staff-cancel-scene.js";

/**
 * **La scène de l'annulation par le client** (doc
 * `documentation/commandes/annulation/annulation-par-le-client.md`, lot C6).
 *
 * Elle s'appuie sur celle de l'annulation staff — Stripe, le courrier, le
 * guichet du fournil et la lecture de la clôture y sont doublés ou enveloppés,
 * tout le reste tourne sur le vrai Postgres — et lui ajoute ce que le client
 * apporte : des personnes (compte, invité, membres acceptés ou non), le
 * réglage ouvert par la VRAIE route admin, et l'origine de l'app cliente.
 *
 * Les commandes sont passées par le vrai chemin (`placeOrder`, plan T) ;
 * les états qu'aucun geste ne produit sont posés après coup, datés au-dessus
 * de leur écriture (`seedCustomerOrder`). Aucune date absolue : un jour de
 * service se dit en jours depuis aujourd'hui.
 */

export const CLIENT_BASE_URL = "https://app.lfc.test";

const origins = { clientBaseUrl: () => CLIENT_BASE_URL, adminBaseUrl: () => null };

export const bootCustomerScene = () => bootScene([{ token: OrderMailOrigins, value: origins }]);

let seq = 0;
const next = () => {
  seq += 1;
  return String(seq);
};

/** Un client qui peut se connecter : son `sub` est son jeton dans les e2e. */
export async function customer(): Promise<{ readonly id: string; readonly sub: string }> {
  const n = next();
  const sub = `auth0|client-annule-${n}`;
  const user = await createUser(context().prisma, {
    auth0Sub: sub,
    email: `client-annule-${n}@example.test`,
    firstName: "Léa",
    lastName: "Petit",
  });
  return { id: user.id, sub };
}

/** Un invité : aucune identité de connexion. */
export async function guest(): Promise<{ readonly id: string }> {
  const user = await createGuest(context().prisma, {
    email: `invite-annule-${next()}@example.test`,
    firstName: "Paul",
  });
  return { id: user.id };
}

/** Une société, `active` par défaut. */
export async function company(status: CompanyStatus = CompanyStatus.active): Promise<string> {
  return (await createCompany(context().prisma, { enseigne: `Hôtel ${next()}`, status })).id;
}

/**
 * Un rattachement. `accepted: false` : une invitation VIVANTE non acceptée —
 * ce que `attachTo` sème par défaut, et que le mur d'annulation refuse (B2).
 */
export async function member(
  userId: string,
  companyId: string,
  options: { readonly accepted?: boolean; readonly role?: CustomerRole } = {},
): Promise<void> {
  await context().prisma.membership.create({
    data: {
      userId,
      companyId,
      role: options.role ?? CustomerRole.orders,
      acceptedAt: options.accepted === false ? null : new Date(Date.now()),
    },
  });
}

export interface CustomerOrderSeed {
  readonly placedByUserId: string;
  /** La société ; l'auteur doit en être membre ACCEPTÉ, comme à la vraie passation. */
  readonly companyId?: string | null;
  /** Le jour de service, en jours depuis aujourd'hui (Paris) ; `null` = sans date. */
  readonly inDays?: number | null;
  /** `cancelled` et `fulfilled` par leurs vrais gestes ; tout autre posé après coup. */
  readonly status?: OrderStatus;
  /**
   * `pending` (défaut) : carte en attente ; `paid` / `failed` : par la vraie
   * confirmation ; `not_required` : au compte (la société en reçoit le terme).
   */
  readonly payment?: PaymentStatus;
}

/** Une commande passée : son identifiant, son numéro, et l'intention de carte liée. */
export interface SeededCustomerOrder {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly intent: string | null;
}

/** Les jours d'avance par défaut : une commande pour la semaine prochaine. */
const DEFAULT_IN_DAYS = 7;
/** La passation précède le jour de service d'une semaine, pour un jour passé. */
const LEAD_DAYS = 7;

/**
 * Une commande d'un croissant, retrait, par défaut dans 7 jours et carte en
 * attente — passée par le vrai chemin (`placeOrder`, plan T). Un jour de
 * service PASSÉ se passe une semaine avant lui, sous une horloge antidatée.
 */
export async function seedCustomerOrder(seed: CustomerOrderSeed): Promise<SeededCustomerOrder> {
  const ctx = context();
  const companyId = seed.companyId ?? null;
  const onAccount = seed.payment === PaymentStatus.not_required;
  if (onAccount && companyId !== null) {
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { grantedTerms: ["monthly"] },
    });
  }
  const inDays = seed.inDays ?? DEFAULT_IN_DAYS;
  const mailsBefore = scene.mails.length;
  const order = await placeOrder(ctx, {
    buyerUserId: seed.placedByUserId,
    companyId,
    settlement: onAccount ? "account" : "card",
    forDay: serviceDay(inDays),
    ...(inDays < 1 ? { placedAt: new Date(daysAgo(LEAD_DAYS - inDays)) } : {}),
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    // « Avant midi », sans début : le délai du particulier s'ancre alors à
    // minuit du jour, la borne la plus tôt — un `too_late` à J+1 ne dépend pas
    // de l'heure à laquelle la suite tourne.
    window: { start: null, end: "12:00" },
    lines: [{ sku: "VIE-001", quantity: 1 }],
  });
  await settle(order, seed.payment);
  await reachStatus(order, seed);
  // La passation et ses suites ont écrit au client : pas le sujet des suites.
  scene.mails.splice(mailsBefore);
  return { orderId: order.id, orderNumber: order.orderNumber, intent: order.paymentIntentId };
}

/** La carte réglée ou refusée par la vraie confirmation ; en attente sinon. */
async function settle(order: PlacedTestOrder, payment: PaymentStatus | undefined): Promise<void> {
  if (payment === PaymentStatus.paid) {
    await payByCard(context(), order);
  } else if (payment === PaymentStatus.failed && order.paymentIntentId !== null) {
    await context()
      .app.get(CommandBus)
      .execute(new ConfirmOrderPaymentCommand(order.paymentIntentId, "failed"));
    await context().drain();
  }
}

/**
 * Le statut demandé : `cancelled` par l'annulation de l'équipe, `fulfilled`
 * par la remise. **Exceptions gardées du plan T (2026-10-25)**, posées en
 * base après la vraie passation : une commande SANS jour de service (la
 * passation en exige un) et tout autre statut (`ready`, `confirmed`…), que
 * seuls le fournil et le colisage entiers produiraient.
 */
async function reachStatus(order: PlacedTestOrder, seed: CustomerOrderSeed): Promise<void> {
  const ctx = context();
  if (seed.status === OrderStatus.cancelled) {
    await ctx.app
      .get(CommandBus)
      .execute(new CancelOrderCommand(order.id, E2E_STAFF_ID, "Le client renonce."));
    await ctx.drain();
  } else if (seed.status === OrderStatus.fulfilled) {
    await handOver(ctx, order);
  }
  const forced =
    seed.status !== undefined &&
    seed.status !== OrderStatus.cancelled &&
    seed.status !== OrderStatus.fulfilled &&
    seed.status !== OrderStatus.placed;
  if (!forced && seed.inDays !== null) {
    return;
  }
  await ctx.prisma.order.update({
    where: { id: order.id },
    data: {
      ...(forced ? { status: seed.status } : {}),
      ...(seed.inDays === null ? { requestedDeliveryDate: null } : {}),
    },
  });
}

/** Le réglage, posé par la VRAIE route staff (C6.5). */
export async function setCancellation(delayEnabled: boolean, hoursBefore = 24): Promise<void> {
  await context()
    .asSub(E2E_STAFF_SUB)
    .patch("/admin/customer-cancellation")
    .send({ delayEnabled, hoursBefore })
    .expect(204);
}

/** `POST /orders/:id/cancel` sous le `sub` du client. */
export function customerCancel(sub: string, orderId: string, body: object = {}): request.Test {
  return context().asSub(sub).post(`/orders/${orderId}/cancel`).send(body);
}

let ip = 0;
/** Un visiteur anonyme, sur une IP à lui : chaque test a son propre seau de débit. */
export function visitor(): request.Agent {
  ip += 1;
  return context()
    .http()
    .set("x-lfc-client-ip", `198.51.100.${String(ip % 250)}`);
}
