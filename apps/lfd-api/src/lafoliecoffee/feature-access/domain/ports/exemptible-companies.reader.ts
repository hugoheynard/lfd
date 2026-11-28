import type { ExemptibleCompanyView } from "@lfd/contracts";

/**
 * Port de **lecture staff** : les sociétés que l'écran propose d'exempter —
 * celles dont le compte n'est pas supprimé, nommées, triées par nom.
 */
export abstract class ExemptibleCompaniesReader {
  abstract list(): Promise<readonly ExemptibleCompanyView[]>;
}
