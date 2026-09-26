import type { LoyaltyHolder } from "../value-objects/loyalty-holder.js";

/**
 * **Qui peut convertir pour ce titulaire** (plan D1) : la personne elle-même,
 * connectée et active ; pour une société, toute personne active qui y est
 * rattachée.
 *
 * Appelé SOUS le verrou du livre : un rattachement retiré pendant qu'on
 * attendait le verrou est vu.
 */
export abstract class LoyaltyConversionGate {
  abstract mayConvert(holder: LoyaltyHolder, actorUserId: string): Promise<boolean>;
}
