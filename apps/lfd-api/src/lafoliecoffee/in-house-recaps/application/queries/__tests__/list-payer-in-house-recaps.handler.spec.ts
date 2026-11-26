import {
  InHousePeriodsReader,
  type InHousePeriod,
} from "../../../../account/domain/ports/in-house-periods.reader.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  InHouseRecapRunsReader,
  type RecapRunView,
} from "../../../domain/ports/in-house-recap-runs.reader.js";
import { PayerRecapsReader, type RecapSummary } from "../../../domain/ports/payer-recaps.reader.js";
import { ListPayerInHouseRecapsHandler } from "../list-payer-in-house-recaps.handler.js";
import { ListPayerInHouseRecapsQuery } from "../list-payer-in-house-recaps.query.js";

// L'horloge du test est fixe : ces instants ne sont comparés qu'à elle.
const NOW = new Date("2026-12-05T10:00:00.000Z");
const DECLARED = new Date("2026-08-15T10:00:00.000Z");
const ISSUED = new Date("2026-10-01T00:30:00.000Z");

class Summaries extends PayerRecapsReader {
  constructor(private readonly rows: readonly RecapSummary[]) {
    super();
  }
  summariesOf(): Promise<readonly RecapSummary[]> {
    return Promise.resolve(this.rows);
  }
}

class Runs extends InHouseRecapRunsReader {
  constructor(private readonly rows: readonly RecapRunView[]) {
    super();
  }
  runsOf(): Promise<readonly RecapRunView[]> {
    return Promise.resolve(this.rows);
  }
}

class Periods extends InHousePeriodsReader {
  constructor(private readonly rows: readonly InHousePeriod[]) {
    super();
  }
  periodsOf(): Promise<readonly InHousePeriod[]> {
    return Promise.resolve(this.rows);
  }
}

describe("ListPayerInHouseRecapsHandler — récapitulatifs, mois vides, mois manqués", () => {
  it("un mois vide n'est pas manqué ; un mois sans issue l'est", async () => {
    const handler = new ListPayerInHouseRecapsHandler(
      new Summaries([
        {
          id: "r1",
          number: "RBL-202609-0001",
          month: "2026-09",
          issuedAt: ISSUED,
          hasDocument: false,
          replacedById: null,
          noteCount: 4,
          revisedNoteCount: 1,
        },
      ]),
      new Runs([
        { month: "2026-08", recapId: null, attemptedAt: ISSUED },
        { month: "2026-09", recapId: "r1", attemptedAt: ISSUED },
      ]),
      new Periods([{ declaredAt: DECLARED, withdrawnAt: null }]),
      new FixedClock(NOW),
    );

    const view = await handler.execute(new ListPayerInHouseRecapsQuery("resto"));

    expect(view.emptyMonths).toEqual(["2026-08"]);
    expect(view.missedMonths).toEqual(["2026-10", "2026-11"]);
    expect(view.recaps[0]).toMatchObject({
      id: "r1",
      issuedAt: ISSUED.toISOString(),
      revisedNoteCount: 1,
    });
  });
});
