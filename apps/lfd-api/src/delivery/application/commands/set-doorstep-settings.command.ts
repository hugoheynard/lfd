import type { DoorstepRule } from "@lfd/contracts";

/**
 * Poser le réglage GLOBAL de la décision d'avance à la porte (B3 bis). Acte
 * **staff** : `staffUserId` est figé dans la ligne avec le nom et le rôle.
 */
export class SetDoorstepSettingsCommand {
  constructor(
    readonly rule: DoorstepRule,
    readonly staffUserId: string,
  ) {}
}
