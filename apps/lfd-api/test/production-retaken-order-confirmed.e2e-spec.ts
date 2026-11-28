/**
 * **La commande intégrée par un retirage est confirmée, à l'instant de
 * l'arrêt** (`documentation/fournil/les-versions-du-plan.md`,
 * « Le retirage côté commerce ») — sur le vrai Postgres, le vrai
 * relais et le vrai stockage : arrêt → commande hors plan saisie par
 * l'équipe → retirage → le commerce la confirme, son BL-1 naît et le
 * dossier se range ; puis réouverture → elle est rendue au client → un
 * nouvel arrêt passe.
 */
import { OrderStatus } from "../src/platform/database/client/client.js";
import { ProductionDocumentStore } from "../src/platform/storage/production-document-store.js";
import { dayDossierPdfKey } from "../src/production/plan/domain/services/day-dossier-pdf.js";
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

async function arrest(): Promise<{ readonly closedAt: Date; readonly planVersion: number }> {
  const day = await ctx.prisma.productionDay.findUniqueOrThrow({
    where: { serviceDay: SERVICE_DAY },
    select: { closedAt: true, planVersion: true },
  });
  if (day.closedAt === null || day.planVersion === null) {
    throw new RangeError("journée non arrêtée");
  }
  return { closedAt: day.closedAt, planVersion: day.planVersion };
}

function orderOf(id: string) {
  return ctx.prisma.order.findUniqueOrThrow({
    where: { id },
    select: { status: true, confirmedAt: true },
  });
}

describe("la commande hors plan intégrée par un retirage", () => {
  /**
   * Régression : aucun abonné du commerce n'écoutait le retirage ; la
   * commande intégrée restait `placed`, sans BL-1, et le dossier ne se rangeait jamais.
   */
  it("est confirmée à l'instant de l'arrêt, a son BL-1, et la réouverture la rend", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 2 }]);
    await closePlan(ctx);
    await ctx.drain();
    const late = await placeLateByStaff(ctx, SERVICE_DAY, [{ sku: CROISSANT, quantity: 4 }]);

    await retake(ctx);
    await ctx.drain();

    const { closedAt, planVersion } = await arrest();
    expect(await orderOf(late.id)).toEqual({
      status: OrderStatus.confirmed,
      confirmedAt: closedAt,
    });
    const notes = await ctx.prisma.deliveryNote.findMany({
      where: { orderId: late.id },
      select: { rank: true, status: true },
    });
    expect(notes).toEqual([{ rank: 1, status: "planned" }]);
    await ctx.asSub(STAFF).get(`/admin/production/batch/${SERVICE_DAY}/dossier.pdf`).expect(200);
    const key = dayDossierPdfKey(SERVICE_DAY, closedAt, null, planVersion);
    expect(await ctx.app.get(ProductionDocumentStore).readIfPresent(key)).not.toBeNull();

    await ctx.asSub(STAFF).post(`/admin/production/batch/${SERVICE_DAY}/reopen`).expect(201);
    await ctx.drain();
    expect((await orderOf(late.id)).status).toBe(OrderStatus.placed);

    await closePlan(ctx);
    await ctx.drain();
    const again = await arrest();
    expect(await orderOf(late.id)).toEqual({
      status: OrderStatus.confirmed,
      confirmedAt: again.closedAt,
    });
  });
});
