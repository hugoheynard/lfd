import type { SubAccountFollows } from "../entities/sub-account-follows.js";

/**
 * Port d'**écriture** des suivis : il prend et rend l'agrégat
 * {@link SubAccountFollows}, jamais une période isolée.
 */
export abstract class CompanyFollowsRepository {
  /** Toutes les périodes de cette société — un agrégat vide si elle n'a jamais rien suivi. */
  abstract load(companyId: string): Promise<SubAccountFollows>;

  /**
   * Écrit les périodes de l'agrégat : les nouvelles s'ajoutent, les fermées
   * prennent leur fin. Rien ne s'efface.
   */
  abstract save(follows: SubAccountFollows): Promise<void>;
}
