import { addDays } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { ServiceDayBeforeFirstOrderableDayError } from "../../../domain/errors/service-day-before-first-orderable-day.error.js";
import { intakeAt } from "../../commands/__tests__/intake-doubles.js";
import {
  content,
  DAY,
  NEXT_DAY,
  NOW,
  placedOrder,
  revisingAt,
} from "../../commands/__tests__/revision-scene.js";

/**
 * Plan « premier jour commandable » (2026-10-28) : la révision par le client
 * oppose la date de sa clientèle quand la journée CHANGE ; l'équipe n'y est
 * pas soumise, et une commande déjà passée n'est pas touchée.
 *
 * La commande de la scène est celle d'une société active : la date des pros.
 */
const CUSTOMER = { kind: "customer", userId: "usr_1" } as const;
const STAFF = { kind: "staff", staffId: "stf_1" } as const;

function revisingWithFirstDay(first: string) {
  const clock = new FixedClock(NOW);
  return revisingAt(clock, {
    intake: intakeAt({ firstServiceDayB2b: first }, "active", [], {}, undefined, clock),
  });
}

describe("OrderRevising — le premier jour commandable", () => {
  it("refuse au client une nouvelle journée d'avant le premier jour", async () => {
    const order = await placedOrder();

    await expect(
      revisingWithFirstDay(addDays(NEXT_DAY, 1)).compose(
        order,
        content({ requestedDeliveryDate: NEXT_DAY }),
        CUSTOMER,
        { requireChange: true },
      ),
    ).rejects.toBeInstanceOf(ServiceDayBeforeFirstOrderableDayError);
  });

  it("admet au client une nouvelle journée qui est le premier jour", async () => {
    const order = await placedOrder();

    const revision = await revisingWithFirstDay(NEXT_DAY).compose(
      order,
      content({ requestedDeliveryDate: NEXT_DAY }),
      CUSTOMER,
      { requireChange: true },
    );

    expect(revision.serviceDay).toBe(NEXT_DAY);
  });

  it("ne touche pas une commande déjà passée dont la journée ne change pas", async () => {
    const order = await placedOrder();

    const revision = await revisingWithFirstDay(addDays(DAY, 5)).compose(
      order,
      content({ lines: [{ sku: "VIE-001", quantity: 12 }] }),
      CUSTOMER,
      { requireChange: true },
    );

    expect(revision.serviceDay).toBe(DAY);
  });

  it("laisse l'équipe déplacer la commande avant le premier jour", async () => {
    const order = await placedOrder();

    const revision = await revisingWithFirstDay(addDays(NEXT_DAY, 1)).compose(
      order,
      content({ requestedDeliveryDate: NEXT_DAY }),
      STAFF,
      { requireChange: true },
    );

    expect(revision.serviceDay).toBe(NEXT_DAY);
  });
});
