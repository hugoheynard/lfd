/**
 * E2E du **manque par envoi en base** (`documentation/commandes/reliquat/reliquat.md`).
 *
 * Ce que seul le vrai Postgres prouve : la décision d'un départ incomplet a
 * une clé étrangère vers le signal qu'elle résout, `(commande, rang)` — une
 * décision sans son manque est inexprimable, quel que soit le rang.
 */
import { E2E_STAFF_ID, type E2eContext } from "./e2e-harness.js";
import { bootstrapProductionDay, closeOrder, STAFF } from "./production-day-fixture.js";
import { accountOrder, report, type Drawn } from "./shortfall-decision-scene.js";

let ctx: E2eContext;

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** 3 croissants commandés, 1 au bac, le départ décidé, le bac fermé — la commande est prête. */
async function readyWithDecidedFirst(): Promise<Drawn> {
  const order = await accountOrder(ctx, 1);
  expect(await report(ctx, order.id)).toBe(204);
  const decided = await ctx
    .asSub(STAFF)
    .post(`/admin/orders/${order.id}/shortfall-decision`)
    .send({ remainder: "abandoned" });
  expect(decided.status).toBe(204);
  await ctx.drain();
  expect(await closeOrder(ctx, order.id)).toBe(204);
  await ctx.drain();
  return order;
}

describe("le manque par envoi, en base", () => {
  it("une décision sans le manque de son envoi est inexprimable en base", async () => {
    const order = await readyWithDecidedFirst();

    await expect(
      ctx.prisma.orderShortfallDecision.create({
        data: {
          id: "dec_orphan",
          orderId: order.id,
          rank: 3,
          decidedAt: new Date(),
          decidedByStaffId: E2E_STAFF_ID,
          remainder: "abandoned",
          departing: [],
          signalReportedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });
});
