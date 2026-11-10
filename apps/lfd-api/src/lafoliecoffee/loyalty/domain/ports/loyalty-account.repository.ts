import type { LoyaltyAccount } from "../entities/loyalty-account.js";
import type { LoyaltyHolder } from "../value-objects/loyalty-holder.js";

/**
 * Port d'**écriture** du grand livre : charger le livre d'un titulaire sous
 * son verrou, puis écrire les lignes qu'il a produites.
 */
export abstract class LoyaltyAccountRepository {
  /**
   * Prend le verrou du titulaire, PUIS relit la somme de son livre. Exige une
   * unité de travail ouverte : un verrou de transaction pris en autocommit
   * serait relâché avant la lecture qu'il doit protéger.
   */
  abstract loadLocked(holder: LoyaltyHolder): Promise<LoyaltyAccount>;

  /** Écrit les lignes en attente — des insertions, jamais une mise à jour. */
  abstract save(account: LoyaltyAccount): Promise<void>;
}
