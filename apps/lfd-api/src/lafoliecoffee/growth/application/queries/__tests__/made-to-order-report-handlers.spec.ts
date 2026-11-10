import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { MadeToOrderReportPeriodError } from "../../../domain/errors/made-to-order-report-errors.js";
import {
  MadeToOrderClientReader,
  type MadeToOrderClientLine,
} from "../../../domain/ports/made-to-order-client.reader.js";
import {
  MadeToOrderMonthlyReader,
  type MadeToOrderMonthTally,
} from "../../../domain/ports/made-to-order-monthly.reader.js";
import { GetMadeToOrderByClientHandler } from "../get-made-to-order-by-client.handler.js";
import { GetMadeToOrderByClientQuery } from "../get-made-to-order-by-client.query.js";
import { GetMadeToOrderMonthlyHandler } from "../get-made-to-order-monthly.handler.js";
import { GetMadeToOrderMonthlyQuery } from "../get-made-to-order-monthly.query.js";

class RecordingMonthly extends MadeToOrderMonthlyReader {
  readonly asked: [string, string][] = [];
  constructor(private readonly rows: readonly MadeToOrderMonthTally[]) {
    super();
  }
  tallies(from: string, to: string): Promise<readonly MadeToOrderMonthTally[]> {
    this.asked.push([from, to]);
    return Promise.resolve(this.rows);
  }
}

class RecordingClients extends MadeToOrderClientReader {
  readonly asked: [string, string][] = [];
  lines(from: string, to: string): Promise<readonly MadeToOrderClientLine[]> {
    this.asked.push([from, to]);
    return Promise.resolve([]);
  }
}

describe("GetMadeToOrderMonthlyHandler", () => {
  it("lit du premier jour du plus ancien mois à aujourd'hui, jour de Paris", async () => {
    // 23 h 30 UTC le 31 octobre = 1ᵉʳ novembre à Paris : le mois courant est novembre.
    const reader = new RecordingMonthly([
      { month: "2026-11", madeToOrder: true, htCents: 500, orders: 1 },
    ]);
    const handler = new GetMadeToOrderMonthlyHandler(
      reader,
      new FixedClock(new Date("2026-10-31T23:30:00.000Z")),
    );

    const view = await handler.execute(new GetMadeToOrderMonthlyQuery(6));

    expect(reader.asked).toEqual([["2026-06-01", "2026-11-01"]]);
    expect(view.rows.map((row) => row.month)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
    expect(view.rows.at(-1)?.madeToOrderHtCents).toBe(500);
  });
});

describe("GetMadeToOrderByClientHandler", () => {
  it("refuse une période invalide sans rien lire", async () => {
    const reader = new RecordingClients();
    const handler = new GetMadeToOrderByClientHandler(reader);

    await expect(
      handler.execute(new GetMadeToOrderByClientQuery("2026-10-10", "2026-10-01")),
    ).rejects.toBeInstanceOf(MadeToOrderReportPeriodError);
    expect(reader.asked).toEqual([]);
  });

  it("lit la période demandée et la rend", async () => {
    const reader = new RecordingClients();
    const view = await new GetMadeToOrderByClientHandler(reader).execute(
      new GetMadeToOrderByClientQuery("2026-10-01", "2026-10-31"),
    );
    expect(reader.asked).toEqual([["2026-10-01", "2026-10-31"]]);
    expect(view).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
      madeToOrderHtCents: 0,
      unknownHtCents: 0,
      clients: [],
    });
  });
});
