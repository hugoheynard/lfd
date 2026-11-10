import type { LateFeeSetting } from "../../../orders/domain/ports/order-late-fee.reader.js";
import { OrderLateFeeRepository } from "../../domain/order-late-fee.repository.js";

/**
 * Les faits de la surtaxe de retard (plan
 * `documentation/journalisation/plan-journal-d-activite.md`, lot 1,
 * 2026-09-19) : un fait par geste réel, l'avant et l'après.
 */
export const FIVE_EUROS: LateFeeSetting = {
  adjustment: { mode: "amount", cents: 500 },
  vatRatePercent: 20,
};

/** Le réglage unique, en mémoire — et l'ordre de ce qu'on lui a fait. */
export class InMemoryLateFee extends OrderLateFeeRepository {
  current: LateFeeSetting | null = null;
  readonly log: string[] = [];

  read(): Promise<LateFeeSetting | null> {
    this.log.push("read");
    return Promise.resolve(this.current);
  }

  save(setting: LateFeeSetting, updatedBy: string): Promise<void> {
    this.log.push(`save:${updatedBy}`);
    this.current = setting;
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.log.push("clear");
    this.current = null;
    return Promise.resolve();
  }
}
