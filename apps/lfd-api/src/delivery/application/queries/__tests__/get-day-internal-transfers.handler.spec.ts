import {
  DayTransfersReader,
  type DayTransferRow,
} from "../../../domain/ports/day-transfers.reader.js";
import { TransferBinCounts } from "../../../domain/ports/transfer-bin-counts.reader.js";
import { GetDayInternalTransfersHandler } from "../get-day-internal-transfers.handler.js";
import { GetDayInternalTransfersQuery } from "../get-day-internal-transfers.query.js";

// Un jour seulement transmis, jamais comparé à l'horloge.
const DAY = "2030-03-12";

/** Le port doublé à la main : rend ses lignes pour le jour demandé, rien pour un autre. */
class FixedDayTransfers extends DayTransfersReader {
  readonly asked: string[] = [];

  constructor(private readonly rows: readonly DayTransferRow[]) {
    super();
  }

  transfersOn(serviceDay: string): Promise<readonly DayTransferRow[]> {
    this.asked.push(serviceDay);
    return Promise.resolve(serviceDay === DAY ? this.rows : []);
  }
}

/** Les bacs comptés, par transfert ; un transfert absent n'en a pas. */
class FixedBinCounts extends TransferBinCounts {
  readonly asked: (readonly string[])[] = [];

  constructor(private readonly counts: ReadonlyMap<string, number>) {
    super();
  }

  liveBinCounts(transferIds: readonly string[]): Promise<ReadonlyMap<string, number>> {
    this.asked.push(transferIds);
    return Promise.resolve(this.counts);
  }
}

const ROW: DayTransferRow = {
  id: "t_1",
  siteId: "s_village",
  siteLabel: "Le Village",
  departedAt: null,
  plannedDepartureAt: null,
  placed: false,
  orderCount: 0,
  resupplyCount: 0,
};

describe("GetDayInternalTransfersHandler — la ligne du transfert et son manifeste", () => {
  it("rend chaque transfert du jour : site, départ requis, ce qu'il porte, ses sacs, son départ", async () => {
    const planned = new Date(0);
    const departed = new Date(60_000);
    const reader = new FixedDayTransfers([
      { ...ROW, plannedDepartureAt: planned, placed: true, orderCount: 3, resupplyCount: 1 },
      { ...ROW, id: "t_2", siteId: "s_haut", siteLabel: "Le Haut", departedAt: departed },
    ]);
    const bins = new FixedBinCounts(new Map([["t_1", 4]]));

    const view = await new GetDayInternalTransfersHandler(reader, bins).execute(
      new GetDayInternalTransfersQuery(DAY),
    );

    expect(reader.asked).toEqual([DAY]);
    expect(bins.asked).toEqual([["t_1", "t_2"]]);
    expect(view).toEqual({
      day: DAY,
      transfers: [
        {
          transferId: "t_1",
          siteId: "s_village",
          siteLabel: "Le Village",
          departedAt: null,
          plannedDepartureAt: planned.toISOString(),
          placed: true,
          orderCount: 3,
          resupplyCount: 1,
          binCount: 4,
        },
        {
          transferId: "t_2",
          siteId: "s_haut",
          siteLabel: "Le Haut",
          departedAt: departed.toISOString(),
          plannedDepartureAt: null,
          placed: false,
          orderCount: 0,
          resupplyCount: 0,
          binCount: 0,
        },
      ],
    });
  });

  it("un jour sans transfert rend une liste vide", async () => {
    const view = await new GetDayInternalTransfersHandler(
      new FixedDayTransfers([]),
      new FixedBinCounts(new Map()),
    ).execute(new GetDayInternalTransfersQuery(DAY));
    expect(view).toEqual({ day: DAY, transfers: [] });
  });
});
