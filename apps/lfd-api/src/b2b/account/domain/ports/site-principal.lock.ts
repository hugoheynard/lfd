/** Le principal d'un site, lu sous le verrou de sa ligne. */
export interface LockedPrincipal {
  /** Son principal à cet instant, ou `null` : il n'est le sous-compte de personne. */
  readonly principalCompanyId: string | null;
}

/**
 * **Le principal d'un site, au moment d'un geste, sous verrou**
 * (`plan-notifications-sous-comptes.md`, N4 « La lecture du principal rejoint
 * la transaction »).
 *
 * Verrouille la ligne `companies` du site dans la transaction EN COURS, puis
 * lit son principal. Un rattachement écrit cette même ligne : il passe donc
 * entièrement avant ou entièrement après le geste, et le fait durable porte
 * le principal qui était vrai quand le geste a été validé.
 *
 * Port à part de `CompanyParentReader` (ISP) : celui-là lit sans verrou, pour
 * un réglage ; celui-ci n'a de sens que dans une unité de travail, et son
 * adaptateur le refuse ailleurs.
 */
export abstract class SitePrincipalLock {
  /**
   * `null` si la société n'existe pas.
   *
   * @throws {TechnicalError} appelé hors d'une unité de travail.
   */
  abstract lockedPrincipalOf(companyId: string): Promise<LockedPrincipal | null>;
}
