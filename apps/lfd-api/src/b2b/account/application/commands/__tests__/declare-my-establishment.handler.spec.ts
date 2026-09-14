import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { DomainError } from "../../../../../platform/shared/errors/app-error.js";
import type { Company } from "../../../domain/entities/company.js";
import type { UserProfile } from "../../../domain/entities/user-profile.js";
import {
  InvalidPersonNameError,
  InvalidPhoneError,
  PersonAlreadyAttachedError,
  UserProfileNotFoundError,
} from "../../../domain/errors/account-errors.js";
import { CompanyDeclaredEvent } from "../../../domain/events/company-declared.event.js";
import { CompanyRepository } from "../../../domain/ports/company.repository.js";
import { PersonAttachmentLock } from "../../../domain/ports/person-attachment.lock.js";
import {
  UserProfileRepository,
  type UserProfileRecord,
} from "../../../domain/ports/user-profile.repository.js";
import { DeclareMyEstablishmentCommand } from "../declare-my-establishment.command.js";
import { DeclareMyEstablishmentHandler } from "../declare-my-establishment.handler.js";

/** Un compte provisionné au vol : son adresse, et rien d'autre. */
const PROVISIONED: UserProfileRecord = {
  userId: "user_1",
  firstName: "",
  lastName: "",
  email: "camille@pqmarais.fr",
  phone: "",
};

/** Ce que le handler fait franchir à ses ports, dans l'ordre. */
class Trail {
  readonly calls: string[] = [];
  readonly saved: UserProfile[] = [];
  readonly declared: { company: Company; ownerUserId: string }[] = [];
}

class TrailLock extends PersonAttachmentLock {
  constructor(
    private readonly trail: Trail,
    private readonly attached: boolean,
  ) {
    super();
  }

  acquireAndCheckAttached(): Promise<boolean> {
    this.trail.calls.push("lock");
    return Promise.resolve(this.attached);
  }
}

class TrailProfiles extends UserProfileRepository {
  constructor(
    private readonly trail: Trail,
    private readonly stored: UserProfileRecord | null,
  ) {
    super();
  }

  findById(): Promise<UserProfileRecord | null> {
    return Promise.resolve(this.stored);
  }

  findIdByEmail(): Promise<string | null> {
    return Promise.resolve(null);
  }

  save(_userId: string, profile: UserProfile): Promise<void> {
    this.trail.calls.push("profile");
    this.trail.saved.push(profile);
    return Promise.resolve();
  }
}

class TrailCompanies extends CompanyRepository {
  constructor(private readonly trail: Trail) {
    super();
  }

  existsBySiret(): Promise<boolean> {
    return Promise.resolve(false);
  }
  load(): Promise<Company | null> {
    return Promise.resolve(null);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  declareOwnedBy(company: Company, ownerUserId: string): Promise<string> {
    this.trail.calls.push("company");
    this.trail.declared.push({ company, ownerUserId });
    return Promise.resolve("company_new");
  }
  declareUnowned(): Promise<string> {
    return Promise.resolve("company_unowned");
  }
  kbisLocation(): Promise<null> {
    return Promise.resolve(null);
  }
}

/** Unité de travail qui marque sa fin : situe la publication par rapport au commit. */
class TrailUnitOfWork extends UnitOfWork {
  private readonly direct = new DirectUnitOfWork();

  constructor(private readonly trail: Trail) {
    super();
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    const result = await this.direct.run(work);
    this.trail.calls.push("commit");
    return result;
  }
}

class TrailPublisher extends RecordingPublisher {
  constructor(private readonly trail: Trail) {
    super();
  }

