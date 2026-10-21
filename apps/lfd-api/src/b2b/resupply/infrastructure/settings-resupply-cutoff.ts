import { orderLimitInstant } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { OrderCutoffSettingsReader } from "../../order-cutoffs/domain/order-cutoff-settings.reader.js";
import { ResupplyCutoff } from "../domain/resupply-cutoff.js";

/** La veille de la journée servie : l'heure du réassort se lit toujours ce jour-là. */
const EVE = 1;

/**
 * {@link ResupplyCutoff} sur le réglage du commerce : l'heure du réassort
 * (lot R3a, 2026-10-21), la veille, à l'heure de Paris — la même conversion
 * que la passation (`orderLimitInstant`). Aucun rattrapage : c'est l'heure
 * que le plan du fournil suit, et il s'arrête dessus.
 */
@Injectable()
export class SettingsResupplyCutoff extends ResupplyCutoff {
  constructor(private readonly settings: OrderCutoffSettingsReader) {
    super();
  }

  async deadlineFor(serviceDay: string): Promise<Date | null> {
    const { resupplyCutoffTime } = await this.settings.current();
    return orderLimitInstant(
      { daysBefore: EVE, time: resupplyCutoffTime, graceMinutes: 0 },
      serviceDay,
    );
  }
}
