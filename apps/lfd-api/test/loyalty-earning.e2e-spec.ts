/**
 * E2E du **crédit de points** (plan `documentation/comptabilite/fidelite/plan-points-de-fidelite.md`,
 * lot D) : une commande remise ET encaissée rapporte ses points, une fois.
 *
 * Ce que seul le vrai SQL et le vrai bus prouvent :
 * - les deux abonnés (remise, règlement) créditent au second des deux faits,
 *   quel que soit l'ordre ;
 * - l'abonné et le rattrapage ne créditent jamais deux fois la même commande ;
 * - la lecture « définitive » d'`orders` : `not_required` et `pending` n'en
 *   sont pas, un invité ne gagne rien, un pro sans société non plus.
 *
 * Les commandes sont semées par Prisma, faute d'agrégat qui sache écrire une
 * commande remise (même dette que `test/factories.ts`) ; le règlement et la
 * remise, eux, passent par les vraies commandes du commerce.
 * Frontière doublée : la signature du jeton staff.
 */
import type { SetLoyaltySettingsPayload } from "@lfd/contracts";
import { CommandBus } from "@nestjs/cqrs";

import { LoyaltySettings } from "../src/b2b/loyalty/domain/value-objects/loyalty-settings.js";
import { PrismaLoyaltySettingsStore } from "../src/b2b/loyalty/infrastructure/prisma-loyalty-settings.store.js";

import { ConfirmOrderPaymentCommand } from "../src/b2b/orders/application/commands/confirm-order-payment.command.js";
import { MarkOrderFulfilledCommand } from "../src/b2b/orders/application/commands/mark-order-fulfilled.command.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  OrderClientele,
  OrderStatus,
  PaymentStatus,
} from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";
import { createCompany, createGuest, createUser } from "./factories.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const SETTINGS: SetLoyaltySettingsPayload = {
  pointsPerStep: 1_000,
  stepValueCents: 500,
  openToPublic: true,
  openToPro: false,
  voucherValidityDays: 365,
};

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let ctx: E2eContext;
let sequence = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

async function openProgram(): Promise<void> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .put("/admin/accounting/loyalty/settings")
    .send(SETTINGS)
    .expect(204);
}

/**
 * Ouvre AUSSI les pros — ce que l'écran et la commande refusent jusqu'au
 * lot F. On passe donc par l'adaptateur de stockage, pour éprouver dès
 * maintenant le crédit d'une société.
 */
async function openProgramToPro(): Promise<void> {
  await ctx.app
    .get(PrismaLoyaltySettingsStore)
    .write(LoyaltySettings.of({ ...SETTINGS, openToPro: true }), new Date(), E2E_STAFF_ID);
}

interface OrderSeed {
  readonly placedByUserId: string;
  readonly companyId?: string | null;
  readonly clientele?: OrderClientele;
  readonly paymentStatus?: PaymentStatus;
  readonly subtotalCents?: number;
  readonly discountCents?: number;
  readonly vatCents?: number;
  readonly deliveryFeeCents?: number;
  readonly lateFeeCents?: number;
}

/** Une commande prête au comptoir ; carte en attente par défaut. */
async function seedOrder(seed: OrderSeed): Promise<{ id: string; number: string; intent: string }> {
  sequence += 1;
  const number = `CMD-FID-${String(sequence)}`;
  const intent = `pi_fidelite_${String(sequence)}`;
  const subtotalCents = seed.subtotalCents ?? 2_340;
  const discountCents = seed.discountCents ?? 0;
  const deliveryFeeCents = seed.deliveryFeeCents ?? 0;
  const lateFeeCents = seed.lateFeeCents ?? 0;
  const vatCents = seed.vatCents ?? 0;
  const order = await ctx.prisma.order.create({
    data: {
      orderNumber: number,
      placedByUserId: seed.placedByUserId,
      companyId: seed.companyId ?? null,
      clientele: seed.clientele ?? OrderClientele.public,
      status: OrderStatus.ready,
      subtotalCents,
      discountCents,
      deliveryFeeCents,
      lateFeeCents,
      vatCents,
      totalCents: subtotalCents - discountCents + deliveryFeeCents + lateFeeCents + vatCents,
      paymentStatus: seed.paymentStatus ?? PaymentStatus.pending,
      stripePaymentIntentId: intent,
    },
    select: { id: true },
  });
  return { id: order.id, number, intent };
}

async function pay(intent: string): Promise<void> {
  await ctx.app.get(CommandBus).execute(new ConfirmOrderPaymentCommand(intent, "succeeded"));
  await ctx.drain();
}

async function handOver(number: string): Promise<void> {
  await ctx.app
    .get(CommandBus)
    .execute(new MarkOrderFulfilledCommand(number, E2E_STAFF_ID, new Date(), "scan"));
  await ctx.drain();
}

async function sweep(): Promise<{
  scanned: number;
  credited: number;
  expired: number;
  vouchers: { reserved: number; settled: number; stalled: number };
}> {
  const response = await ctx
    .http()
    .post("/admin/loyalty/sweep")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  return jsonBody(response);
}

function earned(): Promise<
  { orderId: string | null; points: number; userId: string | null; companyId: string | null }[]
