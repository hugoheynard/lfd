import { addDays } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { PastOrderCutoffError } from "../../../domain/errors/order-errors.js";
import { ProductionPlanClosedError } from "../../../domain/errors/production-plan-closed.error.js";
import { ServiceDayBeforeFirstOrderableDayError } from "../../../domain/errors/service-day-before-first-orderable-day.error.js";
import { intakeAt } from "../../commands/__tests__/intake-doubles.js";
import { FixedClosedPlans, gateOf } from "../../commands/__tests__/plan-doubles.js";
import {
  AFTER_CUTOFF,
  content,
  DAY,
  NEXT_DAY,
  NOW,
  placedOrder,
  revisingAt,
} from "../../commands/__tests__/revision-scene.js";

/**
 * **Le temps se juge au geste ; l'arrêt du fournil, toujours maintenant**
 * (plan `documentation/commandes/modification/plan-s2-la-hausse.md`, R6).
 *
 * `decidedAt` est l'instant où l'heure limite et le premier jour commandable
 * se jugent ; l'horloge de la scène, celui du reste. M1 passe l'horloge :
 * ses tests (`revise-order.handler.spec.ts`, « refuse le client après l'heure
 * limite ») sont la non-régression de la passation de l'horloge.
 */
const CUSTOMER = { kind: "customer", userId: "usr_1" } as const;
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

describe("OrderRevising — R6, l'heure limite au geste", () => {
  it("non-régression M1 : décidé maintenant, après l'heure limite, le client est refusé", async () => {
    const order = await placedOrder();
    const late = new FixedClock(AFTER_CUTOFF);

    await expect(
      revisingAt(late).compose(order, content({ note: "x" }), CUSTOMER, {
        requireChange: true,
        decidedAt: late.now(),
      }),
    ).rejects.toBeInstanceOf(PastOrderCutoffError);
  });

  it("décidé avant l'heure limite, appliqué après : la hausse passe", async () => {
    const order = await placedOrder();

    const revision = await revisingAt(new FixedClock(AFTER_CUTOFF)).compose(
      order,
      content({ note: "x" }),
      CUSTOMER,
      { requireChange: true, decidedAt: NOW },
    );

    expect(revision.changes).toEqual(["note"]);
  });
});

describe("OrderRevising — R6, le premier jour commandable au geste", () => {
  function revisingWithFirstDay(first: string, clock: FixedClock) {
    return revisingAt(clock, {
      intake: intakeAt({ firstServiceDayB2b: first }, "active", [], {}, undefined, clock),
    });
  }

  it("juge la clientèle au jour de `decidedAt`, pas à l'horloge", async () => {
    const order = await placedOrder();
    // Le premier jour des pros tombe après NEXT_DAY. À l'horloge (dix jours
    // plus tard), il serait passé et la boutique ouverte à tous ; au geste
    // (NOW), il est à venir : NEXT_DAY le précède et se refuse.
    const later = new FixedClock(new Date(NOW.getTime() + TEN_DAYS_MS));

    await expect(
      revisingWithFirstDay(addDays(NEXT_DAY, 1), later).compose(
        order,
        content({ requestedDeliveryDate: NEXT_DAY }),
        CUSTOMER,
        { requireChange: true, decidedAt: NOW },
      ),
    ).rejects.toBeInstanceOf(ServiceDayBeforeFirstOrderableDayError);
  });
});

describe("OrderRevising — R6, l'arrêt du plan se juge maintenant", () => {
  it("un `decidedAt` d'avant l'arrêt ne rouvre pas la journée au client", async () => {
    const order = await placedOrder();

    await expect(
      revisingAt(new FixedClock(NOW), { plans: gateOf(new FixedClosedPlans([DAY])) }).compose(
        order,
        content({ note: "x" }),
        CUSTOMER,
        { requireChange: true, decidedAt: NOW },
      ),
    ).rejects.toBeInstanceOf(ProductionPlanClosedError);
  });
});
