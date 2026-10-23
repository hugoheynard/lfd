import { bankExportBicOf, NO_BIC_EXCLUSION } from "../bank-export-bic.js";

describe("bankExportBicOf — un compte sans BIC ne part pas à la banque", () => {
  it("sans BIC : écarté, motif no_bic", () => {
    expect(bankExportBicOf("")).toEqual({ bic: null, exclusion: NO_BIC_EXCLUSION });
  });

  it("avec BIC : exportable, sans motif", () => {
    const { bic, exclusion } = bankExportBicOf("CEPAFRPP751");
    expect(exclusion).toBeNull();
    expect(bic?.value).toBe("CEPAFRPP751");
  });
});
