import type { LoyaltyHolder } from "../value-objects/loyalty-holder.js";

/**
 * **Le verrou d'un titulaire** — celui que prennent la conversion, le crédit,
 * l'annulation d'un bon, et depuis le lot C sa réservation, sa libération et
 * son reliquat (plan D2, §11 bis S9). Tout ce qui lit puis écrit l'état d'un
 * titulaire le prend d'abord : deux gestes concurrents se suivent.
 *
 * Exige une unité de travail ouverte : il est relâché à la fin de la
 * transaction, jamais oublié.
 */
export abstract class LoyaltyHolderLock {
  abstract acquire(holder: LoyaltyHolder): Promise<void>;
}
