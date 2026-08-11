import {
  CompanyActivationBlockedError,
  InvalidCompanyIdentityError,
} from "../../errors/account-errors.js";
import type { CompanyStatus } from "../../value-objects/company-status.js";
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
    paymentTerm: "per_order",
    requestedPaymentTerm: null,
    status: "pending",
    activatedAt: null,
    nafCode: "",
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

  it("une société déclarée n'a pas encore d'id (l'attribuera la base) et sort en per_order", () => {
    const company = Company.declare(
      {
        raisonSociale: "Neuve",
        enseigne: "Le Pain Quotidien",
        formeJuridique: "SARL",
        siret: "81245678900021",
        tvaIntracom: "",
      },
      ContactDetails.create(CONTACT),
    );
    expect(company.id).toBeNull();
    expect(company.paymentTerm).toBe("per_order");
    expect(company.requestedPaymentTerm).toBeNull();
  });
});

describe("Company — termes de règlement", () => {
  it("le client demande un terme différent du convenu → demande en attente", () => {
    const company = reconstituted(); // convenu = per_order
    company.requestPaymentTerm("net60");
    expect(company.requestedPaymentTerm).toBe("net60");
    expect(company.paymentTerm).toBe("per_order"); // le client ne convient jamais
  });

  it("demander le terme déjà convenu retire la demande (rien en attente)", () => {
    const company = reconstituted();
    company.requestPaymentTerm("net60");
    company.requestPaymentTerm("per_order"); // = le convenu
    expect(company.requestedPaymentTerm).toBeNull();
  });

  it("`null` retire explicitement la demande en cours", () => {
    const company = reconstituted();
    company.requestPaymentTerm("net90");
    company.requestPaymentTerm(null);
    expect(company.requestedPaymentTerm).toBeNull();
  });

  it("le staff convient un terme : il s'applique ET solde la demande", () => {
    const company = reconstituted();
    company.requestPaymentTerm("net60");
    company.agreePaymentTerm("net60");
    const state = company.toPersistence();
    expect(state.paymentTerm).toBe("net60");
    expect(state.requestedPaymentTerm).toBeNull();
  });
});

describe("Company — activation", () => {
  function withStatus(status: CompanyStatus): Company {
    return Company.reconstitute({
      id: "c1",
      raisonSociale: "PQ Marais",
      enseigne: "Le Pain Quotidien",
      formeJuridique: "SAS",
      siret: "81245678900021",
      tvaIntracom: "",
      contact: ContactDetails.create(CONTACT),
      paymentTerm: "per_order",
      requestedPaymentTerm: null,
      status,
      activatedAt: null,
      nafCode: "",
    });
  }

  it("active une société pending : statut active + horodatage posé", () => {
    const company = withStatus("pending");
    const at = new Date("2026-08-07T09:00:00.000Z");
    company.activate(at, true);
    const state = company.toPersistence();
    expect(state.status).toBe("active");
    expect(state.activatedAt).toBe(at);
  });

  it("REFUSE d'activer quand personne n'est joignable", () => {
    // Un livreur qui cherche une porte doit pouvoir appeler quelqu'un ; un
    // compte actif sans aucun numéro, c'est une commande qui repart au dépôt.
    const company = withStatus("pending");

    expect(() => {
      company.activate(new Date("2026-08-07T09:00:00.000Z"), false);
    }).toThrow(CompanyActivationBlockedError);
    expect(company.toPersistence().status).toBe("pending");
  });

  it("refuse d'activer une société déjà active", () => {
    expect(() => withStatus("active").activate(new Date("2026-08-07T09:00:00.000Z"))).toThrow(
      CompanyActivationBlockedError,
    );
  });

  it("refuse d'activer une société suspendue ou clôturée", () => {
    const at = new Date("2026-08-07T09:00:00.000Z");
    expect(() => withStatus("suspended").activate(at)).toThrow(CompanyActivationBlockedError);
    expect(() => withStatus("terminated").activate(at)).toThrow(CompanyActivationBlockedError);
  });
});
