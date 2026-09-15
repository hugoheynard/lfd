import type { AdminCompanyDetailView, AdminCompanyView } from "@lfd/contracts";

import { CompanyNotFoundError } from "../../../domain/errors/account-errors.js";
import { AdminCompanyReader } from "../../../domain/ports/admin-company.reader.js";
import { MembershipReader } from "../../../domain/ports/membership.reader.js";
import type { CompanyRole } from "../../../domain/value-objects/company-role.js";
import { GetMyCompanyActivationHandler } from "../get-my-company-activation.handler.js";
import { GetMyCompanyActivationQuery } from "../get-my-company-activation.query.js";

const COMPANY_ID = "company_1";
const ACTOR = "user_1";

/** Une fiche incomplète : ni téléphone, ni TVA, ni facturation. */
const detail: AdminCompanyDetailView = {
  id: COMPANY_ID,
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
  primaryContact: {
    role: null,
    id: null,
    firstName: "Léa",
    lastName: "Martin",
    fonction: "Gérante",
    email: "lea@cafedesamis.fr",
    phone: "",
  },
  kbis: null,
  hasOpenSupportRequest: false,
  activatedAt: null,
  createdAt: "2026-07-30T10:00:00.000Z",
  vatNumberRequired: true,
  addresses: { billing: null, deliveries: [] },
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

/** Rattachement doublé : rend le rôle qu'on lui donne. */
class StubMemberships extends MembershipReader {
  constructor(private readonly role: CompanyRole | null) {
    super();
  }

  roleOf(): Promise<CompanyRole | null> {
    return Promise.resolve(this.role);
  }
}

/** Lecteur doublé : compte ses lectures, pour prouver qu'un refus n'en fait aucune. */
class RecordingCompanies extends AdminCompanyReader {
  readonly readIds: string[] = [];

  constructor(private readonly company: AdminCompanyDetailView | null) {
    super();
  }

  listAll(): Promise<readonly AdminCompanyView[]> {
    return Promise.resolve([]);
  }

  byId(companyId: string): Promise<AdminCompanyDetailView | null> {
    this.readIds.push(companyId);
    return Promise.resolve(this.company);
  }
}

describe("GetMyCompanyActivationHandler", () => {
  it("sert à un membre le verdict calculé sur la fiche", async () => {
    const companies = new RecordingCompanies(detail);
    const handler = new GetMyCompanyActivationHandler(new StubMemberships("orders"), companies);

    const gate = await handler.execute(new GetMyCompanyActivationQuery(ACTOR, COMPANY_ID));

    expect(gate.canActivate).toBe(false);
    expect(gate.blocking).toEqual(["telephone", "vat", "facturation"]);
    expect(gate.checklist.map((check) => check.piece)).toEqual(["vat", "kbis", "billing"]);
    expect(companies.readIds).toEqual([COMPANY_ID]);
  });

  it("refuse un non-membre en 404, sans lire la société", async () => {
    const companies = new RecordingCompanies(detail);
    const handler = new GetMyCompanyActivationHandler(new StubMemberships(null), companies);

    await expect(
      handler.execute(new GetMyCompanyActivationQuery(ACTOR, COMPANY_ID)),
    ).rejects.toThrow(CompanyNotFoundError);
    expect(companies.readIds).toEqual([]);
  });

  it("rend 404 si la société a disparu entre le rattachement et la lecture", async () => {
    const handler = new GetMyCompanyActivationHandler(
      new StubMemberships("owner"),
      new RecordingCompanies(null),
    );

    await expect(
      handler.execute(new GetMyCompanyActivationQuery(ACTOR, COMPANY_ID)),
    ).rejects.toThrow(CompanyNotFoundError);
  });
});
