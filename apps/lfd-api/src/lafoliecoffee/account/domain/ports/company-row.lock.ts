/**
 * **La ligne d'une société, verrouillée pour un geste qui dépend de ce qui la
 * vise** — la suppression d'un compte, qui lit « a-t-il des commandes ? » puis
 * écrit.
 *
 * Verrouille la ligne `companies` dans la transaction EN COURS : une écriture
 * de la même ligne passe entièrement avant ou entièrement après le geste.
 * Port à part de `SitePrincipalLock` (ISP) : celui-là rend le principal d'un
 * site ; celui-ci ne rend que l'existence.
 */
export abstract class CompanyRowLock {
  /**
   * `false` si la société n'existe pas.
   *
   * @throws {TechnicalError} appelé hors d'une unité de travail.
   */
  abstract lock(companyId: string): Promise<boolean>;
}
