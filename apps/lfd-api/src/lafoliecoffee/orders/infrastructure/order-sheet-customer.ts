import { companyDisplayName, type SheetCustomer } from "@lfd/contracts";

/**
 * Le client que le bon de commande du client (et le BL qui le reprend) nomme :
 * l'enseigne en tête, la raison sociale en mention légale.
 *
 * - un AUTRE a réglé (sous-comptes §2.3) : le nom du site, et la raison sociale
 *   du payeur copié ;
 * - la société paie elle-même : son nom affiché (`companyDisplayName`, qui se
 *   replie sur la raison sociale quand l'enseigne est vide — jamais une tête
 *   vide) et sa raison sociale ; égales, le rendu n'imprime qu'une ligne ;
 * - sans société, ou sans raison sociale : `null`, et la feuille nomme le
 *   client par `customerLabel`.
 */
export function billedCustomerOf(row: {
  readonly companyId: string | null;
  readonly billedCompanyId: string | null;
  readonly billedCompany: { readonly raisonSociale: string } | null;
  readonly company: { readonly raisonSociale: string; readonly enseigne: string } | null;
}): SheetCustomer | null {
  if (row.company === null) {
    return null;
  }
  const tradeName = companyDisplayName(row.company);
  if (
    row.billedCompanyId !== null &&
    row.billedCompanyId !== row.companyId &&
    row.billedCompany !== null
  ) {
    return { tradeName, legalName: row.billedCompany.raisonSociale };
  }
  if (row.company.raisonSociale === "") {
    return null;
  }
  return { tradeName, legalName: row.company.raisonSociale };
}
