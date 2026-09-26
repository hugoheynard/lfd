import type { LoyaltySettings } from "../value-objects/loyalty-settings.js";

/** Lecture seule — ce que la conversion et l'écran consomment (ISP). */
export abstract class LoyaltySettingsReader {
  /** `null` = aucune ligne : le programme est fermé. */
  abstract read(): Promise<LoyaltySettings | null>;
}

/** Écriture seule — le geste du comptable. */
export abstract class LoyaltySettingsWriter {
  abstract write(
    settings: LoyaltySettings,
    updatedAt: Date,
    updatedByStaffId: string,
  ): Promise<void>;
}
