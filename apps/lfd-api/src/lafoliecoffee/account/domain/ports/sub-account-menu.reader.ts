import type { SubAccountMenuState } from "../entities/sub-account-menu.js";

/**
 * Port de **lecture** de la carte d'un sous-compte, pour l'écran qui la
 * règle. Distinct du dépôt : une lecture ne dépend pas de `save`.
 */
export abstract class SubAccountMenuReader {
  /** La carte de ce sous-compte, ou `null` s'il n'en a pas. */
  abstract read(companyId: string): Promise<SubAccountMenuState | null>;
}
