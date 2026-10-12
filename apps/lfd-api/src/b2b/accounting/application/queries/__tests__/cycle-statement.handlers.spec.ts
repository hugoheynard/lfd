import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  FutureStatementPeriodError,
  NotAStatementPeriodError,
  SeveralStatementIssuersError,
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
import { SELLER_FACTS } from "../../../domain/entities/__tests__/invoice-fixtures.js";
import {
  PayerBillingModesReader,
  type PayerModeSegments,
} from "../../../domain/ports/payer-billing-modes.reader.js";
import type { PayerModeSegment } from "../../../domain/services/payer-timeline.js";
import { STATEMENT_PERIODS_LISTED } from "../../../domain/services/statement-periods.js";
import {
  FixedFloor,
  FixedIssuers,
  FixedModeDates,
  FixedPayerModes,
  weeklySince2026,
} from "../../commands/__tests__/monthly-invoice-doubles.js";
import {
  ExportCycleStatementQuery,
  GetCycleStatementQuery,
  ListStatementCyclesQuery,
} from "../cycle-statement-queries.js";
import { ExportCycleStatementHandler } from "../export-cycle-statement.handler.js";
import { GetCycleStatementHandler } from "../get-cycle-statement.handler.js";
import { ListStatementCyclesHandler } from "../list-statement-cycles.handler.js";

/**
 * Dates absolues sur une horloge FIXÉE — jamais comparées au mur (CLAUDE.md §5).
 * 5 octobre 2026, midi à Paris.
 */
const NOW = new Date("2026-10-05T10:00:00.000Z");

/** La clôture de septembre 2026 (mensuel au 1er) — l'identité de la période. */
const SEPTEMBER_CLOSES_AT = "2026-09-30T22:00:00.000Z";

/** `count` entités émettrices en service — seul leur identifiant compte ici. */
const issuers = (count = 1): FixedIssuers =>
  new FixedIssuers(
    Array.from({ length: count }, (_, rank) => ({
      ...SELLER_FACTS,
      legalEntityId: `le_${String(rank)}`,
    })),
  );

/** Les payeurs de chaque entité ; une entité absente n'en a aucun. */
class PayerModesByEntity extends PayerBillingModesReader {
  constructor(private readonly byEntity: ReadonlyMap<string, readonly PayerModeSegments[]>) {
    super();
  }
  segmentsOf(legalEntityId: string): Promise<readonly PayerModeSegments[]> {
    return Promise.resolve(this.byEntity.get(legalEntityId) ?? []);
  }
  segmentsOfPayer(legalEntityId: string, payerId: string): Promise<readonly PayerModeSegment[]> {
    const payers = this.byEntity.get(legalEntityId) ?? [];
    return Promise.resolve(
      payers.find((payer) => payer.payerCompanyId === payerId)?.segments ?? [],
    );
  }
}

/** c1 paie chaque lundi : sa semaine du 5 octobre 2026 se clôt le lundi 12. */
const WEEKLY = weeklySince2026("c1");

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
  return new GetCycleStatementHandler(
    reader,
    billing,
    new FixedClock(NOW),
    issuers(),
    new FixedModeDates(),
    new FixedPayerModes(),
  );
}

