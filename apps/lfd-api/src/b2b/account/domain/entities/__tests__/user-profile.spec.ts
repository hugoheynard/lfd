import { InvalidPersonNameError } from "../../errors/account-errors.js";
import { UserProfile, type UserProfileInput } from "../user-profile.js";

const input: UserProfileInput = {
  firstName: "Camille",
  lastName: "Rousseau",
  email: "camille@pqmarais.fr",
  phone: "01 42 71 08 44",
};

describe("UserProfile", () => {
  it("normalise et compose le nom d'usage", () => {
    const profile = UserProfile.create({ ...input, firstName: "  Camille  " });

    expect(profile.fullName()).toBe("Camille Rousseau");
  });

  it("exige un prénom et un nom, en disant lequel manque", () => {
    expect(() => UserProfile.create({ ...input, firstName: " " })).toThrow(/Prénom/u);
    expect(() => UserProfile.create({ ...input, lastName: "" })).toThrow(InvalidPersonNameError);
  });

  it("accepte les noms propres tels qu'ils s'écrivent", () => {
    // Restreindre le charset écarterait de vraies personnes.
    for (const lastName of ["d'Artagnan", "Le Goff", "Ngô Thị", "Müller-Schmidt"]) {
      expect(UserProfile.create({ ...input, lastName }).lastName.value).toBe(lastName);
    }
  });

  it("accepte un téléphone vide", () => {
    expect(UserProfile.create({ ...input, phone: "" }).phone.isEmpty).toBe(true);
  });

  it("ne voit pas de changement d'e-mail sur un simple écart de casse", () => {
    // Ce qui décide d'appeler Auth0 : une re-vérification d'adresse déclenchée
    // par une majuscule serait absurde pour l'utilisateur.
    const profile = UserProfile.create({ ...input, email: "Camille@PQMarais.fr" });

    expect(profile.emailDiffersFrom("camille@pqmarais.fr")).toBe(false);
    expect(profile.emailDiffersFrom("autre@pqmarais.fr")).toBe(true);
  });
});
