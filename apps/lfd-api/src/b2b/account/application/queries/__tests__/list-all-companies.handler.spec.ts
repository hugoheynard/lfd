import {
  AdminCompanyReader,
  type AdminCompanyView,
} from "../../../domain/ports/admin-company.reader.js";
import { ListAllCompaniesHandler } from "../list-all-companies.handler.js";

const view: AdminCompanyView = {
  requestedTerm: null,
  owner: null,
  warnings: [],
  id: "company_1",
  reference: "C-000123",
  raisonSociale: "Café des Amis",
  enseigne: "Chez Léa",
  formeJuridique: "SAS",
  siret: "12345678901234",
  tvaIntracom: "FR12345678901",
  status: "pending",
  grantedTerms: [],
  primaryContact: {
    role: null,
    id: null,
    firstName: "Léa",
    lastName: "Martin",
    fonction: "Gérante",
    email: "lea@cafedesamis.fr",
    phone: "0102030405",
  },
  kbis: null,
  hasOpenSupportRequest: false,
  createdAt: "2026-07-30T10:00:00.000Z",
};

describe("ListAllCompaniesHandler", () => {
  it("renvoie la liste cross-tenant fournie par le AdminCompanyReader", async () => {
    // Le handler admin ne rejoue aucune règle : il délègue au port de lecture.
    // Prouver la délégation = prouver que sa sortie EST celle du reader.
    const reader: AdminCompanyReader = {
      listAll: () => Promise.resolve([view]),
      byId: () => Promise.resolve(null),
    };
    const handler = new ListAllCompaniesHandler(reader);

    await expect(handler.execute()).resolves.toEqual([view]);
  });
});
