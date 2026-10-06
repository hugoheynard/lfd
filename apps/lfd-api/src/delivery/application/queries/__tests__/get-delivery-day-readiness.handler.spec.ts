import { InvalidServiceDayError } from "../../../domain/errors/delivery-round-errors.js";
import {
  DeliveryDayReadinessReader,
  type DeliveryDayReadinessRow,
} from "../../../domain/ports/delivery-day-readiness.reader.js";
import {
  FixedActiveBinTypes,
  FixedMeasuredVehicles,
} from "../../handlers/__tests__/day-readiness-doubles.js";
import { GetDeliveryDayReadinessHandler } from "../get-delivery-day-readiness.handler.js";
import { GetDeliveryDayReadinessQuery } from "../get-delivery-day-readiness.query.js";

const DAY = "2026-10-07";
const CLOSED = new Date("2026-10-06T16:00:00.000Z");

class FixedReadiness extends DeliveryDayReadinessReader {
  constructor(private readonly row: DeliveryDayReadinessRow | null) {
    super();
  }
  readinessOf(): Promise<DeliveryDayReadinessRow | null> {
    return Promise.resolve(this.row);
  }
}

function handler(
  row: DeliveryDayReadinessRow | null,
  base: { vehicles?: readonly string[]; bins?: readonly string[] } = {},
) {
  return new GetDeliveryDayReadinessHandler(
    new FixedReadiness(row),
    new FixedMeasuredVehicles(base.vehicles ?? ["v1"]),
    new FixedActiveBinTypes(base.bins ?? ["b1"]),
  );
}

describe("GetDeliveryDayReadinessHandler — les trois états de l'écran", () => {
  it("pas de ligne : le plan n'est pas arrêté", async () => {
    await expect(handler(null).execute(new GetDeliveryDayReadinessQuery(DAY))).resolves.toEqual({
      day: DAY,
      arrested: null,
    });
  });

  it("une ligne sans clôture (un retirage seul) n'est pas un plan arrêté", async () => {
    const view = await handler({ closedAt: null, deliveryCount: 2, unplacedCount: 2 }).execute(
      new GetDeliveryDayReadinessQuery(DAY),
    );

    expect(view.arrested).toBeNull();
  });

  it("arrêté : le compte, les hors tournée, et rien ne manque", async () => {
    const view = await handler({ closedAt: CLOSED, deliveryCount: 12, unplacedCount: 3 }).execute(
      new GetDeliveryDayReadinessQuery(DAY),
    );

    expect(view.arrested).toEqual({
      closedAt: CLOSED.toISOString(),
      deliveryCount: 12,
      unplacedCount: 3,
      compositionGap: null,
    });
  });

  it("arrêté sans socle : ce qui manque (CA-D3)", async () => {
    const view = await handler(
      { closedAt: CLOSED, deliveryCount: 1, unplacedCount: 1 },
      { bins: [] },
    ).execute(new GetDeliveryDayReadinessQuery(DAY));

    expect(view.arrested?.compositionGap).toBe("no_active_bin_type");
  });

  it("refuse un jour hors calendrier", async () => {
    await expect(
      handler(null).execute(new GetDeliveryDayReadinessQuery("2026-02-30")),
    ).rejects.toBeInstanceOf(InvalidServiceDayError);
  });
});
