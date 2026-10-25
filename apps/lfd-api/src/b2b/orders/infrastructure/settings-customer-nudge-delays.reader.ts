import { Injectable } from "@nestjs/common";

import { OrderCutoffSettingsReader } from "../../order-cutoffs/domain/order-cutoff-settings.reader.js";
import {
  CustomerNudgeDelaysReader,
  type CustomerNudgeDelays,
} from "../domain/ports/customer-nudge-delays.reader.js";

/** Les délais des deux relances, lus sur le réglage singleton de l'heure limite. */
@Injectable()
export class SettingsCustomerNudgeDelaysReader extends CustomerNudgeDelaysReader {
  constructor(private readonly settings: OrderCutoffSettingsReader) {
    super();
  }

  async delays(): Promise<CustomerNudgeDelays> {
    const current = await this.settings.current();
    return {
      pickupReminderMinutes: current.pickupReminderDelayMinutes,
      delayWarningMinutes: current.delayWarningDelayMinutes,
    };
  }
}
