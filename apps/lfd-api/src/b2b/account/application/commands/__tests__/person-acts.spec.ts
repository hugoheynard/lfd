import { IdentityWithoutLoginMethods } from "../../../domain/ports/__tests__/login-method-doubles.js";
import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { Company } from "../../../domain/entities/company.js";
import type { UserProfile } from "../../../domain/entities/user-profile.js";
import {
  CompanyMemberReader,
  type CompanyMemberRecord,
} from "../../../domain/ports/company-member.repository.js";
import type { ProvisionedIdentity } from "../../../domain/ports/customer-identity.port.js";
import {
  PendingAccessReader,
  type PendingAccessView,
} from "../../../domain/ports/pending-access.reader.js";
import {
  UserProfileRepository,
  type UserProfileRecord,
} from "../../../domain/ports/user-profile.repository.js";
import {
  AccountAccessGranter,
  type AccessGranted,
} from "../../services/grant-account-access.service.js";
import { AttachAccountHolderCommand } from "../attach-account-holder.command.js";
import { AttachAccountHolderHandler } from "../attach-account-holder.handler.js";
import { InviteCompanyMemberCommand } from "../invite-company-member.command.js";
import { InviteCompanyMemberHandler } from "../invite-company-member.handler.js";
import { IssuePasswordLinkCommand } from "../issue-password-link.command.js";
import { IssuePasswordLinkHandler } from "../issue-password-link.handler.js";
import { UpdateMyProfileCommand } from "../update-my-profile.command.js";
import { UpdateMyProfileHandler } from "../update-my-profile.handler.js";
import { EMAIL, InMemoryCompanies, journalNames, PHONE } from "./member-acts-doubles.js";

/**
 * **Ce qu'un geste sur une personne laisse au journal** (plan
 * `documentation/journalisation/plan-journal-d-activite.md`, lot 1, tranche
 * (c), 2026-09-19) — profil, accès, lien de mot de passe. Chacun passe par un
 * tiers (le fournisseur d'identité) : le fait s'écrit APRÈS lui, et jamais
 * quand il a refusé.
 *
 * Lot B du plan des phrases (même jour) : la personne est nommée — son nom
 * n'est pas une coordonnée —, la société aussi ; et l'absence de nom reste une
 * absence, jamais une adresse à sa place.
 */
const RECORDED: UserProfileRecord = {
  userId: "user_1",
  firstName: "Camille",
  lastName: "Rousseau",
  email: "camille@ancienne.fr",
  phone: "",
};

class StoredProfile extends UserProfileRepository {
  readonly saved: UserProfile[] = [];
  findById(): Promise<UserProfileRecord | null> {
    return Promise.resolve(RECORDED);
  }
  findIdByEmail(): Promise<string | null> {
    return Promise.resolve(null);
  }
  save(_userId: string, profile: UserProfile): Promise<void> {
    this.saved.push(profile);
    return Promise.resolve();
  }
}

/** Le fournisseur d'identité, qui peut refuser le changement d'adresse. */
class Identity extends IdentityWithoutLoginMethods {
  constructor(private readonly refuses = false) {
    super();
  }
  changeEmail(): Promise<void> {
    return this.refuses ? Promise.reject(new Error("fournisseur indisponible")) : Promise.resolve();
  }
  provision(): Promise<ProvisionedIdentity> {
    return Promise.resolve({ subject: "auth0|x", passwordSetupUrl: "https://auth/ticket" });
  }
  issuePasswordLink(): Promise<string> {
    return Promise.resolve("https://auth/ticket-secret");
  }
}

class Access extends AccountAccessGranter {
  constructor(private readonly outcome: AccessGranted | Error) {
    super();
  }
  grant(): Promise<AccessGranted> {
    return this.outcome instanceof Error
      ? Promise.reject(this.outcome)
      : Promise.resolve(this.outcome);
  }
}

const OPENED: AccessGranted = { userId: "user_9", outcome: "identity_created", mailSent: true };

class OneMember extends CompanyMemberReader {
  listOf(): Promise<readonly CompanyMemberRecord[]> {
    return Promise.resolve([
      {
        userId: "user_9",
        email: EMAIL,
        firstName: "Karim",
        lastName: "Benali",
        phone: PHONE,
        role: "orders",
        status: "invited",
        joinedAt: new Date("2026-02-03T10:00:00Z"),
      },
    ]);
  }
}

/** Une société sans détenteur : le rattachement du détenteur la comble. */
class CompaniesWithoutHolder extends InMemoryCompanies {
  private readonly bare = Company.reconstitute({
    id: "c1",
    raisonSociale: "",
    enseigne: "Café des Halles",
    formeJuridique: "",
    siret: "",
    vatNumber: "",
    contact: null,
    grantedTerms: [],
    requestedTerm: null,
    status: "pending",
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
  });
  override load(): Promise<Company | null> {
    return Promise.resolve(this.bare);
  }
}

class PendingUser extends PendingAccessReader {
  list(): Promise<readonly PendingAccessView[]> {
    return Promise.resolve([]);
  }
  subjectOf(): Promise<string | null> {
    return Promise.resolve("auth0|abc");
  }
}

function profileCommand(changes: Partial<UserProfileRecord>): UpdateMyProfileCommand {
  const next = { ...RECORDED, ...changes };
  return new UpdateMyProfileCommand(
    "user_1",
    "auth0|1",
    next.firstName,
    next.lastName,
    next.email,
    next.phone,
  );
}