  override publish(event: object): void {
    this.trail.calls.push("event");
    super.publish(event);
  }
}

interface Doubles {
  readonly handler: DeclareMyEstablishmentHandler;
  readonly trail: Trail;
  readonly events: RecordingPublisher;
}

function doubles(options: { stored?: UserProfileRecord | null; attached?: boolean } = {}): Doubles {
  const trail = new Trail();
  const events = new TrailPublisher(trail);
  const stored = options.stored === undefined ? PROVISIONED : options.stored;
  const handler = new DeclareMyEstablishmentHandler(
    new TrailProfiles(trail, stored),
    new TrailCompanies(trail),
    new TrailLock(trail, options.attached === true),
    new TrailUnitOfWork(trail),
    events,
  );
  return { handler, trail, events };
}

function command(
  overrides: Partial<DeclareMyEstablishmentCommand> = {},
): DeclareMyEstablishmentCommand {
  return new DeclareMyEstablishmentCommand(
    overrides.userId ?? "user_1",
    overrides.firstName ?? "Camille",
    overrides.lastName ?? "Rousseau",
    overrides.phone ?? "01 42 71 08 44",
    overrides.enseigne ?? "Le Pain Quotidien du Marais",
  );
}

describe("DeclareMyEstablishmentHandler", () => {
  it("verrouille, pose le profil PUIS la société, et publie après le commit", async () => {
    const { handler, trail } = doubles();

    await expect(handler.execute(command())).resolves.toBe("company_new");

    expect(trail.calls).toEqual(["lock", "profile", "company", "commit", "event"]);
  });

  it("fait de la personne le détenteur, et du profil le contact de la société", async () => {
    const { handler, trail } = doubles();

    await handler.execute(command());

    const [declared] = trail.declared;
    expect(declared?.ownerUserId).toBe("user_1");
    expect(declared?.company.enseigne).toBe("Le Pain Quotidien du Marais");
    expect(declared?.company.toPersistence().contact).toMatchObject({
      firstName: "Camille",
      lastName: "Rousseau",
      email: "camille@pqmarais.fr",
      phone: "01 42 71 08 44",
    });
  });

  it("publie la déclaration par le client lui-même (`self`)", async () => {
    const { handler, events } = doubles();

    await handler.execute(command());

    expect(events.published).toEqual([new CompanyDeclaredEvent("company_new", "self", "user_1")]);
  });

  it("garde l'adresse du compte : rien à propager à Auth0, preuve intacte", async () => {
    // Le handler n'a pas de port d'identité : ce que ce test garde, c'est que
    // le profil posé n'annonce aucun changement d'adresse — sans quoi la
    // persistance ferait retomber la vérification.
    const { handler, trail } = doubles();

    await handler.execute(command());

    expect(trail.saved[0]?.email.value).toBe("camille@pqmarais.fr");
    expect(trail.saved[0]?.emailChanged).toBe(false);
  });

  it("refuse un second rattachement, sans rien écrire ni publier", async () => {
    const { handler, trail, events } = doubles({ attached: true });

    const refusal = handler.execute(command());

    await expect(refusal).rejects.toBeInstanceOf(PersonAlreadyAttachedError);
    await expect(refusal).rejects.toThrow("Votre compte est déjà rattaché à un établissement.");
    expect(trail.calls).toEqual(["lock"]);
    expect(events.published).toEqual([]);
  });

  it.each([
    ["un nom vide", { lastName: "  " }, InvalidPersonNameError],
    ["un prénom vide", { firstName: "" }, InvalidPersonNameError],
    ["un téléphone qui n'en est pas un", { phone: "01 42" }, InvalidPhoneError],
    ["une enseigne vide", { enseigne: " " }, DomainError],
  ])("refuse %s avant d'ouvrir la transaction", async (_case, overrides, errorType) => {
    const { handler, trail, events } = doubles();

    await expect(handler.execute(command(overrides))).rejects.toBeInstanceOf(errorType);

    expect(trail.calls).toEqual([]);
    expect(events.published).toEqual([]);
  });

  it("dit lequel des deux noms manque", async () => {
    const { handler } = doubles();

    await expect(handler.execute(command({ lastName: "" }))).rejects.toThrow(/Nom/u);
  });

  it("refuse une personne dont le profil n'existe pas", async () => {
    const { handler, trail } = doubles({ stored: null });

    await expect(handler.execute(command())).rejects.toBeInstanceOf(UserProfileNotFoundError);
    expect(trail.calls).toEqual([]);
  });
});
