import { InvalidPersonNameError } from "../../errors/account-errors.js";
import { UserProfile, type UserProfileInput } from "../user-profile.js";

/** L'adresse enregistrée, contre laquelle tout profil se révise. */
const STORED_EMAIL = "camille@pqmarais.fr";

const input: UserProfileInput = {
  firstName: "Camille",
  lastName: "Rousseau",
  email: "camille@pqmarais.fr",
  phone: "01 42 71 08 44",
};

describe("UserProfile", () => {
  it("normalise et compose le nom d'usage", () => {
    const profile = UserProfile.revise(STORED_EMAIL, { ...input, firstName: "  Camille  " });

    expect(profile.fullName()).toBe("Camille Rousseau");
  });

  it("exige un prénom et un nom, en disant lequel manque", () => {
    expect(() => UserProfile.revise(STORED_EMAIL, { ...input, firstName: " " })).toThrow(/Prénom/u);
    expect(() => UserProfile.revise(STORED_EMAIL, { ...input, lastName: "" })).toThrow(
      InvalidPersonNameError,
    );
  });

  it("accepte les noms propres tels qu'ils s'écrivent", () => {
    // Restreindre le charset écarterait de vraies personnes.
    for (const lastName of ["d'Artagnan", "Le Goff", "Ngô Thị", "Müller-Schmidt"]) {
      expect(UserProfile.revise(STORED_EMAIL, { ...input, lastName }).lastName.value).toBe(
        lastName,
      );
    }
  });

  it("accepte un téléphone vide", () => {
    expect(UserProfile.revise(STORED_EMAIL, { ...input, phone: "" }).phone.isEmpty).toBe(true);
  });

  it("ne voit pas de changement d'e-mail sur un simple écart de casse", () => {
    // Ce qui décide d'appeler Auth0 : une re-vérification d'adresse déclenchée
    // par une majuscule serait absurde pour l'utilisateur.
    const profile = UserProfile.revise(STORED_EMAIL, { ...input, email: "Camille@PQMarais.fr" });

    expect(profile.emailChanged).toBe(false);
    expect(UserProfile.revise("autre@pqmarais.fr", input).emailChanged).toBe(true);
  });

  /**
   * Régression : une adresse vérifiée le restait après avoir été remplacée,
   * faute pour le profil de savoir qu'il la remplaçait (2026-09-14).
   */
  it("sait qu'il remplace l'adresse enregistrée, pour que la preuve retombe", () => {
    const profile = UserProfile.revise(STORED_EMAIL, { ...input, email: "camille@nouvelle.fr" });

    expect(profile.emailChanged).toBe(true);
  });
});

describe("UserProfile.changedFieldsSince — ce que le journal en garde", () => {
  const RECORDED: UserProfileInput = {
    firstName: "Camille",
    lastName: "Rousseau",
    email: "camille@ancienne.fr",
    phone: "",
  };

  it("nomme les champs changés, jamais leurs valeurs", () => {
    const profile = UserProfile.revise(RECORDED.email, {
      ...RECORDED,
      email: "camille@nouvelle.fr",
      phone: "0612345678",
    });

    const fields = profile.changedFieldsSince(RECORDED);

    expect(fields).toEqual(["email", "phone"]);
    expect(JSON.stringify(fields)).not.toContain("nouvelle");
  });

  it("une casse différente n'est pas une autre adresse", () => {
    const profile = UserProfile.revise(RECORDED.email, {
      ...RECORDED,
      email: "CAMILLE@ancienne.fr",
    });

    expect(profile.changedFieldsSince(RECORDED)).toEqual([]);
  });
});
