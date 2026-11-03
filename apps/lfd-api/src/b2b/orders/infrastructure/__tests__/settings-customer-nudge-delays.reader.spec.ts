import { DEFAULT_ORDER_CUTOFF_SETTINGS, type OrderCutoffSettingsView } from "@lfd/contracts";

import { OrderCutoffSettingsReader } from "../../../order-cutoffs/domain/order-cutoff-settings.reader.js";
import { SettingsCustomerNudgeDelaysReader } from "../settings-customer-nudge-delays.reader.js";

class FixedSettings extends OrderCutoffSettingsReader {
  constructor(private readonly view: OrderCutoffSettingsView) {
    super();
  }

  current(): Promise<OrderCutoffSettingsView> {
    return Promise.resolve(this.view);
  }
}

describe("SettingsCustomerNudgeDelaysReader", () => {
  /**
   * Régression (Hugo, 2026-11-03) : les relances comptaient depuis la fin du
   * créneau, et « Avertir le client » se proposait avant que la Supervision ne
   * dise la commande en retard. Elles comptent depuis la fin de la tolérance.
   */
  it("décale les deux délais de la tolérance de retard", async () => {
    const reader = new SettingsCustomerNudgeDelaysReader(
      new FixedSettings({
        ...DEFAULT_ORDER_CUTOFF_SETTINGS,
        lateToleranceMinutes: 15,
        pickupReminderDelayMinutes: 0,
        delayWarningDelayMinutes: 10,
      }),
    );

    expect(await reader.delays()).toEqual({ pickupReminderMinutes: 15, delayWarningMinutes: 25 });
  });

  it("sans tolérance, les délais réglés tels quels", async () => {
    const reader = new SettingsCustomerNudgeDelaysReader(
      new FixedSettings({
        ...DEFAULT_ORDER_CUTOFF_SETTINGS,
        lateToleranceMinutes: 0,
        pickupReminderDelayMinutes: 30,
        delayWarningDelayMinutes: 5,
      }),
    );

    expect(await reader.delays()).toEqual({ pickupReminderMinutes: 30, delayWarningMinutes: 5 });
  });
});
