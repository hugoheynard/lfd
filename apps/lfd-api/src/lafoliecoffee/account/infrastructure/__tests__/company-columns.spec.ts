import { changedColumns, type CompanyColumns } from "../company-columns.js";

/** Une ligne de société, telle que `save()` l'écrirait. */
function columns(over: Partial<CompanyColumns> = {}): CompanyColumns {
  return {
    enseigne: "Le Comptoir",
    raisonSociale: "Café de Test SAS",
    formeJuridique: "SAS",
    siret: "12345678900011",
    siren: "123456789",
    vatNumber: "",
    contactPrenom: "Camille",
    contactNom: "Durand",
    contactFonction: "",
    contactEmail: "camille@test.fr",
    contactTelephone: "",
    grantedTerms: ["monthly"],
    requestedTerm: null,
    activatedAt: new Date("2026-09-01T08:00:00.000Z"),
    activatedByStaffId: null,
    activatedByName: null,
    activatedByRole: null,
    suspensionCause: null,
    nafCode: "",
    preferredFulfillmentMethod: null,
    preferredPickupAddressId: null,
    preferredDeliveryAddressId: null,
    deliverySignatureRequired: false,
    kbisStorageKey: null,
    kbisFileName: null,
    kbisContentType: null,
    kbisSize: null,
    kbisUploadedAt: null,
    kbisCertifiedAt: null,
    kbisCertifiedByStaffId: null,
    kbisCertifiedByName: null,
    kbisCertifiedByRole: null,
    directDebitBlockedAt: null,
    directDebitBlockedBy: null,
    directDebitBlockReason: null,
    ...over,
  };
}

describe("changedColumns", () => {
  it("ne rend rien quand rien n'a bougé, dates et listes comprises", () => {
    expect(changedColumns(columns(), columns())).toEqual({});
  });

  it("ne rend que la colonne touchée", () => {
    expect(changedColumns(columns(), columns({ nafCode: "56.10A" }))).toEqual({
      nafCode: "56.10A",
    });
  });

  it("voit une liste changée, et une date déplacée", () => {
    const later = new Date("2026-09-02T08:00:00.000Z");
    expect(changedColumns(columns(), columns({ grantedTerms: [], activatedAt: later }))).toEqual({
      grantedTerms: [],
      activatedAt: later,
    });
  });

  it("rend une remise à `null`, qui est une écriture", () => {
    expect(changedColumns(columns(), columns({ activatedAt: null }))).toEqual({
      activatedAt: null,
    });
  });
});
