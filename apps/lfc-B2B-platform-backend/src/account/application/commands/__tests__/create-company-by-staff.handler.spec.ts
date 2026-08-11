import { DomainEventPublisher } from "../../../../infra/events/domain-event-publisher.js";
import type { Company } from "../../../domain/entities/company.js";
import {
  InvalidEmailError,
  SiretAlreadyRegisteredError,
} from "../../../domain/errors/account-errors.js";
import { CompanyDeclaredEvent } from "../../../domain/events/company-declared.event.js";
import { CompanyRepository } from "../../../domain/ports/company.repository.js";
import type { ContactDetailsInput } from "../../../domain/value-objects/contact-details.js";
import {
  AccountAccessGranter,
  type AccessGranted,
  type AccessToGrant,
} from "../../services/grant-account-access.service.js";
import { CreateCompanyByStaffCommand } from "../create-company-by-staff.command.js";
import { CreateCompanyByStaffHandler } from "../create-company-by-staff.handler.js";

/** Publisher doublé : capture les événements publiés (extension du port, sans cast). */
class FakeEvents extends DomainEventPublisher {
  readonly published: object[] = [];
  publish(event: object): void {
    this.published.push(event);
  }
}

/** Accès doublé : capture la demande, ou échoue pour simuler un canal absent. */
class FakeAccess extends AccountAccessGranter {
  readonly granted: AccessToGrant[] = [];
  constructor(private readonly outcome: AccessGranted | Error) {
    super();
  }

  grant(input: AccessToGrant): Promise<AccessGranted> {
    this.granted.push(input);
    return this.outcome instanceof Error
      ? Promise.reject(this.outcome)
      : Promise.resolve(this.outcome);
  }
}

interface Doubles {
  readonly handler: CreateCompanyByStaffHandler;
  readonly access: FakeAccess;
  /** Les sociétés passées à `declareUnowned` (donc créées sans propriétaire). */
  readonly unowned: Company[];
  /** Vrai si une écriture **avec** propriétaire a eu lieu (ne doit jamais arriver). */
  readonly owned: { count: number };
  readonly events: FakeEvents;
}

function doubles(options: { siretTaken?: boolean; access?: AccessGranted | Error } = {}): Doubles {
  const unowned: Company[] = [];
  const owned = { count: 0 };

  const companies: CompanyRepository = {
    existsBySiret: () => Promise.resolve(options.siretTaken === true),
    declareOwnedBy: () => {
      owned.count += 1;
      return Promise.resolve("company_owned");
    },
    declareUnowned: (company) => {
      unowned.push(company);
      return Promise.resolve("company_unowned");
    },
    updatePrimaryContact: () => Promise.resolve(),
    updateIdentity: () => Promise.resolve(),
    requestPaymentTerm: () => Promise.resolve(),
    saveKbisMetadata: () => Promise.resolve(),
    kbisLocation: () => Promise.resolve(null),
  };

  const events = new FakeEvents();
  const access = new FakeAccess(
    options.access ?? { userId: "user_1", identityCreated: true, mailSent: true },
  );
  return {
    handler: new CreateCompanyByStaffHandler(companies, access, events),
    access,
    unowned,
    owned,
    events,
  };
}

function command(contact: Partial<ContactDetailsInput> = {}): CreateCompanyByStaffCommand {
  return new CreateCompanyByStaffCommand(
    "Café des Halles SAS",
    "Café des Halles",
    "SAS",
    "812 456 789 00021",
    "",
    {
      firstName: "Camille",
      lastName: "Rousseau",
      fonction: "Gérante",
      email: "camille@halles.fr",
      phone: "",
      ...contact,
    },
    "staff-sub",
  );
}

describe("CreateCompanyByStaffHandler", () => {
  it("crée la société SANS propriétaire et retourne son seul identifiant", async () => {
    const { handler, unowned, owned } = doubles();

    await expect(handler.execute(command())).resolves.toMatchObject({ id: "company_unowned" });
    expect(unowned).toHaveLength(1);
    // Jamais de rattachement : pas de membership à la création admin.
    expect(owned.count).toBe(0);
  });

  it("publie CompanyDeclaredEvent via `staff`, sans propriétaire", async () => {
    const { handler, events } = doubles();

    await handler.execute(command());

    expect(events.published).toHaveLength(1);
    const [event] = events.published;
    expect(event).toBeInstanceOf(CompanyDeclaredEvent);
    const declared = event as CompanyDeclaredEvent;
    expect(declared.companyId).toBe("company_unowned");
    expect(declared.via).toBe("staff");
    expect(declared.ownerUserId).toBeNull();
  });

  it("porte le contact saisi par le staff, fonction incluse", async () => {
    const { handler, unowned } = doubles();

    await handler.execute(command());

    expect(unowned[0]?.contact.email.value).toBe("camille@halles.fr");
    expect(unowned[0]?.contact.fonction).toBe("Gérante");
  });

  it("refuse un SIRET déjà enregistré, sans rien créer", async () => {
    const { handler, unowned } = doubles({ siretTaken: true });

    await expect(handler.execute(command())).rejects.toBeInstanceOf(SiretAlreadyRegisteredError);
    expect(unowned).toEqual([]);
  });

  it("refuse un contact invalide (e-mail vide) avant tout écriture", async () => {
    const { handler, unowned } = doubles();

    await expect(handler.execute(command({ email: "" }))).rejects.toBeInstanceOf(InvalidEmailError);
    expect(unowned).toEqual([]);
  });
});
