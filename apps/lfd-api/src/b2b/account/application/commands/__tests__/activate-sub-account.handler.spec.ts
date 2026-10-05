import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { Company } from "../../../domain/entities/company.js";
import { SubAccountFollows } from "../../../domain/entities/sub-account-follows.js";
import { CompanyActivationBlockedError } from "../../../domain/errors/account-errors.js";
import {
  chaletCompany,
  principalCompany,
} from "../../../domain/entities/__tests__/company-hierarchy-fixtures.js";
import {
  AdminCompanyReader,
  type AdminCompanyDetailView,
  type AdminCompanyView,
} from "../../../domain/ports/admin-company.reader.js";
import { StaffDirectory, type StaffIdentity } from "../../../domain/ports/staff-directory.js";
import { ActivateCompanyByStaffCommand } from "../activate-company.command.js";
import { ActivateCompanyByStaffHandler } from "../activate-company.handler.js";
import {
  CallLog,
  FollowsReaderOver,
  InMemoryCompanies,
  InMemoryFollows,
  RecordingHierarchyLock,
} from "./hierarchy-doubles.js";

const clock = new FixedClock(new Date("2030-03-01T08:00:00.000Z"));

/** La fiche du chalet : rien d'à lui que l'enseigne, une facturation, un numéro joignable. */
function chaletView(parentStatus: "active" | "pending"): AdminCompanyDetailView {
  return {
    id: "chalet",
    reference: "C-CHALET",
    raisonSociale: "",
    enseigne: "Chalet Edelweiss",
    formeJuridique: "",
    siret: "",
    siren: "",
    vatNumber: "FR12812456789",
    status: "pending",
    grantedTerms: [],
    requestedTerm: null,
    directDebitBlocked: false,
    primaryContact: {
      id: null,
      role: null,
      firstName: "",
      lastName: "",
      fonction: "",
      email: "",
      phone: "",
    },
    owner: null,
    kbis: null,
    hasOpenSupportRequest: false,
    createdAt: clock.now().toISOString(),
    activatedAt: null,
    warnings: [],
    parent: { id: "groupe", enseigne: "Alpes Chalets" },
    activation: null,
    suspensionCause: null,
    vatNumberRequired: true,
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
    fulfillmentPreference: {
      method: null,
      pickupAddressId: null,
      deliveryAddressId: null,
      signatureRequired: false,
    },
    hierarchy: {
      parent: { id: "groupe", enseigne: "Alpes Chalets", status: parentStatus },
      subAccounts: [],
      follows: [{ aspect: "billing", since: clock.now().toISOString() }],
      groupWithoutDelivery: false,
    },
  };
}

class FicheOf extends AdminCompanyReader {
  constructor(
    private readonly log: CallLog,
    private readonly view: AdminCompanyDetailView,
  ) {
    super();
  }
  listAll(): Promise<readonly AdminCompanyView[]> {
    return Promise.resolve([]);
  }
  byId(): Promise<AdminCompanyDetailView | null> {
    this.log.calls.push("fiche");
    return Promise.resolve(this.view);
  }
}

class NoStaff extends StaffDirectory {
  identify(): Promise<StaffIdentity | null> {
    return Promise.resolve(null);
  }
}

function handler(
  parent: Company,
  parentStatus: "active" | "pending",
): {
  readonly run: () => Promise<void>;
  readonly log: CallLog;
  readonly companies: InMemoryCompanies;
} {
  const log = new CallLog();
  const companies = new InMemoryCompanies(
    log,
    new Map([
      ["groupe", parent],
      ["chalet", chaletCompany()],
    ]),
  );
  const follows = SubAccountFollows.none("chalet");
  follows.follow(
    "billing",
    chaletCompany(),
    principalCompany(),
    new Date(clock.now().getTime() - 1),
  );
  const reader = new FollowsReaderOver(new InMemoryFollows(log, new Map([["chalet", follows]])));
  const activate = new ActivateCompanyByStaffHandler(
    companies,
    new FicheOf(log, chaletView(parentStatus)),
    clock,
    new RecordingPublisher(),
    new DirectUnitOfWork(),
    new NoStaff(),
    new RecordingHierarchyLock(log),
    reader,
  );
  return {
    run: () => activate.execute(new ActivateCompanyByStaffCommand("chalet", "staff_1")),
    log,
    companies,
  };
}

describe("Activer un sous-compte qui suit la facturation (plan-sous-comptes §2.1 bis)", () => {
  it("s'active sans SIRET ni détenteur, en relisant le suivi sous le verrou", async () => {
    const { run, log, companies } = handler(principalCompany("active"), "active");

    await run();

    // Le suivi et le principal se relisent APRÈS le verrou : c'est là que
    // l'agrégat tranche.
    const lock = log.calls.indexOf("lock");
    expect(lock).toBeGreaterThan(-1);
    expect(log.calls.indexOf("follows:chalet")).toBeGreaterThan(lock);
    expect(log.calls.indexOf("load:groupe")).toBeGreaterThan(lock);
    expect(companies.saved[0]?.status).toBe("active");
  });

  it("reste bloqué quand le principal n'est pas actif", async () => {
    const { run, companies } = handler(principalCompany("pending"), "pending");

    await expect(run()).rejects.toThrow(CompanyActivationBlockedError);
    expect(companies.saved).toEqual([]);
  });
});
