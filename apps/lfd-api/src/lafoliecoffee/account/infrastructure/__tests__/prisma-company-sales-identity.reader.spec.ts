import { companySalesIdentityOf } from "../prisma-company-sales-identity.reader.js";

describe("companySalesIdentityOf — la société d'une vente pro", () => {
  it("nomme la société par son enseigne et rend son code NAF", () => {
    expect(
      companySalesIdentityOf({
        id: "c1",
        enseigne: "Le Chalet",
        raisonSociale: "SAS Altitude",
        nafCode: "5510Z",
      }),
    ).toEqual({ companyId: "c1", name: "Le Chalet", nafCode: "5510Z" });
  });

  it("replie sur la raison sociale, et un NAF non renseigné est absent", () => {
    expect(
      companySalesIdentityOf({
        id: "c2",
        enseigne: "",
        raisonSociale: "SAS Altitude",
        nafCode: "",
      }),
    ).toEqual({ companyId: "c2", name: "SAS Altitude", nafCode: null });
  });
});
