import type { BillingModeDatesHistory } from "../entities/billing-mode-dates-history.js";
import type { BillingMode } from "../value-objects/billing-mode.js";

/**
 * Port d'ÉCRITURE des dates d'un mode (M1) : charge l'historique entier du
 * mode, le rend après le geste. L'existence de l'entité est vérifiée par
 * l'appelant (`loadOrFail`) : un mode sans ligne est un historique vide.
 */
export abstract class BillingModeDatesRepository {
  abstract load(legalEntityId: string, mode: BillingMode): Promise<BillingModeDatesHistory>;

  /** Insère les segments neufs, pose les annulations — rien d'autre ne s'écrit. */
  abstract save(history: BillingModeDatesHistory): Promise<void>;
}
