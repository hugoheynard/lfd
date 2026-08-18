import { InvalidEmailError } from "../../errors/account-errors.js";
import { EmailAddress } from "../email-address.js";

describe("EmailAddress", () => {
  it("normalise la casse et les espaces", () => {
    // Sans cette normalisation, `Jean@X.fr` et `jean@x.fr` seraient deux comptes
    // pour une seule personne.
    expect(EmailAddress.create("  Camille.Rousseau@PQMarais.FR ").value).toBe(
      "camille.rousseau@pqmarais.fr",
    );
  });

  it("considère égales deux écritures de la même adresse", () => {
    expect(EmailAddress.create("A@b.fr").equals(EmailAddress.create("a@B.fr"))).toBe(true);
  });

  it("refuse les fautes de frappe manifestes", () => {
    for (const raw of ["camille", "camille@", "@pqmarais.fr", "camille@marais", "a b@c.fr"]) {
      expect(() => EmailAddress.create(raw)).toThrow(InvalidEmailError);
    }
  });

  it("accepte les adresses réelles biscornues", () => {
    // Le contrôle est délibérément permissif : rejeter ces adresses écarterait de
    // vraies personnes, et seule une vérification par e-mail prouve l'existence.
    for (const raw of [
      "jean+b2b@pqmarais.fr",
      "j.o'brien@sous-domaine.exemple.co.uk",
      "café@exemple.fr",
    ]) {
      expect(EmailAddress.create(raw).value).toBe(raw.toLowerCase());
    }
  });
});
