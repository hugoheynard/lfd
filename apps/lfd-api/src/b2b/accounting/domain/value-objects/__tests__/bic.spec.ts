import { Bic, BIC_FULL_LENGTH } from "../bic.js";
import { InvalidBicError } from "../../errors/accounting-errors.js";

/**
 * Le BIC n'a **aucune clé de contrôle** : seule sa grammaire se vérifie. Ces
 * tests décrivent donc ce que la forme permet d'attraper, et ce qu'elle laisse
 * passer — la seconde partie compte autant que la première.
 */
describe("Bic", () => {
  it("accepte un BIC de siège à 8 caractères et le complète en XXX", () => {
    expect(Bic.create("CEPAFRPP").value).toBe("CEPAFRPPXXX");
  });

  it("accepte un BIC d'agence à 11 caractères, tel quel", () => {
    expect(Bic.create("CEPAFRPP751").value).toBe("CEPAFRPP751");
  });

  /**
   * Régression de conception : « CEPAFRPP » et « CEPAFRPPXXX » désignent le même
   * établissement. Les garder distincts ferait deux valeurs pour une banque,
   * donc deux lignes différentes dans un fichier que la banque compare.
   */
  it("rend la MÊME valeur pour les deux écritures du même siège", () => {
    expect(Bic.create("CEPAFRPP").value).toBe(Bic.create("CEPAFRPPXXX").value);
  });

  it("normalise la casse et les espaces d'un copier-coller de RIB", () => {
    expect(Bic.create("  cepa fr pp 751 ").value).toBe("CEPAFRPP751");
  });

  it.each(["CEPAFRP", "CEPAFRPP7", "CEPAFRPP7512"])("refuse la longueur de %s", (raw) => {
    expect(() => Bic.create(raw)).toThrow(InvalidBicError);
  });

  it("refuse un chiffre dans le code d'établissement — 4 lettres, pas 4 caractères", () => {
    expect(() => Bic.create("CEP4FRPP")).toThrow(/établissement/u);
  });

  it("refuse un chiffre dans le code PAYS", () => {
    expect(() => Bic.create("CEPAF1PP")).toThrow(InvalidBicError);
  });

  it("admet en revanche des chiffres dans la localité et l'agence", () => {
    expect(Bic.create("CEPAFR21751").value).toBe("CEPAFR21751");
  });

  it("rend le pays, pour qu'un BIC étranger se remarque", () => {
    expect(Bic.create("DEUTDEFF500").countryCode()).toBe("DE");
  });

  it("dit s'il désigne le siège ou une agence", () => {
    expect(Bic.create("CEPAFRPP").isHeadOffice()).toBe(true);
    expect(Bic.create("CEPAFRPP751").isHeadOffice()).toBe(false);
  });

  /**
   * ⚠️ Ce que la forme NE protège PAS : « CEPBFRPP » est grammaticalement
   * parfait et ne désigne peut-être aucune banque. Aucune validation locale ne
   * peut le dire — c'est pour ça que le BIC se saisit une fois, à la lecture
   * d'un RIB, et pas à chaque opération.
   */
  it("accepte un BIC bien formé qui n'existe peut-être pas — limite assumée", () => {
    expect(Bic.create("ZZZZFRPP").value).toHaveLength(BIC_FULL_LENGTH);
  });
});
