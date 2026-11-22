import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CompanyHasOrdersReader } from "../../../../orders/domain/ports/company-has-orders.reader.js";
import { Company } from "../../../domain/entities/company.js";
import { CompanyNotFoundError } from "../../../domain/errors/account-errors.js";
import {
  CompanyHasOrdersError,
  CompanyNotArchivedError,
  PrincipalWithSitesCannotBeArchivedError,
} from "../../../domain/errors/archive-errors.js";
import { AccountHierarchyLock } from "../../../domain/ports/account-hierarchy.lock.js";
import { CompanyRepository } from "../../../domain/ports/company.repository.js";
import { CompanyRowLock } from "../../../domain/ports/company-row.lock.js";
import { StaffDirectory, type StaffIdentity } from "../../../domain/ports/staff-directory.js";
import { CompanyArchive } from "../../../domain/value-objects/company-archive.js";
import { HierarchyPlace } from "../../../domain/value-objects/hierarchy-place.js";
import { ArchiveCompanyCommand } from "../archive-company.command.js";
import { ArchiveCompanyHandler } from "../archive-company.handler.js";
import { UnarchiveCompanyCommand } from "../unarchive-company.command.js";
import { UnarchiveCompanyHandler } from "../unarchive-company.handler.js";

// L'instant de la suppression est relu tel quel, jamais comparé à l'horloge.
const NOW = new Date("2026-11-22T09:00:00.000Z");
const ENSEIGNE = "Ferme du Col";

function company(archive: CompanyArchive | null = null, hasSubAccounts = false): Company {
  return Company.reconstitute({
    id: "c1",
    raisonSociale: "Ferme du Col SAS",
    enseigne: ENSEIGNE,
    formeJuridique: "SAS",
    siret: "81245678900021",
    vatNumber: "",
    contact: null,
    grantedTerms: [],
    requestedTerm: null,
    status: "pending",
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
    archive,
    hierarchy: HierarchyPlace.reconstitute({
      parentCompanyId: null,
      hasSubAccounts,
      groupWithoutDelivery: false,
    }),
  });
}

/** Le journal commun des doubles : l'ordre des appels est ce qu'on éprouve. */
type Calls = string[];

class RecordingCompanies extends CompanyRepository {
  saved: Company | null = null;
  constructor(
    private readonly stored: Company | null,
    private readonly calls: Calls,
  ) {
    super();
  }
  existsBySiret(): Promise<boolean> {
    return Promise.resolve(false);
  }
  load(): Promise<Company | null> {
    this.calls.push("load");
    return Promise.resolve(this.stored);
  }
  save(aggregate: Company): Promise<void> {
    this.calls.push("save");
    this.saved = aggregate;
    return Promise.resolve();
  }
  declareOwnedBy(): Promise<string> {
    return Promise.resolve("");
  }
  declareUnowned(): Promise<string> {
    return Promise.resolve("");
  }
  kbisLocation(): Promise<null> {
    return Promise.resolve(null);
  }
}

class RecordingLock extends CompanyRowLock {
  constructor(
    private readonly exists: boolean,
    private readonly calls: Calls,
  ) {
    super();
  }
  lock(): Promise<boolean> {
    this.calls.push("lock");
    return Promise.resolve(this.exists);
  }
}

class RecordingHierarchy extends AccountHierarchyLock {
  constructor(private readonly calls: Calls) {
    super();
  }
  acquire(): Promise<void> {
    this.calls.push("hierarchy");
    return Promise.resolve();
  }
}

class FixedOrders extends CompanyHasOrdersReader {
  constructor(
    private readonly answer: boolean,
    private readonly calls: Calls,
  ) {
    super();
  }
  hasOrders(): Promise<boolean> {
    this.calls.push("hasOrders");
    return Promise.resolve(this.answer);
  }
}

class KnownStaff extends StaffDirectory {
  identify(): Promise<StaffIdentity | null> {
    return Promise.resolve({ name: "Camille Durand", role: "commercial" });
  }
}