const ORDER: CycleOrder = {
  id: "o1",
  orderNumber: "CMD-1",
  placedAt: new Date("2026-09-12T08:00:00.000Z"),
  companyId: "c1",
  billedCompanyId: null,
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

const listHandler = (
  payers: PayerBillingModesReader,
  floor: Date | null,
  issuerCount = 1,
): ListStatementCyclesHandler =>
  new ListStatementCyclesHandler(
    new FixedClock(NOW),
    issuers(issuerCount),
    new FixedModeDates(),
    payers,
    new FixedFloor(floor),
  );

const ofC1 = new ListStatementCyclesQuery("c1");

describe("ListStatementCyclesHandler", () => {
  it("au mensuel au 1er sans mise en service : douze mois civils, le mois en cours d'abord et lui seul « en cours »", async () => {
    const { cycles } = await listHandler(new FixedPayerModes(), null).execute(ofC1);
    expect(cycles).toHaveLength(STATEMENT_PERIODS_LISTED);
    expect(cycles[0]).toEqual({
      periodClosesAt: "2026-10-31T23:00:00.000Z",
      periodStartsAt: "2026-09-30T22:00:00.000Z",
      periodLabel: "du 1er au 31 octobre 2026",
      inProgress: true,
    });
    expect(cycles.slice(1).every((cycle) => !cycle.inProgress)).toBe(true);
    expect(cycles.at(-1)?.periodStartsAt).toBe("2025-10-31T23:00:00.000Z");
  });

  it("un payeur hebdomadaire : SES semaines, pas des mois", async () => {
    const { cycles } = await listHandler(WEEKLY, null).execute(ofC1);
    expect(cycles.slice(0, 2).map((cycle) => cycle.periodLabel)).toEqual([
      "du 5 au 11 octobre 2026",
      "du 28 septembre au 4 octobre 2026",
    ]);
  });

  it("un autre payeur de la même entité, qui n'a rien choisi : des mois (M4a)", async () => {
    const { cycles } = await listHandler(WEEKLY, null).execute(new ListStatementCyclesQuery("c2"));
    expect(cycles[0]?.periodLabel).toBe("du 1er au 31 octobre 2026");
  });

  it("sans payeur : le calendrier de l'entité — la semaine d'un payeur coupe le mois", async () => {
    const { cycles } = await listHandler(WEEKLY, null).execute(new ListStatementCyclesQuery());
    expect(cycles.slice(0, 3).map((cycle) => cycle.periodLabel)).toEqual([
      "du 5 au 11 octobre 2026",
      "du 1er au 4 octobre 2026",
      "du 28 au 30 septembre 2026",
    ]);
  });

  it("ne propose aucune période close avant la mise en service, mais toujours celle en cours", async () => {
    const floor = new Date("2026-09-27T22:00:00.000Z"); // lundi 28 septembre, 00h00
    const weekly = await listHandler(WEEKLY, floor).execute(ofC1);
    expect(weekly.cycles.map((cycle) => cycle.periodClosesAt)).toEqual([
      "2026-10-11T22:00:00.000Z",
      "2026-10-04T22:00:00.000Z",
    ]);

    const future = await listHandler(
      new FixedPayerModes(),
      new Date("2026-12-01T00:00:00Z"),
    ).execute(ofC1);
    expect(future.cycles).toHaveLength(1);
    expect(future.cycles[0]?.inProgress).toBe(true);
  });

  it("plusieurs entités aux mêmes dates : ces dates, sans en choisir une", async () => {
    const { cycles } = await listHandler(WEEKLY, null, 2).execute(ofC1);
    expect(cycles[0]?.periodLabel).toBe("du 5 au 11 octobre 2026");
  });

  it("refuse de choisir quand plusieurs entités en service n'ont pas les mêmes dates", async () => {
    const weekly = await weeklySince2026("c1").segmentsOf();
    const payers = new PayerModesByEntity(new Map([["le_1", weekly]]));
    await expect(listHandler(payers, null, 2).execute(ofC1)).rejects.toBeInstanceOf(
      SeveralStatementIssuersError,
    );
  });

  it("sans entité en service, suit le mensuel au 1er", async () => {
    const { cycles } = await listHandler(WEEKLY, null, 0).execute(ofC1);
    expect(cycles[0]?.periodLabel).toBe("du 1er au 31 octobre 2026");
  });
});

describe("GetCycleStatementHandler", () => {
  it("lit le cycle en cours quand aucun mois n'est demandé, et le dit provisoire", async () => {
    const reader = new RecordingCycleOrders("Boulangerie du Port", [ORDER]);
    const view = await getHandler(reader).execute(new GetCycleStatementQuery("c1", undefined));

    expect(reader.asked[0]?.companyIds).toEqual(["c1"]);
    expect(reader.asked[0]?.cycle.startsAt.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(view.cycle).toMatchObject({
      periodClosesAt: "2026-10-31T23:00:00.000Z",
      periodLabel: "du 1er au 31 octobre 2026",
      inProgress: true,
    });
    expect(view.provisional).toBe(true);
    expect(view.totals.unventilatedVatCents).toBe(55);
    expect(view.groups[0]?.orders[0]).toMatchObject({ orderNumber: "CMD-1", vatVentilated: false });
  });

  it("lit une période passée comme close", async () => {
    const reader = new RecordingCycleOrders("Boulangerie du Port", []);
    const view = await getHandler(reader).execute(
      new GetCycleStatementQuery("c1", SEPTEMBER_CLOSES_AT),
    );
    expect(view.cycle).toMatchObject({
      periodClosesAt: SEPTEMBER_CLOSES_AT,
      periodLabel: "du 1er au 30 septembre 2026",
      inProgress: false,
    });
    expect(reader.asked[0]?.cycle.closesAt.toISOString()).toBe(SEPTEMBER_CLOSES_AT);
  });

  it("lit la semaine demandée d'un payeur hebdomadaire", async () => {
    const reader = new RecordingCycleOrders("Boulangerie du Port", []);
    const handler = new GetCycleStatementHandler(
      reader,
      new FixedBilling(),
      new FixedClock(NOW),
      issuers(),
      new FixedModeDates(),
      WEEKLY,
    );
    const view = await handler.execute(
      new GetCycleStatementQuery("c1", "2026-10-04T22:00:00.000Z"),
    );
    expect(view.cycle.periodLabel).toBe("du 28 septembre au 4 octobre 2026");
    expect(reader.asked[0]?.cycle.startsAt.toISOString()).toBe("2026-09-27T22:00:00.000Z");
  });

  it("refuse une période future sans interroger les commandes", async () => {
    const reader = new RecordingCycleOrders("Boulangerie du Port", []);
    await expect(
      getHandler(reader).execute(new GetCycleStatementQuery("c1", "2026-11-30T23:00:00.000Z")),
    ).rejects.toThrow(FutureStatementPeriodError);
    expect(reader.asked).toEqual([]);
  });

  it("refuse un instant qui ne clôt aucune période de l'entité", async () => {
    const reader = new RecordingCycleOrders("Boulangerie du Port", []);
    await expect(
      getHandler(reader).execute(new GetCycleStatementQuery("c1", "2026-09-15T22:00:00.000Z")),
    ).rejects.toThrow(NotAStatementPeriodError);
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
    ).execute(new GetCycleStatementQuery("c1", SEPTEMBER_CLOSES_AT));

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
  it("nomme le fichier PROVISOIRE, avec la société et le dernier jour de la période", async () => {
    const reader = new RecordingCycleOrders("Boulangerie du Port", [ORDER]);
    const file = await new ExportCycleStatementHandler(
      reader,
      new FixedBilling(),
      new FixedClock(NOW),
      issuers(),
      new FixedModeDates(),
      new FixedPayerModes(),
    ).execute(new ExportCycleStatementQuery("c1", SEPTEMBER_CLOSES_AT));
    expect(file.fileName).toBe("RELEVE-PROVISOIRE-Boulangerie du Port-20260930.csv");
    expect(file.csv).toContain('"CMD-1"');
  });
});
