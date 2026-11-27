/**
 * E2E du badge « hors plan » de la liste staff (`GET /admin/orders`) : une
 * commande que le fournil a inscrite par un retirage n'est plus hors plan,
 * même si le commerce la tient encore `placed` jusqu'à l'arrêt suivant.
 */
import type { AdminOrdersPage } from "@lfd/contracts";

import { E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import {
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  bootstrapProductionDay,
  closePlan,
  place,
  retake,
} from "./production-day-fixture.js";
import { placeLateByStaff } from "./staff-late-order.js";

let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
});

async function offPlanOf(orderId: string): Promise<boolean | undefined> {
  const page = jsonBody<AdminOrdersPage>(
    await ctx.asSub(E2E_STAFF_SUB).get("/admin/orders").expect(200),
  );
  return page.rows.find((row) => row.id === orderId)?.offPlan;
}

describe("GET /admin/orders — le badge « hors plan » après un retirage", () => {
  /**
   * Régression : une commande hors plan intégrée par un retirage gardait le
   * badge « hors plan » jusqu'à l'arrêt suivant, alors que le fournil la produisait.
   */
  it("n'affiche plus « hors plan » une commande que le retirage a inscrite", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    await closePlan(ctx);
    const late = await placeLateByStaff(ctx, SERVICE_DAY, [{ sku: CROISSANT, quantity: 4 }]);

    expect(await offPlanOf(late.id)).toBe(true);

    await retake(ctx);

    expect(await offPlanOf(late.id)).toBe(false);
  });
});
