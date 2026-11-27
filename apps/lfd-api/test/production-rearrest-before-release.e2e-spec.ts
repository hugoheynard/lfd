/**
 * **Réarrêter avant que le commerce ait remis les commandes de l'arrêt défait**
 * (`documentation/fournil/plan-historique-des-tirages.md`, § 5).
 *
 * La réouverture défait l'arrêt ; le commerce remet ensuite en `placed`, par
 * un abonné durable, les commandes que cet arrêt avait confirmées. Le nouvel
 * arrêt ne lit que `placed`, et l'abonné ne fait plus rien sur une journée de
 * nouveau arrêtée : l'arrêt doit donc attendre la remise. Seul le vrai
 * Postgres le prouve — la boîte d'envoi, la condition de la remise, le verrou.
 */
import { createUser } from "./factories.js";
import type { E2eContext } from "./e2e-harness.js";
import {
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  STAFF,
  bootstrapProductionDay,
  closePlan,
  place,
  relayGate,
  releaseRelay,
} from "./production-day-fixture.js";

const CONFLICT = 409;

let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay());
});

afterAll(async () => {
  relayGate.open = true;
  await ctx.close();
});

beforeEach(async () => {
  relayGate.open = true;
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
});

async function planOrderCount(): Promise<number> {
  return ctx.prisma.productionOrder.count({ where: { serviceDay: SERVICE_DAY } });
}

describe("réarrêter une journée rouverte", () => {
  /**
   * Régression : une commande perdue entre deux plans quand on réarrête avant
   * la remise du commerce (8 → 7 le 2026-11-27).
   */
  it("refuse l'arrêt tant que la remise n'est pas faite, puis refige les deux commandes", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 2 }]);
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 3 }]);
    await closePlan(ctx);
    await ctx.drain();
    expect(await planOrderCount()).toBe(2);

    // Le relais retenu : la remise du commerce ne part pas toute seule.
    relayGate.open = false;
    await ctx.asSub(STAFF).post(`/admin/production/batch/${SERVICE_DAY}/reopen`).expect(201);

    const refused = await ctx.asSub(STAFF).post(`/admin/production/batch/${SERVICE_DAY}/close`);
    expect(refused.status).toBe(CONFLICT);
    expect(JSON.stringify(refused.body)).toContain(
      `La réouverture du ${SERVICE_DAY} est encore en cours de remise au commerce : réessayez dans un instant.`,
    );
    const day = await ctx.prisma.productionDay.findUniqueOrThrow({
      where: { serviceDay: SERVICE_DAY },
      select: { closedAt: true },
    });
    expect(day.closedAt).toBeNull();

    // La remise livrée : rouvre le relais, livre la boîte d'envoi, `ctx.drain()`.
    await releaseRelay(ctx);
    await closePlan(ctx);

    expect(await planOrderCount()).toBe(2);
  });
});
