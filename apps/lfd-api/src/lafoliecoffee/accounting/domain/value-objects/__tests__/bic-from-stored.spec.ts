import { InvalidBicError } from "../../errors/accounting-errors.js";
import { Bic } from "../bic.js";

describe("Bic.fromStored — relire un BIC rangé en base", () => {
  it("la chaîne vide est l'absence : null, jamais un BIC vide", () => {
    expect(Bic.fromStored("")).toBeNull();
  });

  it("une valeur rangée repasse par create : normalisée à 11", () => {
    expect(Bic.fromStored("BNPAFRPP")?.value).toBe("BNPAFRPPXXX");
    expect(Bic.fromStored("CEPAFRPP751")?.value).toBe("CEPAFRPP751");
  });

  it("une valeur rangée qui n'est pas un BIC est refusée, pas promenée", () => {
    expect(() => Bic.fromStored("BNP")).toThrow(InvalidBicError);
  });
});