describe("le profil", () => {
  it("nomme les champs changés — jamais la nouvelle adresse ni le téléphone", async () => {
    const events = new RecordingPublisher();
    const handler = new UpdateMyProfileHandler(
      new StoredProfile(),
      new Identity(),
      events,
      new DirectUnitOfWork(),
    );

    await handler.execute(profileCommand({ email: EMAIL, phone: PHONE }));

    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "user.profile_updated",
        subjectType: "user",
        subjectId: "user_1",
        payload: { subjectLabel: "Camille Rousseau", fields: ["email", "phone"] },
      },
    ]);
    const written = JSON.stringify(events.traced[0]?.journalFact());
    expect(written).not.toContain(EMAIL);
    expect(written).not.toContain(PHONE);
  });

  it("un envoi identique n'écrit aucun fait", async () => {
    const events = new RecordingPublisher();
    const handler = new UpdateMyProfileHandler(
      new StoredProfile(),
      new Identity(),
      events,
      new DirectUnitOfWork(),
    );

    await handler.execute(profileCommand({}));

    expect(events.traced).toHaveLength(0);
  });

  it("aucun fait quand le fournisseur refuse la nouvelle adresse", async () => {
    const events = new RecordingPublisher();
    const profiles = new StoredProfile();
    const handler = new UpdateMyProfileHandler(
      profiles,
      new Identity(true),
      events,
      new DirectUnitOfWork(),
    );

    await expect(handler.execute(profileCommand({ email: EMAIL }))).rejects.toThrow(
      /indisponible/u,
    );

    expect(profiles.saved).toHaveLength(0);
    expect(events.traced).toHaveLength(0);
  });
});

describe("l'accès à une société", () => {
  it("l'invitation d'un membre : un fait sur la société, la personne par son id et son rôle", async () => {
    const events = new RecordingPublisher();
    const handler = new InviteCompanyMemberHandler(
      new InMemoryCompanies(),
      new OneMember(),
      new Access(OPENED),
      events,
    );

    await handler.execute(
      new InviteCompanyMemberCommand("c1", EMAIL, "Karim", "Benali", PHONE, "orders", "fiche-1"),
    );

    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "company.access_opened",
        subjectType: "company",
        subjectId: "c1",
        payload: {
          subjectLabel: "Le Pain Quotidien",
          person: { id: "user_9", name: "Karim Benali" },
          role: "orders",
        },
      },
    ]);
  });

  it("une invitation que le fournisseur refuse n'écrit aucun fait", async () => {
    const events = new RecordingPublisher();
    const handler = new InviteCompanyMemberHandler(
      new InMemoryCompanies(),
      new OneMember(),
      new Access(new Error("fournisseur indisponible")),
      events,
    );

    await expect(
      handler.execute(
        new InviteCompanyMemberCommand("c1", EMAIL, "Karim", "Benali", PHONE, "orders", "fiche-1"),
      ),
    ).rejects.toThrow(/indisponible/u);
    expect(events.traced).toHaveLength(0);
  });

  it("le rattachement du détenteur : le même fait, en propriétaire, avec la fiche rangée", async () => {
    const events = new RecordingPublisher();
    const companies = new CompaniesWithoutHolder();
    const handler = new AttachAccountHolderHandler(
      companies,
      new Access(OPENED),
      events,
      new DirectUnitOfWork(),
    );

    await handler.execute(
      new AttachAccountHolderCommand(
        "c1",
        { firstName: "Camille", lastName: "Rousseau", fonction: "", email: EMAIL, phone: PHONE },
        "fiche-1",
      ),
    );

    expect(companies.saved).toHaveLength(1);
    expect(events.factTypes()).toEqual(["company.access_opened"]);
    expect(events.traced[0]?.journalFact().payload).toEqual({
      subjectLabel: "Café des Halles",
      person: { id: "user_9", name: "Camille Rousseau" },
      role: "owner",
    });
  });
});

describe("le lien de mot de passe", () => {
  it("journalise le geste et le nom de la personne, jamais le lien", async () => {
    const events = new RecordingPublisher();
    const handler = new IssuePasswordLinkHandler(
      new PendingUser(),
      new Identity(),
      new FixedClock(new Date("2026-02-03T10:00:00Z")),
      events,
      journalNames(),
    );

    const link = await handler.execute(new IssuePasswordLinkCommand("u1"));

    expect(link.url).toBe("https://auth/ticket-secret");
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "user.password_link_issued",
        subjectType: "user",
        subjectId: "u1",
        payload: { subjectLabel: "Camille Rousseau" },
      },
    ]);
    expect(JSON.stringify(events.traced[0]?.journalFact())).not.toContain("camille@");
  });

  it("une personne sans nom est citée sans libellé — son adresse n'en tient pas lieu", async () => {
    const events = new RecordingPublisher();
    const handler = new IssuePasswordLinkHandler(
      new PendingUser(),
      new Identity(),
      new FixedClock(new Date("2026-02-03T10:00:00Z")),
      events,
      journalNames(),
    );

    await handler.execute(new IssuePasswordLinkCommand("user_sans_fiche"));

    expect(events.traced[0]?.journalFact().payload).toEqual({});
  });
});
