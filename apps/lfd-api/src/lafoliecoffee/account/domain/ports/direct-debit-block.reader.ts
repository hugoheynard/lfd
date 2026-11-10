/**
 * Une société au crédit mensuel et son éventuel blocage, telle que la base la
 * rend — l'auteur n'est encore qu'un id de fiche staff.
 */
export interface CreditedCompanyEntry {
  readonly companyId: string;
  readonly reference: string;
  readonly raisonSociale: string;
  readonly enseigne: string;
  /** `null` = au prélèvement. */
  readonly block: {
    readonly blockedAt: Date;
    readonly blockedByStaffId: string;
    readonly reason: string;
  } | null;
}

/**
 * Port de **lecture** des blocages du prélèvement (ISP : distinct de
 * `CompanyRepository`, qui écrit). Cross-tenant par nature : la page de la
 * comptabilité parcourt tout le portefeuille, gardée en amont par
 * `@AdminSurface("b2b_accounting")`.
 */
export abstract class DirectDebitBlockReader {
  /** Les sociétés à qui au moins un crédit est accordé, bloquées ou non. */
  abstract listCredited(): Promise<readonly CreditedCompanyEntry[]>;
}
