import {
  AdminCompanyReader,
  type AdminCompanyDetailView,
  type AdminCompanyView,
  type CompanyListScope,
} from "../../../domain/ports/admin-company.reader.js";
import { ListAllCompaniesHandler } from "../list-all-companies.handler.js";
import { ListAllCompaniesQuery } from "../list-all-companies.query.js";

const view: AdminCompanyView = {
  requestedTerm: null,
  directDebitBlocked: false,
  owner: null,
  warnings: [],
  id: "company_1",
  reference: "C-000123",
  raisonSociale: "Café des Amis",
  enseigne: "Chez Léa",
  formeJuridique: "SAS",
  siret: "12345678901234",
  siren: "",
  vatNumber: "FR32123456789",
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
  parent: null,
  // `pending` : le dossier est déposé, il n'a jamais été activé. `null` n'est
  // donc pas un remplissage — c'est ce que la fiche DIT, et la distinction avec
  // `createdAt` est celle qui date le chiffre d'affaires.
  activatedAt: null,
  createdAt: "2026-07-30T10:00:00.000Z",
  declaredVia: null,
  piecesReached: [],
  archivedAt: null,
};

describe("ListAllCompaniesHandler", () => {
  it("renvoie la liste cross-tenant fournie par le AdminCompanyReader, pour la portée demandée", async () => {
    // Le handler admin ne rejoue aucune règle : il délègue au port de lecture.
    // Prouver la délégation = prouver que sa sortie EST celle du reader, et que
    // la portée (listés / supprimés seuls) lui parvient telle quelle.
    const scopes: CompanyListScope[] = [];
    class Reader extends AdminCompanyReader {
      listAll(scope: CompanyListScope): Promise<readonly AdminCompanyView[]> {
        scopes.push(scope);
        return Promise.resolve([view]);
      }
      byId(): Promise<AdminCompanyDetailView | null> {
        return Promise.resolve(null);
      }
    }
    const handler = new ListAllCompaniesHandler(new Reader());

    await expect(handler.execute(new ListAllCompaniesQuery("listed"))).resolves.toEqual([view]);
    await handler.execute(new ListAllCompaniesQuery("archived"));

    expect(scopes).toEqual(["listed", "archived"]);
  });
});
