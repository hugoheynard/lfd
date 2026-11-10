import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { LegalEntityNotFoundError } from "../../../domain/errors/accounting-errors.js";
import {
  ClosureBatchesReader,
  type ClosureBatchRead,
} from "../../../domain/ports/closure-batches.reader.js";
import {
  MonthlyInvoicesReader,
  type MonthlyInvoicesRead,
} from "../../../domain/ports/monthly-invoices.reader.js";
import {
  LegalEntityReader,
  type LegalEntityRecord,
} from "../../../domain/ports/legal-entity.reader.js";
import type { PayerModeSegments } from "../../../domain/ports/payer-billing-modes.reader.js";
import { paris } from "../../../domain/services/__tests__/billing-mode-fixtures.js";
import { toView } from "../../../infrastructure/legal-entity.mapper.js";
import {
  FixedModeDates,
  FixedPayerModes,
} from "../../commands/__tests__/monthly-invoice-doubles.js";
import { declaredEntity } from "../../commands/__tests__/mandate-setting-doubles.js";
import { GetMonthlyInvoicesHandler } from "../get-monthly-invoices.handler.js";
import { GetMonthlyInvoicesQuery } from "../get-monthly-invoices.query.js";

/**
 * L'écran « Prélèvement du mois » lit la dernière clôture de l'entité (R3).
 * Horloge FIXE, posée par rapport aux clôtures : aucune date ne se compare
 * au calendrier réel.
 */

const FLOOR = new Date("2026-08-31T22:00:00.000Z");

class RecordingReader extends MonthlyInvoicesReader {
  readonly asked: Date[] = [];
  ofPeriod(_legalEntityId: string, periodClosesAt: Date): Promise<MonthlyInvoicesRead> {
    this.asked.push(periodClosesAt);
    return Promise.resolve({ floorAt: FLOOR, invoices: [], signaled: [], autopilotRun: null });
  }
}

/** Un lot CORE par clôture listée dans `closed` ; enregistre les clôtures demandées. */
class FixedBatches extends ClosureBatchesReader {
  readonly asked: (readonly Date[])[] = [];
  constructor(private readonly closed: readonly Date[] = []) {
    super();
  }
  ofClosures(
    _legalEntityId: string,
    closures: readonly Date[],
  ): Promise<readonly ClosureBatchRead[]> {
    this.asked.push(closures);
    return Promise.resolve(
      this.closed
        .filter((closesAt) => closures.some((asked) => asked.getTime() === closesAt.getTime()))
        .map((closesAt) => ({
          closesAt,
          batch: {
            batchId: `b_${closesAt.toISOString()}`,
            scheme: "CORE" as const,
            status: "constituted" as const,
            periodLabel: "libellé du lot",
            lineCount: 1,
            totalCents: 10_550,
          },
        })),
    );
  }
}

class OnlyLe1 extends LegalEntityReader {
  list(): Promise<readonly LegalEntityRecord[]> {
    return Promise.resolve([]);
  }
  byId(id: string): Promise<LegalEntityRecord | null> {
    return Promise.resolve(id === "le_1" ? toView(declaredEntity(), true) : null);
  }
}

/** Un payeur hebdomadaire au lundi depuis le 1er août 2026. */
const WEEKLY: PayerModeSegments = {
  payerCompanyId: "c_port",
  segments: [{ effectiveFrom: paris("2026-08-01"), mode: "weekly" }],
};

function run(
  at: Date,
  payers: readonly PayerModeSegments[] = [],
  entityId = "le_1",
  batches = new FixedBatches(),
) {
  const reader = new RecordingReader();
  const handler = new GetMonthlyInvoicesHandler(
    new OnlyLe1(),
    new FixedModeDates(),
    new FixedPayerModes(payers),
    reader,
    batches,
    new FixedClock(at),
  );
  return { reader, batches, view: handler.execute(new GetMonthlyInvoicesQuery(entityId)) };
}

