import { DomainEventPublisher } from "../../../../../platform/events/domain-event-publisher.js";
import type { Company } from "../../../domain/entities/company.js";
import {
  SiretAlreadyRegisteredError,
  UserProfileNotFoundError,
} from "../../../domain/errors/account-errors.js";
import { CompanyDeclaredEvent } from "../../../domain/events/company-declared.event.js";
import { CompanyRepository } from "../../../domain/ports/company.repository.js";
import {
  UserProfileRepository,
  type UserProfileRecord,
} from "../../../domain/ports/user-profile.repository.js";
import { CreateCompanyCommand } from "../create-company.command.js";
import { CreateCompanyHandler } from "../create-company.handler.js";

const OWNER: UserProfileRecord = {
  userId: "user_1",
  firstName: "Camille",
  lastName: "Rousseau",
  email: "camille@pqmarais.fr",
  phone: "01 42 71 08 44",
};

/** Publisher doublé : capture les événements publiés (extension du port, sans cast). */
class FakeEvents extends DomainEventPublisher {
  readonly published: object[] = [];
  publish(event: object): void {
    this.published.push(event);
  }
}

interface Doubles {
  readonly handler: CreateCompanyHandler;
  readonly declared: { company: Company; ownerUserId: string }[];
  readonly events: FakeEvents;
}

function doubles(
  options: { owner?: UserProfileRecord | null; siretTaken?: boolean } = {},
): Doubles {
  const declared: { company: Company; ownerUserId: string }[] = [];

  const companies: CompanyRepository = {
    existsBySiret: () => Promise.resolve(options.siretTaken === true),
    declareOwnedBy: (company, ownerUserId) => {
      declared.push({ company, ownerUserId });
      return Promise.resolve("company_new");
    },
    declareUnowned: () => Promise.resolve("company_new"),
    updatePrimaryContact: () => Promise.resolve(),
    saveKbisMetadata: () => Promise.resolve(),
    kbisLocation: () => Promise.resolve(null),
  };

  const profiles: UserProfileRepository = {
    findById: () => Promise.resolve(options.owner === undefined ? OWNER : options.owner),
    findIdByEmail: () => Promise.resolve(null),
    save: () => Promise.resolve(),
  };

  const events = new FakeEvents();
  return { handler: new CreateCompanyHandler(companies, profiles, events), declared, events };
}

function command(overrides: Partial<CreateCompanyCommand> = {}): CreateCompanyCommand {
  return new CreateCompanyCommand(
    overrides.ownerUserId ?? "user_1",
    overrides.raisonSociale ?? "Boulangerie du Marais SAS",
    overrides.enseigne ?? "Le Pain Quotidien",
    overrides.formeJuridique ?? "SAS",
    overrides.siret ?? "812 456 789 00021",
    overrides.tvaIntracom ?? "",
  );
}

describe("CreateCompanyHandler", () => {
  it("déclare la société et retourne son seul identifiant", async () => {
    const { handler, declared } = doubles();

    // Une commande ne renvoie pas de modèle de lecture : le client relit ensuite.
    await expect(handler.execute(command())).resolves.toBe("company_new");
    expect(declared).toHaveLength(1);
  });

  it("publie CompanyDeclaredEvent via `self` (signal adoption+)", async () => {
    const { handler, events } = doubles();

    await handler.execute(command());

    expect(events.published).toHaveLength(1);
    const [event] = events.published;
    expect(event).toBeInstanceOf(CompanyDeclaredEvent);
    const declared = event as CompanyDeclaredEvent;
    expect(declared.companyId).toBe("company_new");
    expect(declared.via).toBe("self");
    expect(declared.ownerUserId).toBe("user_1");
  });

  it("ne publie rien si le SIRET est déjà pris (échec avant persistance)", async () => {
    const { handler, events } = doubles({ siretTaken: true });
    await expect(handler.execute(command())).rejects.toBeInstanceOf(SiretAlreadyRegisteredError);
    expect(events.published).toEqual([]);
  });

  it("reprend le profil du créateur comme contact de la société", async () => {
    const { handler, declared } = doubles();

    await handler.execute(command());

    expect(declared[0]?.company.contact.email.value).toBe("camille@pqmarais.fr");
    expect(declared[0]?.ownerUserId).toBe("user_1");
  });

  it("refuse un SIRET déjà enregistré", async () => {
    const { handler, declared } = doubles({ siretTaken: true });

    await expect(handler.execute(command())).rejects.toBeInstanceOf(SiretAlreadyRegisteredError);
    expect(declared).toEqual([]);
  });

  it("refuse de créer pour un profil inexistant", async () => {
    const { handler } = doubles({ owner: null });

    await expect(handler.execute(command())).rejects.toBeInstanceOf(UserProfileNotFoundError);
  });

  it("refuse un profil de créateur incomplet plutôt que de créer un contact vide", async () => {
    // Les colonnes de profil sont arrivées avec des défauts vides : un compte
    // ancien peut donc n'avoir ni prénom ni nom. Mieux vaut un refus explicite
    // qu'une société dont le contact est une chaîne vide.
    const { handler } = doubles({ owner: { ...OWNER, firstName: "", lastName: "" } });

    await expect(handler.execute(command())).rejects.toThrow(/Prénom du contact/u);
  });
});
