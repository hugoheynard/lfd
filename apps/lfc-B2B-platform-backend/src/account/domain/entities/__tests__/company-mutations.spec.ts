import { InvalidCompanyIdentityError } from "../../errors/account-errors.js";
import { ContactDetails } from "../../value-objects/contact-details.js";
import { Company } from "../company.js";

const CONTACT = {
  firstName: "Camille",
  lastName: "Rousseau",
  fonction: "Gérante",
  email: "camille@pqmarais.fr",
  phone: "",
};

function reconstituted(): Company {
  return Company.reconstitute({
    id: "c1",
    raisonSociale: "PQ Marais",
    enseigne: "Marais Café",
    formeJuridique: "SAS",
    siret: "81245678900021",
    tvaIntracom: "FR12345678901",
    contact: ContactDetails.create(CONTACT),
  });
}

describe("Company — reconstitution + mutations souples", () => {
  it("reconstitue une société avec son id et sérialise ses champs mutables", () => {
    const state = reconstituted().toPersistence();
    expect(state.enseigne).toBe("Marais Café");
    expect(state.tvaIntracom).toBe("FR12345678901");
    expect(state.contact).toEqual({
      firstName: "Camille",
      lastName: "Rousseau",
      fonction: "Gérante",
      email: "camille@pqmarais.fr",
      phone: "",
    });
  });

  it("editSoftIdentity normalise (espaces réduits) enseigne et TVA", () => {
    const company = reconstituted();
    company.editSoftIdentity({ enseigne: "  Nouvelle   Enseigne  ", tvaIntracom: " FR99 " });
    const state = company.toPersistence();
    expect(state.enseigne).toBe("Nouvelle Enseigne");
    expect(state.tvaIntracom).toBe("FR99");
    expect(company.displayName()).toBe("Nouvelle Enseigne");
  });

  it("editSoftIdentity accepte le vide (enseigne effacée → displayName retombe sur la raison sociale)", () => {
    const company = reconstituted();
    company.editSoftIdentity({ enseigne: "", tvaIntracom: "" });
    expect(company.toPersistence().enseigne).toBe("");
    expect(company.displayName()).toBe("PQ Marais");
  });

  it("editSoftIdentity refuse une enseigne trop longue", () => {
    const company = reconstituted();
    expect(() => company.editSoftIdentity({ enseigne: "x".repeat(200), tvaIntracom: "" })).toThrow(
      InvalidCompanyIdentityError,
    );
  });

  it("changePrimaryContact remplace le contact et le sérialise", () => {
    const company = reconstituted();
    company.changePrimaryContact(
      ContactDetails.create({ ...CONTACT, firstName: "Léa", email: "lea@pqmarais.fr" }),
    );
    expect(company.toPersistence().contact).toMatchObject({
      firstName: "Léa",
      email: "lea@pqmarais.fr",
    });
  });

  it("une société déclarée n'a pas encore d'id (l'attribuera la base)", () => {
    const company = Company.declare(
      {
        raisonSociale: "Neuve",
        enseigne: "",
        formeJuridique: "SARL",
        siret: "81245678900021",
        tvaIntracom: "",
      },
      ContactDetails.create(CONTACT),
    );
    expect(company.id).toBeNull();
  });
});
