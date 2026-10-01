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
  siren: "",
  vatNumber: "",
  status: "pending",
  grantedTerms: [],
  requestedTerm: null,
  directDebitBlocked: false,
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
  // `pending` : le dossier est déposé, il n'a jamais été activé. `null` n'est
  // donc pas un remplissage — c'est ce que la fiche DIT, et la distinction avec
  // `createdAt` est celle qui date le chiffre d'affaires.
  activatedAt: null,
  createdAt: "2026-07-30T10:00:00.000Z",
  vatNumberRequired: true,
  addresses: emptyAddresses,
  activation: null,
  suspensionCause: null,
  contacts: [],
  fulfillmentPreference: {
    method: null,
    pickupAddressId: null,
    deliveryAddressId: null,
    signatureRequired: false,
  },
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

    const fiche = await handler.execute(new GetCompanyForStaffQuery("company_1", true));

    expect(fiche).toMatchObject(detail);
    expect(fiche.gate.canActivate).toBe(false);
    // Le KBIS ne bloque plus (convention interne) : c'est la facturation
    // manquante qui tient la porte sur cette fiche.
    expect(fiche.gate.blocking).toContain("facturation");
  });

  it("lève CompanyNotFoundError quand aucune société ne porte l'id", async () => {
    const handler = new GetCompanyForStaffHandler(reader(null));

    await expect(
      handler.execute(new GetCompanyForStaffQuery("company_unknown", true)),
    ).rejects.toThrow(CompanyNotFoundError);
  });

  describe("le nombre d'étapes de procédure (DG-D8)", () => {
    const withProcedure: AdminCompanyDetailView = {
      ...detail,
      addresses: {
        billing: null,
        deliveries: [
          {
            id: "addr_1",
            label: "Chalet",
            ligne1: "12 rue du Test",
            ligne2: "",
            codePostal: "73150",
            ville: "Val d'Isère",
            pays: "France",
            isDefault: true,
            specs: {
              note: "",
              slots: { mode: "everyday", slot: null },
              deliveryContact: null,
              gps: null,
              signatureRequired: false,
            },
            procedureStepCount: 3,
            depositAllowed: false,
          },
        ],
      },
    };

    it("le sert à qui lit les procédures", async () => {
      const handler = new GetCompanyForStaffHandler(reader(withProcedure));

      const fiche = await handler.execute(new GetCompanyForStaffQuery("company_1", true));

      expect(fiche.addresses.deliveries[0]?.procedureStepCount).toBe(3);
    });

    it("🔴 le rend à zéro sans `delivery_procedures:read`, le reste du carnet intact", async () => {
      const handler = new GetCompanyForStaffHandler(reader(withProcedure));

      const fiche = await handler.execute(new GetCompanyForStaffQuery("company_1", false));

      expect(fiche.addresses.deliveries).toEqual([
        { ...withProcedure.addresses.deliveries[0], procedureStepCount: 0 },
      ]);
    });
  });
});
