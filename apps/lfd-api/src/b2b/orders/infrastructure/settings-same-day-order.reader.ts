import { Injectable } from "@nestjs/common";

import { OrderCutoffSettingsReader } from "../../order-cutoffs/domain/order-cutoff-settings.reader.js";
import { SameDayOrderReader } from "../domain/ports/same-day-order.reader.js";

/** Le réglage « jour même », lu sur le réglage singleton de l'heure limite. */
@Injectable()
export class SettingsSameDayOrderReader extends SameDayOrderReader {
  constructor(private readonly settings: OrderCutoffSettingsReader) {
    super();
  }

  async allowed(): Promise<boolean> {
    return (await this.settings.current()).sameDayAllowed;
  }
}
