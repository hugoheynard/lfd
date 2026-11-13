import { CompanyChangeVersionReader } from "../../../domain/ports/company-change-version.reader.js";
import { COMPANIES_FRESH_MS, CompaniesVersionSource } from "../companies-version.source.js";

class FixedReader extends CompanyChangeVersionReader {
  versionOf(): Promise<number> {
    return Promise.resolve(17);
  }
}

describe("CompaniesVersionSource", () => {
  it("rend le numéro du journal des comptes clients, sous les droits des comptes, du comptoir et de la Supervision, à 30 s", async () => {
    const source = new CompaniesVersionSource(new FixedReader());

    await expect(source.versionOf()).resolves.toBe(17);
    expect(source.readers).toEqual([
      "b2b_companies:read",
      "handover_counter:read",
      "b2b_supervision:read",
    ]);
    expect(source.freshMs).toBe(COMPANIES_FRESH_MS);
  });
});
