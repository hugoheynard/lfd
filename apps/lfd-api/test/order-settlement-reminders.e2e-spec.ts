/**
 * E2E du **rappel de règlement** (plan
 * `documentation/order/plan-abandon-du-reglement.md`, lot 10, Q6) : une
 * commande saisie par l'équipe avec un lien de paiement, pas réglée à l'heure
 * limite de sa journée, fait sonner la cloche — une fois.
 *
 * Ce que seul le vrai Postgres prouve : le `where` du lecteur (saisie par
 * l'équipe, intention Stripe, `placed`, non encaissée), la porte machine du
 * Cron Trigger, et l'anti-doublon de la cloche en base.
 *
 * Les commandes sont semées par Prisma, faute d'agrégat qui sache écrire une
 * commande à un état donné (même dette que `production-closing-sweep`).
 */
import { lineTotalCents } from "@lfd/money";

import {
  OrderClientele,
  OrderStatus,
  PaymentStatus,
} from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { createCompany, createUser } from "./factories.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const ROUTE = "/admin/orders/settlement-reminders";
const KIND = "order.settlement_overdue";

/** Limite = trois jours avant, à minuit : demain est passé, dans dix jours ne l'est pas. */
const OVERDUE_DAY = serviceDay(1);
const OPEN_DAY = serviceDay(10);

let ctx: E2eContext;
let seq = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e();
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

interface Seed {
  readonly day?: string;
  readonly byStaff?: boolean;
  readonly link?: boolean;
  readonly payment?: PaymentStatus;
  readonly status?: OrderStatus;
}

async function seedOrder(seed: Seed = {}): Promise<string> {
  seq += 1;
  const author = await createUser(ctx.prisma, {
    auth0Sub: `auth0|rappel-${seq}`,
    email: `rappel-${seq}@example.test`,
  });
  const company = await createCompany(ctx.prisma, { enseigne: "Hôtel des Cimes" });
  const day = seed.day ?? OVERDUE_DAY;
  const order = await ctx.prisma.order.create({
    data: {
      orderNumber: `CMD-RAPPEL-${seq}`,
      placedByUserId: author.id,
      placedByStaffId: seed.byStaff === false ? null : E2E_STAFF_ID,
      companyId: company.id,
      clientele: OrderClientele.pro,
      status: seed.status ?? OrderStatus.placed,
      requestedDeliveryDate: new Date(`${day}T00:00:00.000Z`),
      fulfillmentMethod: "pickup",
      subtotalCents: 1_000,
      totalCents: 1_055,
      vatCents: 55,
      paymentStatus: seed.payment ?? PaymentStatus.pending,
      stripePaymentIntentId: seed.link === false ? null : `pi_rappel_${seq}`,
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
  return order.id;
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
    await seedOrder({ payment: PaymentStatus.failed });

    expect(await pass()).toEqual({ overdue: 1 });
  });

  it("se tait avant l'heure limite", async () => {
    await seedOrder({ day: OPEN_DAY });

    expect(await pass()).toEqual({ overdue: 0 });
    expect(await bells()).toEqual([]);
  });

  it("ignore ce qui n'est pas un lien de l'équipe resté en l'air", async () => {
    await seedOrder({ byStaff: false });
    await seedOrder({ link: false, payment: PaymentStatus.not_required });
    await seedOrder({ payment: PaymentStatus.paid });
    await seedOrder({ status: OrderStatus.cancelled, payment: PaymentStatus.failed });

    expect(await pass()).toEqual({ overdue: 0 });
    expect(await bells()).toEqual([]);
  });
});
