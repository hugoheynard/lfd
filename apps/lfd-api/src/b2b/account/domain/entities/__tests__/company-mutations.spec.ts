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
    vatNumber: "FR12345678901",
    contact: ContactDetails.create(CONTACT),
    grantedTerms: [],
    requestedTerm: null,
    status: "pending",
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
  });
}

const AGENT = { sub: "auth0|staff", name: "Camille Rousseau", role: "commercial" };

describe("Company — reconstitution + mutations souples", () => {
  it("reconstitue une société avec son id et sérialise ses champs mutables", () => {
    const state = reconstituted().toPersistence();
    expect(state.enseigne).toBe("Marais Café");
    expect(state.vatNumber).toBe("FR12345678901");
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
    company.editSoftIdentity({ enseigne: "  Nouvelle   Enseigne  ", vatNumber: " FR99 " });
    const state = company.toPersistence();
    expect(state.enseigne).toBe("Nouvelle Enseigne");
    expect(state.vatNumber).toBe("FR99");
    expect(company.displayName()).toBe("Nouvelle Enseigne");
  });

  it("editSoftIdentity accepte le vide (enseigne effacée → displayName retombe sur la raison sociale)", () => {
    const company = reconstituted();
    company.editSoftIdentity({ enseigne: "", vatNumber: "" });
    expect(company.toPersistence().enseigne).toBe("");
    expect(company.displayName()).toBe("PQ Marais");
  });

  it("editSoftIdentity refuse une enseigne trop longue", () => {
    const company = reconstituted();
    expect(() => company.editSoftIdentity({ enseigne: "x".repeat(200), vatNumber: "" })).toThrow(
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

  it("une société déclarée n'a pas encore d'id (l'attribuera la base) ni aucun crédit", () => {
    const company = Company.declare(
      {
        raisonSociale: "Neuve",
        enseigne: "Le Pain Quotidien",
        formeJuridique: "SARL",
        siret: "81245678900021",
        vatNumber: "",
      },
      ContactDetails.create(CONTACT),
    );
    expect(company.id).toBeNull();
    // Aucun crédit accordé : elle paie à la commande, comme tout le monde.
    expect(company.grantedTerms).toEqual([]);
    expect(company.settlesOnAccount()).toBe(false);
    expect(company.requestedTerm).toBeNull();
  });
});

describe("Company — crédits de règlement", () => {
  it("le client DEMANDE un crédit, il ne se l'accorde pas", () => {
    const company = reconstituted(); // aucun crédit accordé

    company.requestTerm("monthly");

    expect(company.requestedTerm).toBe("monthly");
    expect(company.grantedTerms).toEqual([]);
  });

  it("demander un crédit DÉJÀ accordé retire la demande (rien en attente)", () => {
    const company = reconstituted();
    company.grantTerms(["monthly"]);

    company.requestTerm("monthly");

    expect(company.requestedTerm).toBeNull();
  });

  it("`null` retire explicitement la demande en cours", () => {
    const company = reconstituted();
    company.requestTerm("monthly");

    company.requestTerm(null);

    expect(company.requestedTerm).toBeNull();
  });

  it("les crédits sont CUMULATIFS, et payer à la commande reste possible", () => {
    // C'est tout l'intérêt : accorder le mensuel ajoute une possibilité, il
    // n'en retire aucune.
    const company = reconstituted();

    company.grantTerms(["monthly"]);

    expect(company.grantedTerms).toEqual(["monthly"]);
    expect(company.settlesOnAccount()).toBe(true);
  });

  it("accorder solde la demande en cours", () => {
    const company = reconstituted();
    company.requestTerm("monthly");

    company.grantTerms(["monthly"]);

    const state = company.toPersistence();
    expect(state.grantedTerms).toEqual(["monthly"]);
    expect(state.requestedTerm).toBeNull();
  });

  it("n'accorde jamais deux fois le même crédit", () => {
    const company = reconstituted();

    company.grantTerms(["monthly", "monthly"]);

    expect(company.grantedTerms).toEqual(["monthly"]);
  });

  it("retirer tous les crédits ramène au paiement à la commande", () => {
    const company = reconstituted();
    company.grantTerms(["monthly"]);

    company.grantTerms([]);

    expect(company.settlesOnAccount()).toBe(false);
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
      vatNumber: "",
      contact: ContactDetails.create(CONTACT),
      grantedTerms: [],
      requestedTerm: null,
      status,
      activatedAt: null,
      activatedBy: null,
      suspensionCause: null,
      nafCode: "",
    });
  }

  it("active une société pending : statut active + horodatage posé", () => {
    const company = withStatus("pending");
    const at = new Date("2026-08-07T09:00:00.000Z");
    company.activate(at, true, AGENT);
    const state = company.toPersistence();
    expect(state.status).toBe("active");
    expect(state.activatedAt).toBe(at);
  });

  it("REFUSE d'activer quand personne n'est joignable", () => {
    // Un livreur qui cherche une porte doit pouvoir appeler quelqu'un ; un
    // compte actif sans aucun numéro, c'est une commande qui repart au dépôt.
    const company = withStatus("pending");

    expect(() => {
      company.activate(new Date("2026-08-07T09:00:00.000Z"), false, AGENT);
    }).toThrow(CompanyActivationBlockedError);
    expect(company.toPersistence().status).toBe("pending");
  });

  it("refuse d'activer une société déjà active", () => {
    expect(() =>
      withStatus("active").activate(new Date("2026-08-07T09:00:00.000Z"), true, AGENT),
    ).toThrow(CompanyActivationBlockedError);
  });

  it("refuse d'activer une société suspendue ou clôturée", () => {
    const at = new Date("2026-08-07T09:00:00.000Z");
    expect(() => withStatus("suspended").activate(at, true, AGENT)).toThrow(
      CompanyActivationBlockedError,
    );
    expect(() => withStatus("terminated").activate(at, true, AGENT)).toThrow(
      CompanyActivationBlockedError,
    );
  });
  it("garde la cause, et l'efface à la réactivation", () => {
    // Un compte redevenu actif ne traîne pas le motif de la dernière coupure :
    // la prochaine reprise automatique s'appuierait sur une raison périmée.
    const company = withStatus("active");
    company.suspend("kbis_revoked");
    expect(company.suspensionCause).toBe("kbis_revoked");

    company.reactivate();
    expect(company.status).toBe("active");
    expect(company.suspensionCause).toBeNull();
  });

  it("distingue la décision humaine de la conséquence automatique", () => {
    const humaine = withStatus("active");
    humaine.suspend("staff");
    expect(humaine.suspensionCause).toBe("staff");
  });

  it("fige QUI a activé, à quel titre", () => {
    // Ouvrir la commande à un client est un engagement : il se signe. Le nom et
    // le titre sont un instantané, pas une jointure relue plus tard.
    const company = withStatus("pending");
    company.activate(new Date("2026-08-12T09:00:00.000Z"), true, AGENT);
    expect(company.toPersistence().activatedBy).toEqual(AGENT);
  });
});
