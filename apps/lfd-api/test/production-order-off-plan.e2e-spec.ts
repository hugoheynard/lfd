import type { ProducibleOrder } from "../src/production/channels/commerce/index.js";
import { ProductionDayRepository } from "../src/production/day/domain/ports/production-day.repository.js";
import { ServiceDay } from "../src/production/day/domain/value-objects/service-day.value-object.js";
import { bootstrapE2e, serviceDay, type E2eContext } from "./e2e-harness.js";

/**
 * **« Hors plan », gardé sur la commande figée** (`documentation/fournil/plan-historique-des-tirages.md`,
 * § 1.8) : la journée écrit `off_plan` tel que le commerce l'a servi, et le
 * relit tel quel — `NULL` compris, qui reste « on ne sait pas » et ne devient
 * jamais `false`. Instants recopiés, jamais comparés à l'horloge.
 */

const SERVICE_DAY = serviceDay();
const EVENING = new Date("2026-09-07T18:00:00.000Z");
const MORNING = new Date("2026-09-08T07:30:00.000Z");
const NONE = new Set<string>();

function order(orderId: string, offPlan: boolean | null): ProducibleOrder {
  return {
    orderId,
    reference: `REF-${orderId}`,
    customerLabel: "Hôtel des Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    dueAt: null,
    clientele: "pro",
    siteId: null,
    offPlan,
    sheetDetails: null,
    lines: [
      {
        sku: "VIE-001",
        productName: "Croissant",
        quantity: 4,
        saleUnit: "piece",
        madeToOrder: null,
      },
    ],
  };
}

describe("La commande figée garde « hors plan »", () => {
  let ctx: E2eContext;
  let days: ProductionDayRepository;
  const day = ServiceDay.of(SERVICE_DAY);

  beforeAll(async () => {
    ctx = await bootstrapE2e();
    days = ctx.app.get(ProductionDayRepository);
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  async function offPlanById(): Promise<Record<string, boolean | null>> {
    const reloaded = await days.load(day);
    return Object.fromEntries(reloaded.orders.map((o) => [o.orderId, o.offPlan]));
  }

  it("l'arrêt et le retirage écrivent `false` et `true`, relus tels quels", async () => {
    const opened = await days.load(day);
    opened.close([order("ord_plan", false)], NONE, EVENING, null, []);
    await days.save(opened);

    const closed = await days.load(day);
    closed.retake(
      [order("ord_plan", false), order("ord_late", true)],
      NONE,
      MORNING,
      "s_max",
      "Max",
    );
    await days.save(closed);

    expect(await offPlanById()).toEqual({ ord_plan: false, ord_late: true });
  });

  it("une commande figée avant la colonne se relit `null`, jamais `false`", async () => {
    const opened = await days.load(day);
    opened.close([order("ord_old", false)], NONE, EVENING, null, []);
    await days.save(opened);
    // L'état d'une ligne écrite avant la migration : la colonne vaut NULL.
    await ctx.prisma.productionOrder.updateMany({
      where: { serviceDay: SERVICE_DAY },
      data: { offPlan: null },
    });

    expect(await offPlanById()).toEqual({ ord_old: null });
  });

  it("un `null` servi est écrit `NULL`, pas `false`", async () => {
    const opened = await days.load(day);
    opened.close([order("ord_unknown", null)], NONE, EVENING, null, []);
    await days.save(opened);

    const row = await ctx.prisma.productionOrder.findFirst({
      where: { serviceDay: SERVICE_DAY, orderId: "ord_unknown" },
      select: { offPlan: true },
    });
    expect(row).toEqual({ offPlan: null });
  });
});
