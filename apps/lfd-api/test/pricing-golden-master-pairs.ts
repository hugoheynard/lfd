/**
 * **Les paires « sans verrou / sous verrou », sur les vrais adaptateurs** —
 * lot L4 du plan `documentation/pricing/centime-et-tva/le-prix-d-un-panier.md`
 * (§2.4 : « un test de concordance prouve qu'elles disent la même chose hors
 * concurrence »).
 *
 * - **Le plan** : `OrderPlanGate.isClosed` (refus tôt, sans verrou) et
 *   `OrderPlanGate.hold` (sous le verrou de la journée, par le guichet du
 *   fournil) disent la même chose d'une journée arrêtée et d'une journée ouverte.
 * - **La dérogation** : celle que le devis prévoit (le verdict d'`OrderDeadline`
 *   qui la considère) est celle que la passation dépense (`consume`) ;
 *   dépensée, ni `openFor` ni le verdict ne la rendent plus.
 *
 * La vitrine (`stockShortfallOf` / `hold`) partage son prédicat entre ses deux
 * temps, éprouvé sans base (`shelf-circuit-concordance.spec.ts`) ; l'heure
 * limite n'a plus qu'un juge, que le devis et la passation lisent tous deux.
 */
import { OrderDeadline } from "../src/lafoliecoffee/order-cutoffs/index.js";
import { OrderPlanGate } from "../src/lafoliecoffee/orders/application/services/order-plan-gate.service.js";
import { OpenWaiverReader } from "../src/lafoliecoffee/order-cutoffs/domain/deadline/ports/deadline-sources.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";
import { staffBody, type Agents } from "./pricing-golden-master-bodies.js";
import { createdIdOf } from "./pricing-golden-master-record.js";
import { FIXED } from "./pricing-golden-master-refusals.js";
import { anchoredDay, GOLDEN_CLOCK, type GoldenScene } from "./pricing-golden-master-scene.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

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
  const waivers = ctx.app.get(OpenWaiverReader);
  const deadline = ctx.app.get(OrderDeadline);
  // La dérogation que la passation dépenserait, lue sans être dépensée : le
  // verdict que la surtaxe prévue lit.
  const foresee = async (): Promise<string | null> => {
    const verdict = await deadline.verdict({
      skus,
      serviceDay: day,
      at: GOLDEN_CLOCK.now(),
      asker: {
        audience: "pro",
        companyId: pro.companyId,
        waiver: "consider",
        exceedItemLimits: false,
        itemLimitFloor: "general_rule_open",
      },
    });
    return verdict.kind === "grace" ? (verdict.waiver?.id ?? null) : null;
  };
  await http
    .as(E2E_STAFF_SUB)
    .post("/admin/order-cutoff-waivers")
    .send({ companyId: pro.companyId, fulfillmentDate: day, reason: "Concordance L4" })
    .expect(201);
  const foreseenBefore = await foresee();
  const openBefore = (await waivers.openFor(pro.companyId, day))?.id ?? null;
  const placed = await http
    .as(E2E_STAFF_SUB)
    .post("/admin/orders")
    .set(INTENT_KEY, freshIntent())
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
    foreseenAfter: await foresee(),
    openAfter: (await waivers.openFor(pro.companyId, day))?.id ?? null,
  };
}
