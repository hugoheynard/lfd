import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  FutureStatementMonthError,
  StatementCompanyNotFoundError,
} from "../../../domain/errors/statement-errors.js";
import {
  CycleOrdersReader,
  type CycleOrder,
  type StatementCompany,
} from "../../../domain/ports/cycle-orders.reader.js";
import {
  StatementBillingReader,
  type BillingFollow,
  type SelfPayingEntity,
} from "../../../domain/ports/statement-billing.reader.js";
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
  readonly asked: { companyIds: readonly string[]; cycle: BillingCycle }[] = [];

  constructor(
    private readonly name: string | null,
    private readonly orders: readonly CycleOrder[],
  ) {
    super();
  }

  statementCompany(): Promise<StatementCompany | null> {
    return Promise.resolve(this.name === null ? null : { name: this.name, label: this.name });
  }

  cycleOrders(companyIds: readonly string[], cycle: BillingCycle): Promise<readonly CycleOrder[]> {
    this.asked.push({ companyIds, cycle });
    return Promise.resolve(this.orders.filter((order) => companyIds.includes(order.companyId)));
  }
}

/** Des suivis donnés d'avance ; la société du relevé n'est le site de personne. */
class FixedBilling extends StatementBillingReader {
  constructor(
    private readonly towards: readonly BillingFollow[] = [],
    private readonly selfPaying: readonly SelfPayingEntity[] = [],
  ) {
    super();
  }

  followsTowards(): Promise<readonly BillingFollow[]> {
    return Promise.resolve(this.towards);
  }

  followsOf(): Promise<readonly BillingFollow[]> {
    return Promise.resolve([]);
  }

  selfPayingSubAccounts(): Promise<readonly SelfPayingEntity[]> {
    return Promise.resolve(this.selfPaying);
  }
}

function getHandler(
  reader: CycleOrdersReader,
  billing: StatementBillingReader = new FixedBilling(),
): GetCycleStatementHandler {
  return new GetCycleStatementHandler(reader, billing, new FixedClock(NOW));
}

const ORDER: CycleOrder = {
  id: "o1",
  orderNumber: "CMD-1",
  placedAt: new Date("2026-09-12T08:00:00.000Z"),
  companyId: "c1",
  siteName: "Boulangerie du Port",
  subtotalCents: 1_000,
  discountCents: 0,
  voucherDiscountCents: 0,
  deliveryFeeCents: 0,
  lateFeeCents: 0,
  vatCents: 55,
  vatShares: null,
  totalCents: 1_055,
  collectionState: "due",
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
    const view = await getHandler(reader).execute(new GetCycleStatementQuery("c1", undefined));

    expect(reader.asked[0]?.companyIds).toEqual(["c1"]);
    expect(reader.asked[0]?.cycle.startsAt.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(view.cycle).toMatchObject({ month: "2026-10", inProgress: true });
    expect(view.provisional).toBe(true);
    expect(view.totals.unventilatedVatCents).toBe(55);
    expect(view.groups[0]?.orders[0]).toMatchObject({ orderNumber: "CMD-1", vatVentilated: false });
  });

  it("lit un mois passé comme clos", async () => {
    const reader = new RecordingCycleOrders("Boulangerie du Port", []);
    const view = await getHandler(reader).execute(new GetCycleStatementQuery("c1", "2026-09"));
    expect(view.cycle).toMatchObject({ month: "2026-09", inProgress: false });
    expect(reader.asked[0]?.cycle.closesAt.toISOString()).toBe("2026-09-30T22:00:00.000Z");
  });

  it("refuse un mois futur sans interroger les commandes", async () => {
    const reader = new RecordingCycleOrders("Boulangerie du Port", []);
    await expect(
      getHandler(reader).execute(new GetCycleStatementQuery("c1", "2026-11")),
    ).rejects.toThrow(FutureStatementMonthError);
    expect(reader.asked).toEqual([]);
  });

  it("refuse une société inconnue", async () => {
    const reader = new RecordingCycleOrders(null, []);
    await expect(
      getHandler(reader).execute(new GetCycleStatementQuery("absente", undefined)),
    ).rejects.toThrow(StatementCompanyNotFoundError);
    expect(reader.asked).toEqual([]);
  });
});

describe("GetCycleStatementHandler — la vue payeur", () => {
  /** Le chalet suit `billing` vers c1 depuis le 10 septembre, sans fin. */
  const FOLLOW: BillingFollow = {
    companyId: "chalet",
    payerId: "c1",
    payerName: "Alpes Chalets",
    validFrom: new Date("2026-09-10T00:00:00.000Z"),
    validTo: null,
  };
  const chaletOrder = (id: string, placedAt: string): CycleOrder => ({
    ...ORDER,
    id,
    orderNumber: id,
    companyId: "chalet",
    siteName: "Chalet Edelweiss",
    placedAt: new Date(placedAt),
  });

  it("lit aussi les commandes des sites suivis, et les groupe sous leur nom", async () => {
    const reader = new RecordingCycleOrders("Alpes Chalets", [
      ORDER,
      chaletOrder("AVANT", "2026-09-05T08:00:00.000Z"),
      chaletOrder("APRES", "2026-09-15T08:00:00.000Z"),
    ]);
    const view = await getHandler(
      reader,
      new FixedBilling([FOLLOW], [{ companyId: "club", name: "Club Med" }]),
    ).execute(new GetCycleStatementQuery("c1", "2026-09"));

    expect(reader.asked[0]?.companyIds).toEqual(["c1", "chalet"]);
    expect(view.groups.map((group) => [group.label, group.orders.map((o) => o.id)])).toEqual([
      ["Alpes Chalets", ["o1"]],
      ["Chalet Edelweiss", ["APRES"]],
    ]);
    expect(view.totals.totalCents).toBe(2 * ORDER.totalCents);
    expect(view.selfPayingEntities).toEqual([{ companyId: "club", name: "Club Med" }]);
  });
});

describe("ExportCycleStatementHandler", () => {
  it("nomme le fichier PROVISOIRE, avec la société et le mois", async () => {
    const reader = new RecordingCycleOrders("Boulangerie du Port", [ORDER]);
    const file = await new ExportCycleStatementHandler(
      reader,
      new FixedBilling(),
      new FixedClock(NOW),
    ).execute(new ExportCycleStatementQuery("c1", "2026-09"));
    expect(file.fileName).toBe("RELEVE-PROVISOIRE-Boulangerie du Port-2026-09.csv");
    expect(file.csv).toContain('"CMD-1"');
  });
});
