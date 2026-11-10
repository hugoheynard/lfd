/** Une société telle que l'essai et la déclaration la lisent. */
export interface EstablishmentCompany {
  readonly companyId: string;
  /** La raison sociale — ce qui s'imprime en `Dbtr/Nm`. */
  readonly name: string;
  /** `CompanyStatus` — `pending` | `active` | `suspended` | `terminated`. */
  readonly status: string;
  /** Déclarée, et pas retirée, parmi nos établissements. */
  readonly declared: boolean;
}

/**
 * Port de lecture d'UNE société pour le prélèvement d'essai et la page « Nos
 * établissements ». Même bloc `b2b` : la table `companies` se lit en lecture
 * seule, comme `CompanyLabelReader`.
 */
export abstract class EstablishmentCompaniesReader {
  /** `null` : aucune société ne porte cet identifiant. */
  abstract companyOf(companyId: string): Promise<EstablishmentCompany | null>;
}
