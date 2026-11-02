import { Injectable } from "@nestjs/common";

import { OrderCutoffSettingsReader } from "../../order-cutoffs/domain/order-cutoff-settings.reader.js";
import {
  type SameDayCircuitSettings,
  SameDayOrderReader,
} from "../domain/ports/same-day-order.reader.js";

/**
 * Les réglages du circuit du jour J, lus sur le réglage singleton de l'heure
 * limite. `sameDayAllowed` n'est pas recopié : depuis le lot L4, plus rien ne
 * le lit (colonne morte, plan du jour J, « Le bâti de L4 »).
 */
@Injectable()
export class SettingsSameDayOrderReader extends SameDayOrderReader {
  constructor(private readonly reader: OrderCutoffSettingsReader) {
    super();
  }

  async settings(): Promise<SameDayCircuitSettings> {
    const current = await this.reader.current();
    return {
      sameDayPublicAllowed: current.sameDayPublicAllowed,
      sameDayProAllowed: current.sameDayProAllowed,
      sameDayProOnline: current.sameDayProOnline,
      sameDayProWithoutCredit: current.sameDayProWithoutCredit,
      shelfHoldMinutes: current.shelfHoldMinutes,
    };
  }
}
