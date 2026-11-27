import { billedCustomerOf } from "../order-sheet-customer.js";

const OWN = { raisonSociale: "SARL Trois Ponts", enseigne: "Hôtel des Trois Ponts" };

function row(over: Partial<Parameters<typeof billedCustomerOf>[0]> = {}) {
  return {
    companyId: "co_1",
    billedCompanyId: null,
    billedCompany: null,
    company: OWN,
    ...over,
  };
}

describe("billedCustomerOf — le client que le bon du client et le BL nomment", () => {
  it("une société qui paie seule : l'enseigne en tête, sa raison sociale dessous", () => {
    expect(billedCustomerOf(row())).toEqual({
      tradeName: "Hôtel des Trois Ponts",
      legalName: "SARL Trois Ponts",
    });
  });

  it("payée par elle-même sous son propre identifiant : même client", () => {
    expect(billedCustomerOf(row({ billedCompanyId: "co_1", billedCompany: OWN }))).toEqual({
      tradeName: "Hôtel des Trois Ponts",
      legalName: "SARL Trois Ponts",
    });
  });

  it.each(["", "   "])("une enseigne vide (%j) : la raison sociale aux deux places", (enseigne) => {
    const customer = billedCustomerOf(row({ company: { ...OWN, enseigne } }));
    expect(customer).toEqual({ tradeName: "SARL Trois Ponts", legalName: "SARL Trois Ponts" });
  });

  it("une enseigne égale à la raison sociale : les deux champs égaux", () => {
    const customer = billedCustomerOf(row({ company: { ...OWN, enseigne: OWN.raisonSociale } }));
    expect(customer?.tradeName).toBe(customer?.legalName);
  });

  it("le public, sans société : rien, la feuille nomme la personne", () => {
    expect(billedCustomerOf(row({ companyId: null, company: null }))).toBeNull();
  });

  it("une société sans raison sociale : rien, la feuille garde son repli", () => {
    expect(billedCustomerOf(row({ company: { ...OWN, raisonSociale: "" } }))).toBeNull();
  });

  it("facturée à une autre société : le nom du site, la raison sociale du payeur", () => {
    const customer = billedCustomerOf(
      row({ billedCompanyId: "co_principal", billedCompany: { raisonSociale: "SAS Principal" } }),
    );
    expect(customer).toEqual({ tradeName: "Hôtel des Trois Ponts", legalName: "SAS Principal" });
  });
});
