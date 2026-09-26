import type { LoyaltySettingsInput } from "../../domain/value-objects/loyalty-settings.js";

/** Poser le réglage du programme en entier — ratio, clientèles, validité d'un bon. */
export class SetLoyaltySettingsCommand {
  constructor(
    readonly settings: LoyaltySettingsInput,
    readonly staffUserId: string,
  ) {}
}
