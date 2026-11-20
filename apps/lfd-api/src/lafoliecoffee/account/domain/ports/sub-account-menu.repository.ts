import type { SubAccountMenu } from "../entities/sub-account-menu.js";

/**
 * Port d'**écriture** de la carte d'un sous-compte : il prend et rend
 * l'agrégat {@link SubAccountMenu}, jamais une entrée isolée. La lecture de
 * la carte au service du rayon est ailleurs (`shared/company-standing`), dans
 * la requête du lecteur pro.
 */
export abstract class SubAccountMenuRepository {
  /** La carte de ce sous-compte, ou `null` s'il n'en a pas. */
  abstract load(companyId: string): Promise<SubAccountMenu | null>;

  /**
   * Écrit l'en-tête et ses entrées dans une transaction : les entrées
   * retirées par l'agrégat disparaissent avec lui, la carte elle-même jamais.
   */
  abstract save(menu: SubAccountMenu): Promise<void>;
}
