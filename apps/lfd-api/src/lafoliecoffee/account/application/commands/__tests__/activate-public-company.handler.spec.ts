import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { Company } from "../../../domain/entities/company.js";
import {
  AdminCompanyReader,
  type AdminCompanyDetailView,
  type AdminCompanyView,
} from "../../../domain/ports/admin-company.reader.js";
import { StaffDirectory, type StaffIdentity } from "../../../domain/ports/staff-directory.js";
import { ContactDetails } from "../../../domain/value-objects/contact-details.js";
import { ActivateCompanyByStaffCommand } from "../activate-company.command.js";
import { ActivateCompanyByStaffHandler } from "../activate-company.handler.js";
import {
  CallLog,
  FollowsReaderOver,
  InMemoryCompanies,
  InMemoryFollows,
  RecordingHierarchyLock,
  RecordingPublicPayerOpening,
} from "./hierarchy-doubles.js";

const clock = new FixedClock(new Date("2030-03-01T08:00:00.000Z"));

/** La fiche d'une école publique qui règle seule : tout ce que l'activation exige. */
function schoolView(formeJuridique: string): AdminCompanyDetailView {
  return {
    id: "ecole",
    revision: 0,
    reference: "C-CHALET",
    raisonSociale: "Commune de Chamonix",
    enseigne: "École du Mont-Blanc",
    formeJuridique,
    siret: "81245678800023",
    siren: "812456788",
    vatNumber: "FR66812456789",
    status: "pending",
    grantedTerms: [],
    requestedTerm: null,
    directDebitBlocked: false,
    primaryContact: {
      id: null,
      role: null,
      firstName: "",
      lastName: "",
      fonction: "Intendante",
      email: "intendance@ecole.fr",
      phone: "",
    },
    owner: null,
    kbis: null,
    hasOpenSupportRequest: false,
    createdAt: clock.now().toISOString(),
    declaredVia: null,
    piecesReached: [],
    activatedAt: null,
    warnings: [],
    parent: null,
    activation: null,
    suspensionCause: null,
    vatNumberRequired: true,
    archivedAt: null,
    archivedByName: null,
    archiveReason: null,
    hasBankAccount: false,
    addresses: {
      billing: {
        id: "b",
        label: "Siège",
        ligne1: "1 rue",
        ligne2: "",
        codePostal: "74400",
        ville: "Chamonix",
        pays: "France",
      },
      deliveries: [],
    },
    contacts: [
      {
        contactId: "ct",
        role: "admin",
        firstName: "Paul",
        lastName: "Gardien",
        fonction: "gardien",
        email: "paul@chalet.fr",
        phone: "06 00 00 00 00",
        access: "none",
        emailVerified: false,
      },
    ],
    chorusService: null,
    chorusServicePayerIsPublic: false,
    chorusRouting: {
      commitmentRequired: true,
      serviceCodeRequired: false,
      defaultServiceCode: "",
      commitmentTiming: "at_order",
      checkedOn: "2030-02-01",
      checkedBy: { name: "Agent", role: "admin" },
    },
    fulfillmentPreference: {
      method: null,
      pickupAddressId: null,
      deliveryAddressId: null,
      signatureRequired: false,
    },
    hierarchy: {
      parent: null,
      subAccounts: [],
      follows: [],
      groupWithoutDelivery: false,
      collectionForm: null,
    },
  };
}

class FicheOf extends AdminCompanyReader {
  constructor(private readonly view: AdminCompanyDetailView) {
    super();
  }
  listAll(): Promise<readonly AdminCompanyView[]> {
    return Promise.resolve([]);
  }
  byId(): Promise<AdminCompanyDetailView | null> {
    return Promise.resolve(this.view);
  }
}

class NoStaff extends StaffDirectory {
  identify(): Promise<StaffIdentity | null> {
    return Promise.resolve(null);
  }
}

function pendingCompany(formeJuridique: string): Company {
  return Company.reconstitute({
    id: "ecole",
    raisonSociale: "Commune de Chamonix",
    enseigne: "École du Mont-Blanc",
    formeJuridique,
    siret: "81245678800023",
    siren: "812456788",
    vatNumber: "",
    contact: ContactDetails.create({
      firstName: "Claire",
      lastName: "Durand",
      fonction: "Intendante",
      email: "intendance@ecole.fr",
      phone: "04 50 00 00 00",
    }),
    grantedTerms: [],
    requestedTerm: null,
    status: "pending",
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
  });
}

function handler(formeJuridique: string): {
  readonly run: () => Promise<void>;
  readonly log: CallLog;
  readonly companies: InMemoryCompanies;
  readonly opening: RecordingPublicPayerOpening;
} {
  const log = new CallLog();
  const companies = new InMemoryCompanies(
    log,
    new Map([["ecole", pendingCompany(formeJuridique)]]),
  );
  const opening = new RecordingPublicPayerOpening(log);
  const activate = new ActivateCompanyByStaffHandler(
    companies,
    new FicheOf(schoolView(formeJuridique)),
    clock,
    new RecordingPublisher(),
    new DirectUnitOfWork(),
    new NoStaff(),
    new RecordingHierarchyLock(log),
    new FollowsReaderOver(new InMemoryFollows(log)),
    opening,
  );
  return {
    run: () => activate.execute(new ActivateCompanyByStaffCommand("ecole", "staff_1")),
    log,
    companies,
    opening,
  };
}

describe("Activer un organisme public (P1b, B1–B2)", () => {
  it("accorde le compte et ouvre le virement, après l'écriture du compte", async () => {
    const { run, log, companies, opening } = handler("public_establishment");

    await run();

    expect(companies.saved[0]?.grantedTerms).toEqual(["monthly"]);
    expect(opening.opened).toEqual([
      { payer: { id: "ecole", name: "École du Mont-Blanc" }, staffUserId: "staff_1" },
    ]);
    expect(log.calls.indexOf("openPublic:ecole")).toBeGreaterThan(log.calls.indexOf("save:ecole"));
  });

  it("n'ouvre rien pour une entreprise", async () => {
    const { run, companies, opening } = handler("sas");

    await run();

    expect(companies.saved[0]?.grantedTerms).toEqual([]);
    expect(opening.opened).toEqual([]);
  });
});
