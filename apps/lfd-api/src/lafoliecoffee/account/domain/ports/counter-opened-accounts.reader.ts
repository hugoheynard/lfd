/**
 * Un compte ouvert au comptoir, tel que sa page le montre — la société et sa
 * trace d'ouverture, sans ce qu'il doit (les commandes le disent).
 */
export interface CounterOpenedAccountRecord {
  readonly companyId: string;
  readonly reference: string;
  readonly enseigne: string;
  readonly contact: {
    readonly firstName: string;
    readonly lastName: string;
    readonly email: string;
    readonly phone: string;
  };
  readonly openedAt: Date;
  readonly openedByStaffId: string | null;
  readonly openedByName: string | null;
  /** La case « pièce vue », ou `null` sans trace. */
  readonly identityCheck: {
    readonly seen: boolean;
    readonly byStaffId: string;
    readonly at: Date;
  } | null;
}

/**
 * **La liste des comptes du comptoir** (`plan-comptes-du-comptoir.md`, § 4) —
 * lecture seule (ISP : ni `CompanyRepository`, ni `AdminCompanyReader`).
 * Les sociétés `counter_opened` non supprimées, les plus anciennes d'abord :
 * ce sont elles qui attendent le plus. Cross-tenant, gardée en amont par
 * l'authentification staff.
 */
export abstract class CounterOpenedAccountsReader {
  abstract listOpened(): Promise<readonly CounterOpenedAccountRecord[]>;
}
