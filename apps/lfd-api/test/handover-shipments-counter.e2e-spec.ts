/**
 * E2E du **comptoir** (`documentation/commandes/reliquat/reliquat.md`).
 *
 * Ce que seul le vrai Postgres prouve : que le jeton d'une commande colisée
 * la rend prête au rang 1, que `{}` la remet par le scan, et qu'un corps hors
 * forme est refusé avant tout geste.
 *
 * Doublés : la signature des jetons (le jeton EST le `sub`) et Stripe.
 */
import type { AdminPlacedOrderResponse, OrderHandoverView } from "@lfd/contracts";

import { CardProviders } from "../src/payment/card/domain/ports/card-providers.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { DurablePublisher } from "../src/platform/outbox/durable-publisher.js";
import { PackingOrderPackedEvent } from "../src/packing/channels/commerce/index.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { cardGatewayDouble } from "./order-factory.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

const DAY = serviceDay(7);
const BUYER = "auth0|acheteur-comptoir-envois";

const fakeGateway = cardGatewayDouble("pi_hsc");

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      {
        token: AdminTokenVerifier,
        value: {
          verify: (): Promise<{ subject: string; scopes: string[] }> =>
            Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
        },
      },
      { token: CardProviders, value: fakeGateway },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Un point de retrait et une société au compte. */
interface Scene {
  readonly companyId: string;
  readonly buyerUserId: string;
  readonly pickupId: string;
}

async function scene(): Promise<Scene> {
  const point = await ctx.prisma.site.create({
    data: {
      label: "Labo",
      ligne1: "1 rue du Four",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const user = await createUser(ctx.prisma, {
    auth0Sub: BUYER,
    email: "acheteur-comptoir-envois@test.fr",
  });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  return { companyId: company.id, buyerUserId: user.id, pickupId: point.id };
}

function content(pickupId: string, quantity: number): Record<string, unknown> {
  return {
    requestedDeliveryDate: DAY,
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: [{ sku: "VIE-001-1", quantity }],
  };
}

/** Une commande au compte, saisie par l'équipe. */
async function placeOnAccount(where: Scene, quantity = 10): Promise<string> {
  const response = await staff()
    .post("/admin/orders")
    .set(INTENT_KEY, freshIntent())
    .send({
      companyId: where.companyId,
      buyerUserId: where.buyerUserId,
      settlement: "account",
      ...content(where.pickupId, quantity),
    })
    .expect(201);
  return jsonBody<AdminPlacedOrderResponse>(response).id;
}

async function closePlan(): Promise<void> {
  await staff().post(`/admin/production/batch/${DAY}/close`).expect(201);
  await ctx.drain();
}

async function numberOf(orderId: string): Promise<string> {
  const { orderNumber } = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { orderNumber: true },
  });
  return orderNumber;
}

/** Le bac fermé au colisage, publié comme le colisage le publie : dans une unité de travail. */
async function packed(orderId: string, rank: number): Promise<void> {
  const fact = new PackingOrderPackedEvent(
    orderId,
    rank,
    await numberOf(orderId),
    new Date(),
    E2E_STAFF_ID,
  );
  await ctx.app
    .get(UnitOfWork)
    .run(() => ctx.app.get(DurablePublisher).publish(fact.durableFact()));
  await ctx.drain();
}

function attestationsOf(orderId: string) {
  return ctx.prisma.orderHandover.findMany({
    where: { orderId },
    orderBy: { rank: "asc" },
    select: { rank: true, reference: true },
  });
}

async function tokenOf(orderId: string): Promise<string> {
  const { handoverToken } = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { handoverToken: true },
  });
  if (handoverToken === null) {
    throw new TypeError(`commande ${orderId} sans jeton de retrait`);
  }
  return handoverToken;
}

describe("le comptoir", () => {
  it("un seul envoi : le scan rend la commande au rang 1, et `{}` la remet comme avant", async () => {
    const account = await placeOnAccount(await scene());
    await closePlan();
    await packed(account, 1);
    const token = await tokenOf(account);
    const number = await numberOf(account);

    const seen = jsonBody<OrderHandoverView>(
      await staff().get(`/admin/handover/${token}`).expect(200),
    );
    expect(seen).toMatchObject({ rank: 1, reference: number, blockedReason: null });
    expect(seen.shipments.map(({ rank }) => rank)).toEqual([1]);

    const done = jsonBody<OrderHandoverView>(
      await staff().post(`/admin/handover/${token}`).send({}).expect(201),
    );
    expect(done).toMatchObject({ rank: 1, handedOverVia: "scan", shipments: [] });
    expect(await attestationsOf(account)).toEqual([{ rank: 1, reference: number }]);
  });

  it("un corps hors forme est refusé avant tout geste", async () => {
    const account = await placeOnAccount(await scene());
    await closePlan();
    await packed(account, 1);

    await staff()
      .post(`/admin/handover/${await tokenOf(account)}`)
      .send({ ranks: [1, 1] })
      .expect(400);
    expect(await attestationsOf(account)).toEqual([]);
  });
});
