import { InvalidEmailError, InvalidPhoneError } from "../../errors/account-errors.js";
import { ParticularSearchTooShortError } from "../../errors/particular-errors.js";
import { ParticularIdentity } from "../particular-identity.js";
import { ParticularSearchTerm } from "../particular-search-term.js";

describe("l'identité d'un particulier inscrit au comptoir", () => {
  it("normalise l'adresse et calcule la clé du téléphone", () => {
    const identity = ParticularIdentity.declare({
      firstName: " Jean ",
      email: " Jean.Dupont@Gmail.com ",
      phone: "+33 6 12 34 56 78",
    });
    expect(identity.email.value).toBe("jean.dupont@gmail.com");
    expect(identity.firstName.value).toBe("Jean");
    expect(identity.phone.value).toBe("+33 6 12 34 56 78");
    expect(identity.phoneKey).toBe("0612345678");
  });

  it("refuse un téléphone vide, que `PhoneNumber` admettrait", () => {
    expect(() =>
      ParticularIdentity.declare({ firstName: "Jean", email: "j@x.fr", phone: "  " }),
    ).toThrow(InvalidPhoneError);
  });

  it("refuse une adresse qui n'en est pas une", () => {
    expect(() =>
      ParticularIdentity.declare({ firstName: "Jean", email: "jean", phone: "0612345678" }),
    ).toThrow(InvalidEmailError);
  });
});

describe("la saisie de recherche d'un particulier", () => {
  it("refuse moins de deux caractères utiles", () => {
    expect(() => ParticularSearchTerm.create(" j ")).toThrow(ParticularSearchTooShortError);
  });

  it("lit une saisie en forme de numéro comme un téléphone", () => {
    const term = ParticularSearchTerm.create("+33 6 12");
    expect(term.phoneKey).toBe("0612");
    expect(term.text).toBe("+33 6 12");
  });

  it("ne lit pas un prénom comme un téléphone", () => {
    const term = ParticularSearchTerm.create("Jean");
    expect(term.text).toBe("jean");
    expect(term.phoneKey).toBeNull();
  });
});
