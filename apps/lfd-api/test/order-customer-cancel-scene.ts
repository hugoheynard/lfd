import { lineTotalCents } from "@lfd/money";
import type request from "supertest";

import { OrderMailOrigins } from "../src/b2b/orders/domain/ports/order-mail-origins.js";
import {
  CompanyStatus,
  CustomerRole,
  OrderClientele,
  OrderStatus,
  PaymentStatus,
} from "../src/platform/database/client/client.js";
import { E2E_STAFF_SUB, serviceDay } from "./e2e-harness.js";
import { createCompany, createGuest, createUser } from "./factories.js";
import { bootScene, context } from "./order-staff-cancel-scene.js";

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
 * Les commandes sont semées par Prisma, faute d'agrégat qui sache écrire une
 * commande à un état donné (même dette que la scène staff). Aucune date
 * absolue : un jour de service se dit en jours depuis aujourd'hui.
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
  readonly companyId?: string | null;
  /** Le jour de service, en jours depuis aujourd'hui (Paris) ; `null` = sans date. */
  readonly inDays?: number | null;
  readonly status?: OrderStatus;
  readonly payment?: PaymentStatus;
  readonly totalCents?: number;
  /** `HH:mm` du début du créneau figé. */
  readonly windowStart?: string;
}

/** Une commande d'un croissant, carte en attente, retrait, par défaut dans 7 jours. */
export async function seedCustomerOrder(seed: CustomerOrderSeed): Promise<{
  readonly orderId: string;
  readonly orderNumber: string;
}> {
  const n = next();
  const day = seed.inDays === null ? null : serviceDay(seed.inDays ?? 7);
  const totalCents = seed.totalCents ?? 1_055;
  const orderNumber = `CMD-CLIENT-${n}`;
  const order = await context().prisma.order.create({
    data: {
      orderNumber,
      placedByUserId: seed.placedByUserId,
      companyId: seed.companyId ?? null,
      clientele:
        seed.companyId === undefined || seed.companyId === null
          ? OrderClientele.public
          : OrderClientele.pro,
      status: seed.status ?? OrderStatus.placed,
      requestedDeliveryDate: day === null ? null : new Date(`${day}T00:00:00.000Z`),
      fulfillmentMethod: "pickup",
      ...(seed.windowStart === undefined
        ? {}
        : {
            fulfillment: {
              window: { value: { start: seed.windowStart, end: "12:00" }, source: "override" },
              contact: { value: null, source: "default" },
              signatureRequired: { value: false, source: "default" },
            },
          }),
      subtotalCents: totalCents === 0 ? 0 : 1_000,
      totalCents,
      vatCents: totalCents === 0 ? 0 : 55,
      paymentStatus: seed.payment ?? PaymentStatus.pending,
      stripePaymentIntentId: `pi_client_${n}`,
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
  return { orderId: order.id, orderNumber };
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
