import { Company } from "../../domain/entities/company.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { NotASubAccountError } from "../../domain/errors/hierarchy-errors.js";
import { companyNamed, type NamedRef } from "../../domain/events/journal-names.js";
import type { CompanyRepository } from "../../domain/ports/company.repository.js";

/**
 * Les deux lectures que partagent les gestes de la hiérarchie des comptes
 * (plan `plan-sous-comptes.md`, lot S1). Toutes se font APRÈS la prise du
 * verrou `AccountHierarchyLock` : c'est ce qui rend leur résultat vrai au
 * moment où l'agrégat tranche.
 */

/** Une société enregistrée, avec son identifiant non nul. */
export interface LoadedCompany {
  readonly id: string;
  readonly company: Company;
}

/** @throws {CompanyNotFoundError} aucune société sous cet identifiant. */
export async function loadCompany(
  companies: CompanyRepository,
  companyId: string,
): Promise<LoadedCompany> {
  const company = await companies.load(companyId);
  if (company === null) {
    throw new CompanyNotFoundError(companyId);
  }
  return { id: companyId, company };
}

/**
 * Le principal d'un sous-compte, chargé.
 *
 * @throws {NotASubAccountError} la société n'a pas de principal.
 */
export async function loadParentOf(
  companies: CompanyRepository,
  child: LoadedCompany,
): Promise<LoadedCompany> {
  const parentId = child.company.parentCompanyId;
  if (parentId === null) {
    throw new NotASubAccountError(child.id);
  }
  return loadCompany(companies, parentId);
}

/** La société citée au journal, sous son nom du moment. */
export function named(loaded: LoadedCompany): NamedRef {
  return companyNamed(loaded.id, loaded.company);
}
