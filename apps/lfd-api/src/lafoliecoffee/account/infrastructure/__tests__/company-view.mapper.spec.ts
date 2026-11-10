import { toCompanyView, type CompanyViewRow } from "../company-view.mapper.js";

/** L'instant du dépôt n'est comparé à aucune horloge : il est seulement recopié. */
const UPLOADED = new Date(0);

const ROW: CompanyViewRow = {
  id: "c_site",
  reference: "C-000001",
  raisonSociale: "Les Halles SAS",
  enseigne: "Les Halles",
  formeJuridique: "SAS",
  siret: "73282932000074",
  siren: "732829320",
  vatNumber: "FR44732829320",
  status: "active",
  grantedTerms: ["monthly"],
  requestedTerm: null,
  directDebitBlockedAt: null,
  preferredFulfillmentMethod: null,
  preferredPickupAddressId: null,
  preferredDeliveryAddressId: null,
  deliverySignatureRequired: false,
  kbisFileName: null,
  kbisUploadedAt: null,
  kbisCertifiedAt: null,
  contactPrenom: "Camille",
  contactNom: "Rousseau",
  contactFonction: "Gérante",
  contactEmail: "camille@halles.fr",
  contactTelephone: "01 42 71 08 44",
  contacts: [
    {
      id: "k1",
      prenom: "Lou",
      nom: "Martin",
      fonction: "Cheffe",
      email: "lou@halles.fr",
      telephone: "06",
      role: "orders",
    },
  ],
};

describe("toCompanyView", () => {
  it("porte le rôle que l'appelant a établi — le rôle effectif d'un site atteint", () => {
    expect(toCompanyView("admin", ROW).role).toBe("admin");
    expect(toCompanyView("owner", ROW).role).toBe("owner");
  });

  it("aplatit le contact principal, rôle constaté donc null, et renomme les additionnels", () => {
    const view = toCompanyView("owner", ROW);
    expect(view.primaryContact).toEqual({
      id: null,
      role: null,
      firstName: "Camille",
      lastName: "Rousseau",
      fonction: "Gérante",
      email: "camille@halles.fr",
      phone: "01 42 71 08 44",
    });
    expect(view.contacts).toEqual([
      {
        id: "k1",
        firstName: "Lou",
        lastName: "Martin",
        fonction: "Cheffe",
        email: "lou@halles.fr",
        phone: "06",
        role: "orders",
      },
    ]);
  });

  it("dérive prélèvement suspendu, TVA exigée et préférence d'acheminement", () => {
    const view = toCompanyView("owner", { ...ROW, directDebitBlockedAt: UPLOADED });
    expect(view.directDebitBlocked).toBe(true);
    expect(view.vatNumberRequired).toBe(true);
    expect(view.fulfillmentPreference).toEqual({
      method: null,
      pickupAddressId: null,
      deliveryAddressId: null,
      signatureRequired: false,
    });
  });

  it("KBIS : absent sans fichier, certifié seulement si validé", () => {
    expect(toCompanyView("owner", ROW).kbis).toBeNull();
    const deposited = { ...ROW, kbisFileName: "kbis.pdf", kbisUploadedAt: UPLOADED };
    expect(toCompanyView("owner", deposited).kbis).toEqual({
      fileName: "kbis.pdf",
      uploadedAt: UPLOADED.toISOString(),
      certified: false,
    });
    expect(
      toCompanyView("owner", { ...deposited, kbisCertifiedAt: UPLOADED }).kbis?.certified,
    ).toBe(true);
  });
});
