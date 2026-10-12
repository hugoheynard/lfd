import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { LegalEntityNotFoundError } from "../../../domain/errors/accounting-errors.js";
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

function run(at: Date, payers: readonly PayerModeSegments[] = [], entityId = "le_1") {
  const reader = new RecordingReader();
  const handler = new GetMonthlyInvoicesHandler(
    new OnlyLe1(),
    new FixedModeDates(),
    new FixedPayerModes(payers),
    reader,
    new FixedClock(at),
  );
  return { reader, view: handler.execute(new GetMonthlyInvoicesQuery(entityId)) };
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
    expect(reader.asked).toEqual([new Date("2026-09-30T22:00:00.000Z")]);
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
