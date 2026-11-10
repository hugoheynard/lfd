import { Injectable } from "@nestjs/common";

import { OrderCutoffSettingsReader } from "../../order-cutoffs/domain/order-cutoff-settings.reader.js";
import {
  CustomerNudgeDelaysReader,
  type CustomerNudgeDelays,
} from "../domain/ports/customer-nudge-delays.reader.js";

/**
 * Les délais des deux relances, lus sur le réglage singleton de l'heure limite,
 * **décalés de la tolérance de retard** (Hugo, 2026-11-03) : le réglage dit
 * « après le retard », la règle compte « après la fin du créneau ».
 */
@Injectable()
export class SettingsCustomerNudgeDelaysReader extends CustomerNudgeDelaysReader {
  constructor(private readonly settings: OrderCutoffSettingsReader) {
    super();
  }

  async delays(): Promise<CustomerNudgeDelays> {
    const current = await this.settings.current();
    return {
      pickupReminderMinutes: current.lateToleranceMinutes + current.pickupReminderDelayMinutes,
      delayWarningMinutes: current.lateToleranceMinutes + current.delayWarningDelayMinutes,
    };
  }
}
