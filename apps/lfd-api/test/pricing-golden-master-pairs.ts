/**
 * **Les paires « sans verrou / sous verrou », sur les vrais adaptateurs** —
 * lot L4 du plan `documentation/pricing/centime-et-tva/le-prix-d-un-panier.md`
 * (§2.4 : « un test de concordance prouve qu'elles disent la même chose hors
 * concurrence »).
 *
 * - **Le plan** : `OrderPlanGate.isClosed` (refus tôt, sans verrou) et
 *   `OrderPlanGate.hold` (sous le verrou de la journée, par le guichet du
 *   fournil) disent la même chose d'une journée arrêtée et d'une journée ouverte.
 * - **La dérogation** : celle que le devis prévoit (`OrderCutoffGate.foresee`,
 *   par `openFor`) est celle que la passation dépense (`consume`) ; dépensée,
 *   ni `openFor` ni `foresee` ne la rendent plus.
 *
 * La vitrine (`stockShortfallOf` / `hold`) et l'heure limite
 * (`foreseenWaiver` / `ensureWithinOrderCutoff`) partagent leur prédicat : leur
 * concordance est éprouvée sans base (`shelf-circuit-concordance.spec.ts`,
 * `order-cutoff-guard-foreseen.spec.ts`).
 */
import { ProductCatalogReader } from "../src/lafoliecoffee/catalog/domain/ports/product-catalog.reader.js";
import { OrderCutoffGate } from "../src/lafoliecoffee/orders/application/services/order-cutoff-gate.service.js";
import { OrderPlanGate } from "../src/lafoliecoffee/orders/application/services/order-plan-gate.service.js";
import { OrderCutoffReader } from "../src/lafoliecoffee/orders/domain/ports/order-cutoff.reader.js";
import { OrderCutoffWaiverGate } from "../src/lafoliecoffee/orders/domain/ports/order-cutoff-waiver.gate.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";
import { staffBody, type Agents } from "./pricing-golden-master-bodies.js";
import { createdIdOf } from "./pricing-golden-master-record.js";
import { FIXED } from "./pricing-golden-master-refusals.js";
import { anchoredDay, GOLDEN_CLOCK, type GoldenScene } from "./pricing-golden-master-scene.js";

/** Ce que les deux temps du plan disent d'une journée. */
export interface PlanVerdicts {
  readonly day: string;
  readonly withoutLock: boolean;
  readonly underLock: boolean;
}

/** Une journée arrêtée, une journée ouverte : les deux temps, sur chacune. */
export async function planPairVerdicts(ctx: E2eContext): Promise<readonly PlanVerdicts[]> {
  const closed = anchoredDay(20);
  const open = anchoredDay(21);
  await ctx.prisma.productionDay.create({
    data: { serviceDay: closed, closedAt: GOLDEN_CLOCK.now() },
  });
  const gate = ctx.app.get(OrderPlanGate);
  const unitOfWork = ctx.app.get(UnitOfWork);
  const verdicts: PlanVerdicts[] = [];
  for (const day of [closed, open]) {
    verdicts.push({
      day,
      withoutLock: await gate.isClosed(day),
      underLock: await unitOfWork.run(() => gate.hold(day)),
    });
  }
  return verdicts;
}

/** Ce que la paire de la dérogation dit, avant et après la passation. */
export interface WaiverPair {
  readonly foreseenBefore: string | null;
  readonly openBefore: string | null;
  readonly placedStatus: number;
  readonly consumedBy: string | null;
  readonly placedOrderId: string | null;
  readonly foreseenAfter: string | null;
  readonly openAfter: string | null;
}

/**
 * La société sans crédit, J+2 en grâce (l'heure limite des cas fixes), une
 * dérogation ouverte : l'équipe passe au lien.
 */
export async function waiverPair(
  ctx: E2eContext,
  scene: GoldenScene,
  http: Agents,
): Promise<WaiverPair> {
  const day = anchoredDay(2);
  const pro = scene.proWithoutCredit;
  const skus = FIXED.lines.map((line) => line.sku);
  const waivers = ctx.app.get(OrderCutoffWaiverGate);
  const cutoff = new OrderCutoffGate(
    ctx.app.get(OrderCutoffReader),
    ctx.app.get(ProductCatalogReader),
    waivers,
    GOLDEN_CLOCK,
  );
  await http
    .as(E2E_STAFF_SUB)
    .post("/admin/order-cutoff-waivers")
    .send({ companyId: pro.companyId, fulfillmentDate: day, reason: "Concordance L4" })
    .expect(201);
  const foreseenBefore = await cutoff.foresee(skus, day, pro.companyId);
  const openBefore = (await waivers.openFor(pro.companyId, day))?.id ?? null;
  const placed = await http
    .as(E2E_STAFF_SUB)
    .post("/admin/orders")
    .send({
      ...staffBody(scene, FIXED, "link"),
      companyId: pro.companyId,
      buyerUserId: pro.buyerUserId,
      requestedDeliveryDate: day,
    });
  const row =
    openBefore === null
      ? null
      : await ctx.prisma.orderCutoffWaiver.findUnique({
          where: { id: openBefore },
          select: { usedByOrderId: true },
        });
  return {
    foreseenBefore,
    openBefore,
    placedStatus: placed.status,
    consumedBy: row?.usedByOrderId ?? null,
    placedOrderId: createdIdOf(placed),
    foreseenAfter: await cutoff.foresee(skus, day, pro.companyId),
    openAfter: (await waivers.openFor(pro.companyId, day))?.id ?? null,
  };
}
