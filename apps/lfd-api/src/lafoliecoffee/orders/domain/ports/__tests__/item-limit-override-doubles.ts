import { ItemLimitOverrideReader } from "../item-limit-override.reader.js";
import { ItemLimitOverrideRecorder } from "../item-limit-override.recorder.js";
import type { ItemLimitOverride } from "../../services/item-limit-overrides.js";

/** Des dépassements déjà consignés, lus par commande. */
export class ConsignedOverrides extends ItemLimitOverrideReader {
  constructor(private readonly overrides: readonly ItemLimitOverride[] = []) {
    super();
  }

  forOrder(orderId: string): Promise<readonly ItemLimitOverride[]> {
    return Promise.resolve(this.overrides.filter((override) => override.orderId === orderId));
  }
}

/** Les dépassements écrits, dans l'ordre ; `trace` reçoit « overrides » à chaque écriture. */
export class RecordedOverrides extends ItemLimitOverrideRecorder {
  readonly recorded: ItemLimitOverride[] = [];

  constructor(private readonly trace: string[] = []) {
    super();
  }

  record(overrides: readonly ItemLimitOverride[]): Promise<void> {
    if (overrides.length > 0) {
      this.trace.push("overrides");
    }
    this.recorded.push(...overrides);
    return Promise.resolve();
  }
}
