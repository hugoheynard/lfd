import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  FutureStatementMonthError,
  StatementCompanyNotFoundError,
} from "../../../domain/errors/statement-errors.js";
import { CycleOrdersReader, type CycleOrder } from "../../../domain/ports/cycle-orders.reader.js";
import type { BillingCycle } from "../../../domain/services/billing-cycle.js";
import { ExportCycleStatementQuery, GetCycleStatementQuery } from "../cycle-statement-queries.js";
import { ExportCycleStatementHandler } from "../export-cycle-statement.handler.js";
import { GetCycleStatementHandler } from "../get-cycle-statement.handler.js";
import {
  ListStatementCyclesHandler,
  STATEMENT_CYCLES_LISTED,
} from "../list-statement-cycles.handler.js";

/**
 * Dates absolues sur une horloge FIXÉE — jamais comparées au mur (CLAUDE.md §5).
 * 5 octobre 2026, midi à Paris.
 */
const NOW = new Date("2026-10-05T10:00:00.000Z");

/** Retient la fenêtre demandée : c'est elle que le handler doit calculer. */
class RecordingCycleOrders extends CycleOrdersReader {
  readonly asked: { companyId: string; cycle: BillingCycle }[] = [];

  constructor(
    private readonly name: string | null,
    private readonly orders: readonly CycleOrder[],
  ) {
    super();
  }

  companyName(): Promise<string | null> {
    return Promise.resolve(this.name);
  }

  cycleOrders(companyId: string, cycle: BillingCycle): Promise<readonly CycleOrder[]> {
    this.asked.push({ companyId, cycle });
    return Promise.resolve(this.orders);
  }
}

const ORDER: CycleOrder = {
  id: "o1",
  orderNumber: "CMD-1",
  placedAt: new Date("2026-09-12T08:00:00.000Z"),
  siteName: "Boulangerie du Port",
  subtotalCents: 1_000,
  discountCents: 0,
  voucherDiscountCents: 0,
  deliveryFeeCents: 0,
  lateFeeCents: 0,
  vatCents: 55,
  vatShares: null,
  totalCents: 1_055,
};

describe("ListStatementCyclesHandler", () => {
  it("rend une année glissante de mois civils, le mois en cours d'abord et lui seul « en cours »", async () => {
    const { cycles } = await new ListStatementCyclesHandler(new FixedClock(NOW)).execute();
    expect(cycles).toHaveLength(STATEMENT_CYCLES_LISTED);
    expect(cycles[0]).toEqual({
      month: "2026-10",
      startsAt: "2026-09-30T22:00:00.000Z",
      closesAt: "2026-10-31T23:00:00.000Z",
      inProgress: true,
    });
    expect(cycles.slice(1).every((cycle) => !cycle.inProgress)).toBe(true);
    expect(cycles.at(-1)?.month).toBe("2025-11");
  });
});

describe("GetCycleStatementHandler", () => {
  it("lit le cycle en cours quand aucun mois n'est demandé, et le dit provisoire", async () => {
    const reader = new RecordingCycleOrders("Boulangerie du Port", [ORDER]);
    const view = await new GetCycleStatementHandler(reader, new FixedClock(NOW)).execute(
      new GetCycleStatementQuery("c1", undefined),
    );

    expect(reader.asked[0]?.companyId).toBe("c1");
    expect(reader.asked[0]?.cycle.startsAt.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(view.cycle).toMatchObject({ month: "2026-10", inProgress: true });
    expect(view.provisional).toBe(true);
    expect(view.totals.unventilatedVatCents).toBe(55);
    expect(view.orders[0]).toMatchObject({ orderNumber: "CMD-1", vatVentilated: false });
  });

  it("lit un mois passé comme clos", async () => {
    const reader = new RecordingCycleOrders("Boulangerie du Port", []);
    const view = await new GetCycleStatementHandler(reader, new FixedClock(NOW)).execute(
      new GetCycleStatementQuery("c1", "2026-09"),
    );
    expect(view.cycle).toMatchObject({ month: "2026-09", inProgress: false });
    expect(reader.asked[0]?.cycle.closesAt.toISOString()).toBe("2026-09-30T22:00:00.000Z");
  });

  it("refuse un mois futur sans interroger les commandes", async () => {
    const reader = new RecordingCycleOrders("Boulangerie du Port", []);
    await expect(
      new GetCycleStatementHandler(reader, new FixedClock(NOW)).execute(
        new GetCycleStatementQuery("c1", "2026-11"),
      ),
    ).rejects.toThrow(FutureStatementMonthError);
    expect(reader.asked).toEqual([]);
  });

  it("refuse une société inconnue", async () => {
    const reader = new RecordingCycleOrders(null, []);
    await expect(
      new GetCycleStatementHandler(reader, new FixedClock(NOW)).execute(
        new GetCycleStatementQuery("absente", undefined),
      ),
    ).rejects.toThrow(StatementCompanyNotFoundError);
    expect(reader.asked).toEqual([]);
  });
});

describe("ExportCycleStatementHandler", () => {
  it("nomme le fichier PROVISOIRE, avec la société et le mois", async () => {
    const reader = new RecordingCycleOrders("Boulangerie du Port", [ORDER]);
    const file = await new ExportCycleStatementHandler(reader, new FixedClock(NOW)).execute(
      new ExportCycleStatementQuery("c1", "2026-09"),
    );
    expect(file.fileName).toBe("RELEVE-PROVISOIRE-Boulangerie du Port-2026-09.csv");
    expect(file.csv).toContain('"CMD-1"');
  });
});
