import type { FoldSelectOption } from 'fold-ng';

import type { AdminCompany } from '../../comptes-clients/admin-company';
import { matchesCompanySearch } from '../../comptes-clients/company-search';

/** Le menu des sociétés : ses options, et le filtre qui les retrouve. */
export interface CompanyChoices {
  readonly options: readonly FoldSelectOption<string>[];
  readonly filter: (option: FoldSelectOption<string>, term: string) => boolean;
}

/**
 * Les sociétés à cibler, triées par nom. Le libellé est l'enseigne, sinon la
 * raison sociale, suivi de la référence : deux sociétés au même nom restent
 * distinctes à l'œil. Le filtre est la recherche des comptes clients
 * (enseigne, raison sociale, référence, SIRET, principal, propriétaire).
 */
export function companyChoicesOf(companies: readonly AdminCompany[]): CompanyChoices {
  const byId = new Map(companies.map((company) => [company.id, company]));
  const options = companies
    .map((company) => ({ value: company.id, label: companyLabelOf(company) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  return {
    options,
    filter: (option, term) => {
      const company = byId.get(option.value);
      return company !== undefined && matchesCompanySearch(company, term);
    },
  };
}

function companyLabelOf(company: AdminCompany): string {
  const name = company.enseigne.trim() || company.raisonSociale.trim() || company.siret;
  return `${name} · ${company.reference}`;
}