describe("GetMonthlyInvoices — la dernière clôture de l'entité", () => {
  it("mensuel au 1er : septembre, dès le 30 à 23h55, avec ses bornes et son libellé", async () => {
    const { reader, view } = run(new Date("2026-09-30T21:55:00.000Z"));

    expect(await view).toMatchObject({
      periodClosesAt: "2026-09-30T22:00:00.000Z",
      periodStartsAt: "2026-08-31T22:00:00.000Z",
      periodLabel: "du 1er au 30 septembre 2026",
      issuableFrom: "2026-09-30T21:55:00.000Z",
      open: true,
    });
    // Une lecture par clôture montrée : le 1er septembre (la dernière atteinte) et le 1er octobre.
    expect(reader.asked).toEqual([
      new Date("2026-08-31T22:00:00.000Z"),
      new Date("2026-09-30T22:00:00.000Z"),
    ]);
  });

  it("un payeur hebdomadaire : la dernière clôture est son lundi, sa semaine", async () => {
    const { view } = run(new Date("2026-09-30T08:00:00.000Z"), [WEEKLY]);

    expect(await view).toMatchObject({
      periodClosesAt: "2026-09-27T22:00:00.000Z",
      periodLabel: "du 21 au 27 septembre 2026",
    });
  });

  it("rythmes mêlés, au 1er : la clôture du mensuel, son mois entier", async () => {
    const { view } = run(new Date("2026-09-30T21:55:00.000Z"), [WEEKLY]);

    expect(await view).toMatchObject({
      periodClosesAt: "2026-09-30T22:00:00.000Z",
      periodLabel: "du 1er au 30 septembre 2026",
    });
  });

  it("une période close avant la mise en service n'est pas ouverte", async () => {
    const { view } = run(new Date("2026-08-31T21:55:00.000Z"));

    expect((await view).open).toBe(false);
  });

  it("une entité inconnue : 404", async () => {
    await expect(run(new Date("2026-09-30T21:55:00.000Z"), [], "le_x").view).rejects.toThrow(
      LegalEntityNotFoundError,
    );
  });
});

describe("GetMonthlyInvoices — les clôtures du mois (M4c)", () => {
  it("rythmes mêlés, le mardi 6 octobre : le 1er puis chaque lundi, chacun avec ses modes", async () => {
    const { view } = run(paris("2026-10-06", "08:00"), [WEEKLY]);
    const closures = (await view).closures;

    expect(closures.map((closure) => [closure.periodClosesAt, closure.modes])).toEqual([
      // Le 1er clôt aussi l'hebdomadaire : sa semaine est coupée (Q-L1).
      [paris("2026-10-01").toISOString(), ["monthly", "weekly"]],
      [paris("2026-10-05").toISOString(), ["weekly"]],
      [paris("2026-10-12").toISOString(), ["weekly"]],
      [paris("2026-10-19").toISOString(), ["weekly"]],
      [paris("2026-10-26").toISOString(), ["weekly"]],
    ]);
    expect(closures.map((closure) => closure.reached)).toEqual([true, true, false, false, false]);
    expect(closures[1]?.periodLabel).toBe("du 1er au 4 octobre 2026");
  });

  it("chaque clôture porte SES lots, et la vue du haut est la clôture à émettre", async () => {
    const batches = new FixedBatches([paris("2026-10-01"), paris("2026-10-05")]);
    const { view } = run(paris("2026-10-06", "08:00"), [WEEKLY], "le_1", batches);
    const read = await view;

    expect(read.closures.map((closure) => closure.batches.map((batch) => batch.batchId))).toEqual([
      [`b_${paris("2026-10-01").toISOString()}`],
      [`b_${paris("2026-10-05").toISOString()}`],
      [],
      [],
      [],
    ]);
    expect(read.periodClosesAt).toBe(paris("2026-10-05").toISOString());
    expect(read.batches).toHaveLength(1);
    expect(batches.asked).toHaveLength(1);
  });
});
