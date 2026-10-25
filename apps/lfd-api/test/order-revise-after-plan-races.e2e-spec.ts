/**
 * **Changer les quantités d'une commande inscrite : les courses** (plan A2,
 * `documentation/commandes/modification/plan-a2-modifier-une-commande-inscrite.md`,
 * § 7, S4). Les gestes vont en parallèle sur le vrai Postgres : l'ordre des
 * verrous (`orders` → journée → feuille → BL) ne se prouve qu'ici. Une course
 * qui finit en interblocage rend un 500 ; aucune ne doit.
 */
import { type E2eContext } from "./e2e-harness.js";
import {
  bootstrapProductionDay,
  closeOrder,
  packingOrderPath,
  relayGate,
  STAFF,
} from "./production-day-fixture.js";
import { accountOrder, decide, report } from "./shortfall-decision-scene.js";
import { bakeryDueOf, packingDueOf, reviseQuantity } from "./order-revise-after-plan-scene.js";

let ctx: E2eContext;

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  relayGate.open = true;
  await ctx.reset();
});

describe("les courses (§ 7, S4)", () => {
  it("révision × annulation (A1) : la commande au compte inscrite ne s'annule pas, la révision passe", async () => {
    const order = await accountOrder(ctx, 0);

    const [revised, cancelled] = await Promise.all([
      reviseQuantity(ctx, order.id, 5),
      ctx
        .asSub(STAFF)
        .post(`/admin/orders/${order.id}/cancel`)
        .send({ reason: "Le client a rappelé" }),
    ]);

    expect(revised.status).toBe(200);
    expect(cancelled.status).toBe(409);
    expect(await bakeryDueOf(ctx, order.id)).toBe(5);
  });

  it("révision × décision de manque : pas d'interblocage, et les deux disent la même chose", async () => {
    const order = await accountOrder(ctx, 1);
    expect(await report(ctx, order.id)).toBe(204);

    const [revised, decided] = await Promise.all([
      reviseQuantity(ctx, order.id, 2),
      decide(ctx, order.id),
    ]);

    expect([200, 409]).toContain(revised.status);
    expect([204, 409]).toContain(decided.status);
    expect(revised.status === 200 || decided.status === 204).toBe(true);
    if (revised.status === 409) {
      // La décision est passée la première : la commande ne se modifie plus.
      expect(await bakeryDueOf(ctx, order.id)).toBe(3);
    }
  });

  it("révision × fermeture du bac : une seule gagne, sans interblocage", async () => {
    const order = await accountOrder(ctx, 3);

    const [revised, closed] = await Promise.all([
      reviseQuantity(ctx, order.id, 5),
      ctx.asSub(STAFF).post(`${packingOrderPath(order.id)}/close`),
    ]);

    expect(revised.status === 200).not.toBe(closed.status === 204);
    expect([200, 409]).toContain(revised.status);
    expect([204, 409]).toContain(closed.status);
    if (revised.status === 200) {
      expect(await packingDueOf(ctx, order.id)).toBe(5);
      expect(await closeOrder(ctx, order.id)).toBe(409);
    } else {
      expect(await packingDueOf(ctx, order.id)).toBe(3);
    }
  });
});
