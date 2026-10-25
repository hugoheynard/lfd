/**
 * **Un reste abandonné ne rapporte pas de points** (plan
 * `documentation/commandes/plan-e7-reliquat-bati.md`, lot L-points, choix 16).
 *
 * Bug de l'existant depuis E6 : le lecteur des commandes définitives rendait
 * les montants COMMANDÉS ; une commande partie incomplète, reste abandonné,
 * rapportait des points sur le tout. Ce que seul le vrai Postgres prouve : la
 * décision, le BL partiel et le solde (`billable_*`) posés par les vraies
 * routes, puis le crédit lu sur ce qui est parti.
 *
 * Une écriture brute, datée (2026-10-25) : le passage à `paid`. Le départ
 * incomplet n'existe qu'au compte (la carte est refusée jusqu'à E9), et
 * aucune route ne fait passer une commande au compte à `paid` — le bug est
 * aujourd'hui latent, et ce test le tient avant qu'un des deux chemins
 * n'ouvre la porte.
 */
import { LoyaltySettings } from "../src/b2b/loyalty/domain/value-objects/loyalty-settings.js";
import { PrismaLoyaltySettingsStore } from "../src/b2b/loyalty/infrastructure/prisma-loyalty-settings.store.js";
import { E2E_STAFF_ID, type E2eContext } from "./e2e-harness.js";
import { handOver } from "./order-factory.js";
import { bootstrapProductionDay, closeOrder } from "./production-day-fixture.js";
import { accountOrder, decide, report, type Drawn } from "./shortfall-decision-scene.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

let ctx: E2eContext;

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  // Au compte : seul un pro y commande, d'où le programme ouvert aux pros
  // par l'adaptateur (l'écran le refuse encore, cf. `loyalty-earning`).
  await ctx.app.get(PrismaLoyaltySettingsStore).write(
    LoyaltySettings.of({
      pointsPerStep: 1_000,
      stepValueCents: 500,
      openToPublic: true,
      openToPro: true,
      voucherValidityDays: 365,
      welcomeBonusPoints: null,
    }),
    new Date(),
    E2E_STAFF_ID,
  );
});

/** Remise, puis réglée (écriture brute datée, cf. en-tête), puis le rattrapage. */
async function handOverPaidAndSwept(order: Drawn): Promise<void> {
  expect(await closeOrder(ctx, order.id)).toBe(204);
  await ctx.drain();
  await handOver(ctx, order);
  await ctx.prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "paid" } });
  await ctx
    .http()
    .post("/admin/loyalty/sweep")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
}

async function pointsOf(orderId: string): Promise<number[]> {
  const rows = await ctx.prisma.loyaltyLedgerEntry.findMany({
    where: { kind: "earned", orderId },
    select: { points: true },
  });
  return rows.map((row) => row.points);
}

describe("les points d'une commande partie incomplète", () => {
  /**
   * Régression (E6) : un reste abandonné rapportait des points sur toute la
   * commande, le lecteur rendant `subtotal_cents` au lieu de `billable_*`.
   */
  it("un reste abandonné ne rapporte pas de points : seul ce qui est parti compte", async () => {
    const order = await accountOrder(ctx, 1);
    expect(await report(ctx, order.id)).toBe(204);
    expect((await decide(ctx, order.id)).status).toBe(204);
    await handOverPaidAndSwept(order);

    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.billableSubtotalCents).not.toBeNull();
    expect(row.billableSubtotalCents).toBeLessThan(row.subtotalCents);
    expect(await pointsOf(order.id)).toEqual([
      (row.billableSubtotalCents ?? 0) - (row.billableDiscountCents ?? 0),
    ]);
  });

  it("une commande complète au compte : inchangée, l'assiette est son total", async () => {
    const order = await accountOrder(ctx, 3);
    await handOverPaidAndSwept(order);

    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.billableSubtotalCents).toBe(row.subtotalCents);
    expect(await pointsOf(order.id)).toEqual([row.subtotalCents - row.discountCents]);
  });
});
