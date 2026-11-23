import { companyDisplayName } from "../company-display-name.js";

describe("companyDisplayName — l'enseigne, à défaut la raison sociale", () => {
  it("rend l'enseigne quand elle est renseignée", () => {
    expect(companyDisplayName({ enseigne: "Le Chalet", raisonSociale: "SAS Altitude" })).toBe(
      "Le Chalet",
    );
  });

  it("rend la raison sociale quand l'enseigne est vide", () => {
    expect(companyDisplayName({ enseigne: "", raisonSociale: "SAS Altitude" })).toBe(
      "SAS Altitude",
    );
  });
});