> {
  return ctx.prisma.loyaltyLedgerEntry.findMany({
    where: { kind: "earned" },
    select: { orderId: true, points: true, userId: true, companyId: true },
  });
}

async function member(): Promise<string> {
  return (await createUser(ctx.prisma, { auth0Sub: "auth0|fidele", firstName: "Léa" })).id;
}

describe("le crédit au fil de l'eau — remise ET encaissement", () => {
  it("crédite au second fait quand la carte est réglée avant la remise — hors taxe, sans port ni surtaxe", async () => {
    await openProgram();
    const userId = await member();
    const order = await seedOrder({
      placedByUserId: userId,
      subtotalCents: 2_500,
      discountCents: 160,
      vatCents: 129,
      deliveryFeeCents: 700,
      lateFeeCents: 300,
    });

    await pay(order.intent);
    expect(await earned()).toEqual([]);
    await handOver(order.number);

    expect(await earned()).toEqual([{ orderId: order.id, points: 2_340, userId, companyId: null }]);
  });

  it("crédite aussi quand la remise précède le règlement", async () => {
    await openProgram();
    const userId = await member();
    const order = await seedOrder({ placedByUserId: userId });

    await handOver(order.number);
    expect(await earned()).toEqual([]);
    await pay(order.intent);

    expect(await earned()).toMatchObject([{ orderId: order.id, points: 2_340 }]);
  });

  it("🔴 ne crédite jamais deux fois : abonné, puis rattrapage, puis un fait rejoué", async () => {
    await openProgram();
    const order = await seedOrder({ placedByUserId: await member() });
    await pay(order.intent);
    await handOver(order.number);

    expect(await sweep()).toMatchObject({ scanned: 1, credited: 0 });
    await pay(order.intent);
    expect(await earned()).toHaveLength(1);
  });

  it("crédite la société pour une commande pro", async () => {
    await openProgramToPro();
    const company = await createCompany(ctx.prisma);
    const order = await seedOrder({
      placedByUserId: await member(),
      companyId: company.id,
      clientele: OrderClientele.pro,
      paymentStatus: PaymentStatus.pending,
    });
    await pay(order.intent);
    await handOver(order.number);

    expect(await earned()).toMatchObject([{ companyId: company.id, userId: null }]);
  });
});

describe("ce qui ne crédite pas", () => {
  it("🔴 `not_required` n'est pas un encaissement", async () => {
    await openProgram();
    const order = await seedOrder({
      placedByUserId: await member(),
      paymentStatus: PaymentStatus.not_required,
    });
    await handOver(order.number);

    expect(await sweep()).toMatchObject({ scanned: 0, credited: 0 });
    expect(await earned()).toEqual([]);
  });

  it("une carte encore en attente, remise quand même", async () => {
    await openProgram();
    const order = await seedOrder({ placedByUserId: await member() });
    await handOver(order.number);

    expect(await sweep()).toMatchObject({ scanned: 0, credited: 0 });
    expect(await earned()).toEqual([]);
  });

  it("un invité, sans compte connectable", async () => {
    await openProgram();
    const guest = await createGuest(ctx.prisma, { email: "invite@lfc.test" });
    const order = await seedOrder({ placedByUserId: guest.id });
    await pay(order.intent);
    await handOver(order.number);

    expect(await sweep()).toMatchObject({ scanned: 1, credited: 0 });
    expect(await earned()).toEqual([]);
  });

  it("un pro dont la société a disparu", async () => {
    await openProgramToPro();
    const order = await seedOrder({
      placedByUserId: await member(),
      clientele: OrderClientele.pro,
      companyId: null,
    });
    await pay(order.intent);
    await handOver(order.number);

    expect(await earned()).toEqual([]);
  });

  it("rien tant que le programme est fermé — et le rattrapage ne parcourt rien", async () => {
    const order = await seedOrder({ placedByUserId: await member() });
    await pay(order.intent);
    await handOver(order.number);

    // `vouchers` : le rattrapage des bons engagés (lot C, 2026-09-27). Il ne
    // dépend pas du réglage — un bon déjà engagé se solde même programme fermé.
    expect(await sweep()).toEqual({
      scanned: 0,
      credited: 0,
      expired: 0,
      vouchers: { reserved: 0, settled: 0, stalled: 0 },
    });
    expect(await earned()).toEqual([]);
  });
});

describe("le rattrapage — POST /admin/loyalty/sweep", () => {
  it("crédite ce que les abonnés ont manqué, une seule fois", async () => {
    // Le programme ouvre APRÈS les deux faits : les abonnés n'ont rien écrit.
    const userId = await member();
    const order = await seedOrder({ placedByUserId: userId });
    await pay(order.intent);
    await handOver(order.number);
    await openProgram();

    expect(await sweep()).toMatchObject({ scanned: 1, credited: 1 });
    expect(await sweep()).toMatchObject({ scanned: 1, credited: 0 });
    expect(await earned()).toEqual([{ orderId: order.id, points: 2_340, userId, companyId: null }]);
  });

  it("est murée : sans le jeton machine, rien", async () => {
    await ctx.http().post("/admin/loyalty/sweep").expect(401);
  });
});
