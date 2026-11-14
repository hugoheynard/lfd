import { randomUUID } from "node:crypto";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import {
  StaffContacts,
  type StaffContact,
} from "../../../../../staff/directory/domain/staff-contacts.js";
import { Company } from "../../../domain/entities/company.js";
import { CompanyNotFoundError } from "../../../domain/errors/account-errors.js";
import {
  FollowerNotFoundError,
  FollowerSuspendedError,
  SiteHasNoFollowerError,
} from "../../../domain/errors/follower-errors.js";
import { CompanyRepository } from "../../../domain/ports/company.repository.js";
import { CompanyOpening } from "../../../domain/value-objects/company-opening.js";
import { HierarchyPlace } from "../../../domain/value-objects/hierarchy-place.js";
import { AssignCompanyFollowerCommand } from "../assign-company-follower.command.js";
import { AssignCompanyFollowerHandler } from "../assign-company-follower.handler.js";

const ENSEIGNE = "Marais Café";

function company(followedBy: string | null, parentCompanyId: string | null = null): Company {
  return Company.reconstitute({
    id: "c1",
    raisonSociale: "PQ Marais",
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
    directDebitBlock: null,
    opening: CompanyOpening.reconstitute({
      declaredByStaffId: null,
      declaredByName: null,
      followedByStaffId: followedBy,
    }),
    hierarchy: HierarchyPlace.reconstitute({
      parentCompanyId,
      hasSubAccounts: false,
      groupWithoutDelivery: false,
    }),
  });
}

/** Port d'écriture doublé : rend la société donnée, garde ce qui est enregistré. */
class StoredCompanies extends CompanyRepository {
  readonly saved: Company[] = [];

  constructor(private readonly stored: Company | null) {
    super();
  }
  existsBySiret(): Promise<boolean> {
    return Promise.resolve(false);
  }
  load(): Promise<Company | null> {
    return Promise.resolve(this.stored);
  }
  save(company: Company): Promise<void> {
    this.saved.push(company);
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

class Directory extends StaffContacts {
  contactsOf(ids: readonly string[]): Promise<ReadonlyMap<string, StaffContact>> {
    return Promise.resolve(
      new Map(PEOPLE.filter((p) => ids.includes(p.staffUserId)).map((p) => [p.staffUserId, p])),
    );
  }
}

function person(staffUserId: string, firstName: string, active = true): StaffContact {
  return { staffUserId, firstName, lastName: "Martin", email: "", jobTitle: "", active };
}

const PEOPLE: readonly StaffContact[] = [
  person("staff_lou", "Lou"),
  person("staff_ana", "Ana"),
  person("staff_off", "Sol", false),
];

function setup(stored: Company | null) {
  const companies = new StoredCompanies(stored);
  const events = new RecordingPublisher();
  const handler = new AssignCompanyFollowerHandler(
    companies,
    new Directory(),
    events,
    new DirectUnitOfWork(),
    inMemoryIntents(),
  );
  return { companies, events, handler };
}

const command = (followerStaffId: string | null, key: string = randomUUID()) =>
  new AssignCompanyFollowerCommand("c1", followerStaffId, "staff_chief", key);

describe("confier le suivi commercial", () => {
  it("attribue une fiche sans suiveur, et journalise avant/après nommés", async () => {
    const { companies, events, handler } = setup(company(null));

    await handler.execute(command("staff_ana"));

    expect(companies.saved[0]?.opening.followerStaffId).toBe("staff_ana");
    expect(events.traced[0]?.journalFact()).toEqual({
      type: "company.follower_changed",
      subjectType: "company",
      subjectId: "c1",
      payload: {
        subjectLabel: ENSEIGNE,
        before: null,
        after: { id: "staff_ana", name: "Ana Martin" },
      },
    });
  });

  it("réattribue, et nomme l'ancien suiveur", async () => {
    const { events, handler } = setup(company("staff_lou"));

    await handler.execute(command("staff_ana"));

    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      before: { id: "staff_lou", name: "Lou Martin" },
      after: { id: "staff_ana", name: "Ana Martin" },
    });
  });

  it("retire le suiveur ; un ancien membre inconnu de l'annuaire se cite par son id", async () => {
    const { companies, events, handler } = setup(company("staff_gone"));

    await handler.execute(command(null));

    expect(companies.saved[0]?.opening.followerStaffId).toBeNull();
    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      before: { id: "staff_gone" },
      after: null,
    });
  });

  it("n'écrit ni ne journalise un suiveur inchangé", async () => {
    const { companies, events, handler } = setup(company("staff_ana"));

    await handler.execute(command("staff_ana"));

    expect(companies.saved).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  it("refuse une personne absente de l'annuaire, ou suspendue", async () => {
    const { companies, handler } = setup(company(null));

    await expect(handler.execute(command("staff_x"))).rejects.toBeInstanceOf(FollowerNotFoundError);
    await expect(handler.execute(command("staff_off"))).rejects.toBeInstanceOf(
      FollowerSuspendedError,
    );
    expect(companies.saved).toEqual([]);
  });

  it("refuse un site, et une société inconnue", async () => {
    await expect(
      setup(company(null, "c_parent")).handler.execute(command("staff_ana")),
    ).rejects.toBeInstanceOf(SiteHasNoFollowerError);
    await expect(setup(null).handler.execute(command("staff_ana"))).rejects.toBeInstanceOf(
      CompanyNotFoundError,
    );
  });

  it("ne réattribue qu'une fois par intention", async () => {
    const { events, handler } = setup(company(null));
    const key = randomUUID();

    await handler.execute(command("staff_ana", key));
    await handler.execute(command("staff_ana", key));

    expect(events.traced).toHaveLength(1);
  });
});
