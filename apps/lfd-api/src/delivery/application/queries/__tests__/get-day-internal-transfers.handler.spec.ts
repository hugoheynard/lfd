import {
  DayTransfersReader,
  type DayTransferRow,
} from "../../../domain/ports/day-transfers.reader.js";
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

describe("GetDayInternalTransfersHandler — de quoi ouvrir le manifeste depuis l'encadré", () => {
  it("rend chaque transfert du jour, son site et son départ", async () => {
    const departed = new Date(0);
    const reader = new FixedDayTransfers([
      { id: "t_1", siteId: "s_village", siteLabel: "Le Village", departedAt: null },
      { id: "t_2", siteId: "s_haut", siteLabel: "Le Haut", departedAt: departed },
    ]);

    const view = await new GetDayInternalTransfersHandler(reader).execute(
      new GetDayInternalTransfersQuery(DAY),
    );

    expect(reader.asked).toEqual([DAY]);
    expect(view).toEqual({
      day: DAY,
      transfers: [
        { transferId: "t_1", siteId: "s_village", siteLabel: "Le Village", departedAt: null },
        {
          transferId: "t_2",
          siteId: "s_haut",
          siteLabel: "Le Haut",
          departedAt: departed.toISOString(),
        },
      ],
    });
  });

  it("un jour sans transfert rend une liste vide", async () => {
    const view = await new GetDayInternalTransfersHandler(new FixedDayTransfers([])).execute(
      new GetDayInternalTransfersQuery(DAY),
    );
    expect(view).toEqual({ day: DAY, transfers: [] });
  });
});
