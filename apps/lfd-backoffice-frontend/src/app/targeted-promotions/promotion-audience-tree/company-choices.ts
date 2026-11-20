import type { FoldSelectOption } from 'fold-ng';

import type { AdminCompany } from '../../comptes-clients/admin-company';
import { matchesCompanySearch } from '../../comptes-clients/company-search';

/** Le menu des sociétés : ses options, et le filtre qui les retrouve. */
export interface CompanyChoices {
  readonly options: readonly FoldSelectOption<string>[];
  readonly filter: (option: FoldSelectOption<string>, term: string) => boolean;
  /** Le nom d'une société de la liste, ou `null` si elle n'y est pas. */
  readonly labelOf: (companyId: string) => string | null;
  /** Les sites d'une société (ses sous-comptes), nommés et triés. */
  readonly sitesOf: (companyId: string) => readonly string[];
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
  const labels = new Map(options.map((option) => [option.value, option.label]));
  return {
    options,
    labelOf: (companyId) => labels.get(companyId) ?? null,
    sitesOf: (companyId) =>
      options
        .filter((option) => byId.get(option.value)?.parent?.id === companyId)
        .map((option) => option.label),
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
