import { sirenOfSiret } from "../debtor-snapshot.js";

describe("sirenOfSiret — le SIREN imprimé sur le mandat interentreprises", () => {
  it("prend les neuf premiers chiffres d'un SIRET de quatorze", () => {
    expect(sirenOfSiret("81245678900017")).toBe("812456789");
  });

  it("ignore les blancs d'une saisie groupée", () => {
    expect(sirenOfSiret("812 456 789 00017")).toBe("812456789");
  });

  /** Décision Q3 : pas de SIRET, peigne vide — la frappe reste possible. */
  it("rend vide quand la société n'a pas de SIRET", () => {
    expect(sirenOfSiret("")).toBe("");
  });

  /**
   * Neuf caractères pris sur une valeur abîmée imprimeraient un SIREN faux sur
   * un papier signé : un SIRET ancien n'a pas forcément été revalidé.
   */
  it.each(["8124567890001", "812456789000170", "81245678900A17"])(
    "rend vide pour « %s », qui n'a pas la forme d'un SIRET",
    (siret) => {
      expect(sirenOfSiret(siret)).toBe("");
    },
  );
});
