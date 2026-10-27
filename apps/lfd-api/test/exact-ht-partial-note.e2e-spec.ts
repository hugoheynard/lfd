/**
 * E2E du **bon de livraison partiel d'une commande composée en TTC** — lot C3
 * du plan `documentation/pricing/plan-centime-particuliers.md` (§ 5, « Le bon
 * de livraison partiel »).
 *
 * Ce que seul le vrai Postgres prouve : le BL recomposé s'écrit sous ses
 * CHECK (`delivery_note_ttc_terms_iff_exact_ht`, « tout ou rien » des sept
 * totaux), avec sa méthode et ses TTC, et ses lignes réécrites somment vers
 * son en-tête.
 *
 * La scène est celle du manque décidé (`shortfall-decision-scene.ts`) : la
 * commande y naît d'un pro au compte, seul chemin qui mène aujourd'hui au
 * colisage dans un e2e. Elle est REMARQUÉE `exact_ht` avant la décision — la
 * même méthode que `order-exact-ht.e2e-spec.ts` pour une commande d'avant la
 * voie B : ce qui est éprouvé est la recomposition du BL, qui ne lit que la
 * méthode et les TTC figés de la commande.
 */
import { ttcCentsFromHtMillicents } from "@lfd/money";

import type { E2eContext } from "./e2e-harness.js";
import { bootstrapProductionDay, closeOrder } from "./production-day-fixture.js";
import { accountOrder, decide, report } from "./shortfall-decision-scene.js";

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

/** La commande composée en TTC : sa méthode, ses TTC de terme, ses lignes à l'étiquette. */
async function markExact(orderId: string): Promise<void> {
  const lines = await ctx.prisma.orderLine.findMany({ where: { orderId } });
  for (const line of lines) {
    const label = ttcCentsFromHtMillicents(line.unitPriceMillicents, line.vatRate.toNumber());
    await ctx.prisma.orderLine.update({
      where: { id: line.id },
      data: { unitPriceTtcCents: label, lineTotalTtcCents: label * line.quantity },
    });
  }
  await ctx.prisma.order.update({
    where: { id: orderId },
    data: {
      vatMethod: "exact_ht",
      discountTtcCents: 0,
      voucherTtcCents: 0,
      deliveryFeeTtcCents: 0,
    },
  });
}

describe("le BL partiel d'une commande composée en TTC", () => {
  it("est recomposé en entier : méthode, TTC, lignes qui somment vers l'en-tête", async () => {
    // 3 croissants commandés, 1 au bac : le départ décidé n'en emporte qu'un.
    const order = await accountOrder(ctx, 1);
    await markExact(order.id);
    expect(await report(ctx, order.id)).toBe(204);
    expect((await decide(ctx, order.id)).status).toBe(204);
    expect(await closeOrder(ctx, order.id)).toBe(204);
    await ctx.drain();

    const note = await ctx.prisma.deliveryNote.findFirstOrThrow({
      where: { orderId: order.id, rank: 1 },
      include: { lines: true },
    });
    const departing = note.lines.filter((line) => line.quantity > 0);
    expect(departing.map((line) => line.quantity)).toEqual([1]);
    const [line] = departing;
    const label = ttcCentsFromHtMillicents(
      line?.unitPriceMillicents ?? 0,
      line?.vatRate.toNumber() ?? 0,
    );
    expect(line).toMatchObject({ unitPriceTtcCents: label, lineTotalTtcCents: label });
    expect(note).toMatchObject({
      vatMethod: "exact_ht",
      discountTtcCents: 0,
      voucherTtcCents: 0,
      deliveryFeeTtcCents: 0,
      totalCents: label,
    });
    const lineHt = note.lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
    expect(note.subtotalCents).toBe(lineHt);
    expect(lineHt + (note.vatCents ?? 0)).toBe(note.totalCents);
  });
});
