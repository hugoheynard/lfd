import { ArchivedCompaniesReader } from "../archived-companies.reader.js";

/**
 * Double de {@link ArchivedCompaniesReader} : un ensemble figé de comptes
 * supprimés, et les lots demandés, pour compter les allers-retours.
 */
export class FixedArchivedCompanies extends ArchivedCompaniesReader {
  readonly batches: string[][] = [];

  constructor(private readonly archived: readonly string[] = []) {
    super();
  }

  among(companyIds: readonly string[]): Promise<ReadonlySet<string>> {
    this.batches.push([...companyIds]);
    return Promise.resolve(new Set(companyIds.filter((id) => this.archived.includes(id))));
  }
}
