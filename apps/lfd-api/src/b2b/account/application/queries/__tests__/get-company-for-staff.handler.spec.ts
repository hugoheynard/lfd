import type { CompanyAddressesView } from "@lfd/contracts";

import { CompanyNotFoundError } from "../../../domain/errors/account-errors.js";
import {
  AdminCompanyReader,
  type AdminCompanyDetailView,
} from "../../../domain/ports/admin-company.reader.js";
import { GetCompanyForStaffHandler } from "../get-company-for-staff.handler.js";
import { GetCompanyForStaffQuery } from "../get-company-for-staff.query.js";

const emptyAddresses: CompanyAddressesView = { billing: null, deliveries: [] };

const detail: AdminCompanyDetailView = {
  id: "company_1",
  owner: null,
  warnings: [],
  reference: "C-000123",
  raisonSociale: "Café des Amis",
  enseigne: "Chez Léa",
  formeJuridique: "SAS",
  siret: "12345678901234",
  vatNumber: "",
  status: "pending",
  grantedTerms: [],
  requestedTerm: null,
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
  vatNumberRequired: true,
  addresses: emptyAddresses,
  activation: null,
  suspensionCause: null,
  contacts: [],
  fulfillmentPreference: { method: null, pickupAddressId: null, deliveryAddressId: null },
};

/** Reader stub : `byId` renvoie ce qu'on lui donne, `listAll` inutilisé ici. */
function reader(result: AdminCompanyDetailView | null): AdminCompanyReader {
  return {
    listAll: () => Promise.resolve([]),
    byId: () => Promise.resolve(result),
  };
}

describe("GetCompanyForStaffHandler", () => {
  it("renvoie la fiche AVEC son verdict d'activation", async () => {
    // Le verdict part avec la fiche : l'écran ne le recalcule plus, donc il ne
    // peut plus contredire la porte serveur.
    const handler = new GetCompanyForStaffHandler(reader(detail));

    const fiche = await handler.execute(new GetCompanyForStaffQuery("company_1"));

    expect(fiche).toMatchObject(detail);
    expect(fiche.gate.canActivate).toBe(false);
    // Le KBIS ne bloque plus (convention interne) : c'est la facturation
    // manquante qui tient la porte sur cette fiche.
    expect(fiche.gate.blocking).toContain("facturation");
  });

  it("lève CompanyNotFoundError quand aucune société ne porte l'id", async () => {
    const handler = new GetCompanyForStaffHandler(reader(null));

    await expect(handler.execute(new GetCompanyForStaffQuery("company_unknown"))).rejects.toThrow(
      CompanyNotFoundError,
    );
  });
});