function archiveHandler(input: {
  readonly stored: Company | null;
  readonly exists?: boolean;
  readonly hasOrders?: boolean;
}) {
  const calls: Calls = [];
  const companies = new RecordingCompanies(input.stored, calls);
  const events = new RecordingPublisher();
  const handler = new ArchiveCompanyHandler(
    companies,
    new RecordingHierarchy(calls),
    new RecordingLock(input.exists ?? true, calls),
    new FixedOrders(input.hasOrders ?? false, calls),
    new KnownStaff(),
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
  );
  return { handler, companies, events, calls };
}

describe("ArchiveCompanyHandler", () => {
  it("verrouille la hiérarchie puis la ligne, lit les commandes, supprime et inscrit le fait avec le motif", async () => {
    const { handler, companies, events, calls } = archiveHandler({ stored: company() });

    await handler.execute(new ArchiveCompanyCommand("c1", " Doublon ", "staff_1"));

    expect(calls).toEqual(["hierarchy", "lock", "load", "hasOrders", "save"]);
    expect(companies.saved?.toPersistence().archive).toMatchObject({
      archivedAt: NOW,
      byStaffId: "staff_1",
      byName: "Camille Durand",
      reason: "Doublon",
    });
    expect(events.factTypes()).toEqual(["company.archived"]);
    expect(events.traced[0]?.journalFact().payload).toEqual({
      subjectLabel: ENSEIGNE,
      reason: "Doublon",
    });
  });

  it("refuse un compte qui a des commandes : rien n'est sauvé, rien n'est inscrit", async () => {
    const { handler, companies, events } = archiveHandler({
      stored: company(),
      hasOrders: true,
    });

    await expect(
      handler.execute(new ArchiveCompanyCommand("c1", "Doublon", "staff_1")),
    ).rejects.toBeInstanceOf(CompanyHasOrdersError);
    expect(companies.saved).toBeNull();
    expect(events.factTypes()).toEqual([]);
  });

  it("société inconnue au verrou : 404 avant toute lecture", async () => {
    const { handler, calls } = archiveHandler({ stored: null, exists: false });

    await expect(
      handler.execute(new ArchiveCompanyCommand("ghost", "Doublon", "staff_1")),
    ).rejects.toBeInstanceOf(CompanyNotFoundError);
    expect(calls).toEqual(["hierarchy", "lock"]);
  });

  it("refuse un principal qui a des sites rattachés, en disant de les détacher", async () => {
    const { handler, companies, events } = archiveHandler({ stored: company(null, true) });

    const refused = handler.execute(new ArchiveCompanyCommand("c1", "Doublon", "staff_1"));
    await expect(refused).rejects.toBeInstanceOf(PrincipalWithSitesCannotBeArchivedError);
    await expect(refused).rejects.toThrow(
      "Ce compte a des sites rattachés : détachez-les d'abord.",
    );
    expect(companies.saved).toBeNull();
    expect(events.factTypes()).toEqual([]);
  });
});

describe("UnarchiveCompanyHandler", () => {
  function unarchiveHandler(stored: Company | null) {
    const calls: Calls = [];
    const companies = new RecordingCompanies(stored, calls);
    const events = new RecordingPublisher();
    const handler = new UnarchiveCompanyHandler(
      companies,
      new RecordingLock(stored !== null, calls),
      events,
      new DirectUnitOfWork(),
    );
    return { handler, companies, events, calls };
  }

  it("rend le compte sous le verrou et inscrit le fait", async () => {
    const { handler, companies, events, calls } = unarchiveHandler(
      company(CompanyArchive.reconstitute(NOW, "staff_1", null, "Doublon")),
    );

    await handler.execute(new UnarchiveCompanyCommand("c1"));

    expect(calls).toEqual(["lock", "load", "save"]);
    expect(companies.saved?.toPersistence().archive).toBeNull();
    expect(events.factTypes()).toEqual(["company.unarchived"]);
  });

  it("refuse un compte qui n'est pas supprimé", async () => {
    const { handler, events } = unarchiveHandler(company());

    await expect(handler.execute(new UnarchiveCompanyCommand("c1"))).rejects.toBeInstanceOf(
      CompanyNotArchivedError,
    );
    expect(events.factTypes()).toEqual([]);
  });
});
