import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import { ProductionDayRepository } from "../../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { RecordingDayLock } from "../../__tests__/batch-doubles.js";
import { ProductionLaunchedResupplies } from "../production-launched-resupplies.js";

/**
 * Le refus synchrone d'annuler (R4a, BLOQUANT 3) : le fournil répond sous le
 * MÊME verrou que le lancement — verrou d'abord, relecture ensuite. Instants
 * recopiés, jamais comparés à l'horloge.
 */

const DAY = "2026-09-08";
const AT = new Date("2026-09-08T07:30:00.000Z");

class Days extends ProductionDayRepository {
  constructor(
    private readonly current: ProductionDay,
    private readonly trace: string[],
  ) {
    super();
  }

  load(): Promise<ProductionDay> {
    this.trace.push("load");
    return Promise.resolve(this.current);
  }

  save(): Promise<void> {
    return Promise.resolve();
  }
}

function launchedDay(): ProductionDay {
  const day = ProductionDay.open(ServiceDay.of(DAY));
  day.launchResupply(
    {
      resupplyId: "rs_asap",
      siteId: "site_village",
      siteLabel: null,
      name: null,
      servedByTransfer: true,
      lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 8 }],
    },
    { at: AT, staffUserId: "s_max", name: null },
    { orders: [], withdrawn: new Set<string>(), resupplies: [] },
  );
  return day;
}

describe("ProductionLaunchedResupplies", () => {
  it("verrouille la journée PUIS la relit, et dit le lancé", async () => {
    const trace: string[] = [];
    const port = new ProductionLaunchedResupplies(
      new RecordingDayLock(trace),
      new Days(launchedDay(), trace),
      new DirectUnitOfWork(),
    );

    expect(await port.isLaunched(ServiceDay.of(DAY), "rs_asap")).toBe(true);
    expect(trace).toEqual([`lock:${DAY}`, "load"]);
  });

  it("un réassort que le fournil n'a pas lancé ne l'est pas", async () => {
    const port = new ProductionLaunchedResupplies(
      new RecordingDayLock(),
      new Days(launchedDay(), []),
      new DirectUnitOfWork(),
    );

    expect(await port.isLaunched(ServiceDay.of(DAY), "rs_other")).toBe(false);
  });
});
