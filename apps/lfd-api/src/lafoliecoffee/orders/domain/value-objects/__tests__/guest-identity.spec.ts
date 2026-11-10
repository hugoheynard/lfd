import { InvalidPhoneError } from "../../../../account/domain/errors/account-errors.js";
import { GuestIdentity } from "../guest-identity.js";

/** Une identité publique complète — la forme que la boutique envoie. */
const CAMILLE = {
  firstName: "Camille",
  email: "camille@exemple.fr",
  phone: "06 00 00 00 00",
};

describe("GuestIdentity — ce qu'elle garantit", () => {
  it("déclare une identité à partir des trois champs", () => {
    const declared = GuestIdentity.declare(CAMILLE).forRegistration();

    expect(declared.firstName).toBe("Camille");
    expect(declared.email).toBe("camille@exemple.fr");
    expect(declared.phone).toBe("06 00 00 00 00");
  });

  /**
   * L'adresse part en base **normalisée** : deux graphies d'une même boîte ne
   * doivent pas donner deux façons d'écrire à la même personne. C'est aussi ce
   * qui fait marcher la réutilisation d'un invité (D8), qui compare des formes
   * normalisées.
   */
  it("normalise l'adresse avant d'en faire une clé", () => {
    const declared = GuestIdentity.declare({
      ...CAMILLE,
      email: "  Camille@Exemple.FR ",
    }).forRegistration();

    expect(declared.email).toBe("camille@exemple.fr");
  });
});

describe("GuestIdentity — le téléphone est obligatoire (D9)", () => {
  /**
   * 🔴 **Le cas qui justifie que le refus vive dans le DOMAINE.** `PhoneNumber`
   * admet le vide — il rend `empty()` sans lever, parce qu'il sert aussi des
   * personnes dont on n'a légitimement pas le numéro. Le schéma Zod refuse déjà
   * côté HTTP, mais tous les appelants n'entrent pas par là : un semis, un test,
   * un import futur. Sans ce refus-ci, ils fabriqueraient une commande publique
   * qu'on ne saurait rattraper.
   */
  it("REFUSE une identité sans téléphone", () => {
    expect(() => GuestIdentity.declare({ ...CAMILLE, phone: "" })).toThrow(InvalidPhoneError);
  });

  it("REFUSE un téléphone fait de blancs", () => {
    expect(() => GuestIdentity.declare({ ...CAMILLE, phone: "   " })).toThrow(InvalidPhoneError);
  });

  it("REFUSE ce qui ne ressemble pas à un numéro", () => {
    expect(() => GuestIdentity.declare({ ...CAMILLE, phone: "rappelez-moi" })).toThrow(
      InvalidPhoneError,
    );
  });

  it("REFUSE un numéro trop court pour qu'on rappelle quelqu'un", () => {
    expect(() => GuestIdentity.declare({ ...CAMILLE, phone: "06" })).toThrow(InvalidPhoneError);
  });
});

describe("GuestIdentity — les autres refus", () => {
  it("REFUSE une adresse qui n'en est pas une", () => {
    expect(() => GuestIdentity.declare({ ...CAMILLE, email: "camille" })).toThrow();
  });

  it("REFUSE un prénom vide", () => {
    expect(() => GuestIdentity.declare({ ...CAMILLE, firstName: "  " })).toThrow();
  });

  /**
   * ⚠️ Ce value object garantit la FORME, jamais que l'adresse appartienne à
   * qui la tape — c'est assumé, et ce qui en découle vit ailleurs : la personne
   * n'aura aucune identité de connexion, donc rien de tapé au panier ne donne
   * accès à quoi que ce soit.
   */
  it("accepte l'adresse de n'importe qui : ce n'est PAS une preuve d'identité", () => {
    expect(() =>
      GuestIdentity.declare({ ...CAMILLE, email: "le.patron@concurrent.fr" }),
    ).not.toThrow();
  });
});
