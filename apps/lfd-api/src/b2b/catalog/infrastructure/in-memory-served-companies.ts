import type { StandingCompanyStatus } from "../../shared/company-standing/domain/company-standing.js";
import { ServedCompanyReader, type ServedCompany } from "../domain/ports/served-company.reader.js";

/**
 * **Les sociétés servies en mémoire**, pour les suites d'application : une
 * société sans statut déclaré est `active`, sans principal actif. Un double,
 * pas une source — la source est `PrismaServedCompanyReader`.
 */
export class InMemoryServedCompanies extends ServedCompanyReader {
  readonly asked: string[] = [];

  constructor(
    private readonly statuses: ReadonlyMap<string, StandingCompanyStatus> = new Map(),
    private readonly activePrincipals: ReadonlyMap<string, string> = new Map(),
  ) {
    super();
  }

  servedOf(companyId: string): Promise<ServedCompany | null> {
    this.asked.push(companyId);
    return Promise.resolve({
      status: this.statuses.get(companyId) ?? "active",
      holders: { companyId, activePrincipalId: this.activePrincipals.get(companyId) ?? null },
    });
  }
}
