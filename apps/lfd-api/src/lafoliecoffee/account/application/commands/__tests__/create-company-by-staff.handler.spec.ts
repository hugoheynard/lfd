import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import type { Company } from "../../../domain/entities/company.js";
import {
  InvalidEmailError,
  SiretAlreadyRegisteredError,
} from "../../../domain/errors/account-errors.js";
import { CompanyDeclaredEvent } from "../../../domain/events/company-declared.event.js";
import { CompanyRepository } from "../../../domain/ports/company.repository.js";
import type { ContactDetailsInput } from "../../../domain/value-objects/contact-details.js";
import {
  MailSubjectDeliveries,
  type SubjectMail,
} from "../../../../../mail/channels/deliveries/mail-subject-deliveries.js";
import type { MailSubjectType } from "../../../../../mail/channels/requests/mail-subject.js";
import {
  CompanyMemberReader,
  type CompanyMemberRecord,
} from "../../../domain/ports/company-member.repository.js";
import { CompanyOpeningReplay } from "../../services/company-opening-replay.js";
import {
  AccountAccessGranter,
  type AccessGranted,
  type AccessToGrant,
} from "../../services/grant-account-access.service.js";
import { CreateCompanyByStaffCommand } from "../create-company-by-staff.command.js";
import { CreateCompanyByStaffHandler } from "../create-company-by-staff.handler.js";

/** Publisher doublé : capture les événements publiés (extension du port, sans cast). */
/** Accès doublé : capture la demande, ou échoue pour simuler un canal absent. */
class FakeAccess extends AccountAccessGranter {
  readonly granted: AccessToGrant[] = [];
  constructor(readonly outcome: AccessGranted | Error) {
    super();
  }

  grant(input: AccessToGrant): Promise<AccessGranted> {
    this.granted.push(input);
    return this.outcome instanceof Error
      ? Promise.reject(this.outcome)
      : Promise.resolve(this.outcome);
  }
}

/**
 * Unité de travail doublée qui observe son périmètre : les écritures faites
 * dedans ne sont gardées (`committed`) que si le travail aboutit, comme une
 * transaction qui valide ou annule.
 */
class ScopedUnitOfWork extends UnitOfWork {
  readonly committed: Company[] = [];
  private pending: Company[] | null = null;

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.pending = [];
    try {
      const result = await work();
      this.committed.push(...this.pending);
      return result;
    } finally {
      this.pending = null;
    }
  }

  /** Écrit dans l'unité en cours ; hors unité, l'écriture serait gardée telle quelle. */
  write(company: Company): void {
    if (this.pending === null) {
      this.committed.push(company);
      return;
    }
    this.pending.push(company);
  }
}

/** Les membres tels que l'accès doublé les a laissés : un détenteur s'il a abouti. */
class MembersLeftBy extends CompanyMemberReader {
  constructor(private readonly access: FakeAccess) {
    super();
  }

  listOf(): Promise<readonly CompanyMemberRecord[]> {
    const outcome = this.access.outcome;
    if (this.access.granted.length === 0 || outcome instanceof Error) {
      return Promise.resolve([]);
    }
    return Promise.resolve([
      {
        userId: outcome.userId,
        email: "camille@halles.fr",
        firstName: "Camille",
        lastName: "Rousseau",
        phone: "",
        role: "owner",
        status: "invited",
        joinedAt: new Date(0),
      },
    ]);
  }
}

/** Le suivi tel que l'accès doublé l'a laissé : un e-mail accepté s'il est parti. */
class MailsLeftBy extends MailSubjectDeliveries {
  constructor(private readonly access: FakeAccess) {
    super();
  }

  forSubjects(
    _type: MailSubjectType,
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, readonly SubjectMail[]>> {
    const outcome = this.access.outcome;
    if (outcome instanceof Error || !outcome.mailSent) {
      return Promise.resolve(new Map());
    }
    const mail: SubjectMail = {
      requestId: "mail_1",
      template: "customer.access-opened",
      requestedAt: new Date(0),
      state: "accepted",
      delivery: null,
      deliveryAt: null,
    };
    return Promise.resolve(new Map(ids.map((id) => [id, [mail]])));
  }
}

interface Doubles {
  readonly handler: CreateCompanyByStaffHandler;
  readonly access: FakeAccess;
  /** Les sociétés passées à `declareUnowned` (donc créées sans propriétaire). */
  readonly unowned: Company[];
  /** Vrai si une écriture **avec** propriétaire a eu lieu (ne doit jamais arriver). */
  readonly owned: { count: number };
  readonly events: RecordingPublisher;
  readonly uow: ScopedUnitOfWork;
}

function doubles(
  options: { siretTaken?: boolean; access?: AccessGranted | Error; failAfterWrite?: boolean } = {},
): Doubles {
  const uow = new ScopedUnitOfWork();
  const unowned: Company[] = [];
  const owned = { count: 0 };

  const companies: CompanyRepository = {
    load: () => Promise.resolve(null),
    save: () => Promise.resolve(),
    existsBySiret: () => Promise.resolve(options.siretTaken === true),
    declareOwnedBy: () => {
      owned.count += 1;
      return Promise.resolve("company_owned");
    },
    declareUnowned: (company) => {
      unowned.push(company);
      uow.write(company);
      return options.failAfterWrite === true
        ? Promise.reject(new Error("écriture interrompue"))
        : Promise.resolve("company_unowned");
    },
    kbisLocation: () => Promise.resolve(null),
  };

  const events = new RecordingPublisher();
  const access = new FakeAccess(
    options.access ?? { userId: "user_1", outcome: "identity_created", mailSent: true },
  );
  return {
    handler: new CreateCompanyByStaffHandler(
      companies,
      access,
      events,
      inMemoryIntents(),
      uow,
      new CompanyOpeningReplay(new MembersLeftBy(access), new MailsLeftBy(access)),
    ),
    access,
    unowned,
    owned,
    events,
    uow,
  };
}

/** La même commande, **sans** détenteur : l'ouverture sur la seule enseigne. */
function commandWithoutHolder(): CreateCompanyByStaffCommand {
  return new CreateCompanyByStaffCommand(
    "",
    "Café des Halles",
    "",
    "",
    "",
    "",
    null,
    "staff-sub",
    INTENT,
  );
}

function command(contact: Partial<ContactDetailsInput> = {}): CreateCompanyByStaffCommand {
  return new CreateCompanyByStaffCommand(
    "Café des Halles SAS",
    "Café des Halles",
    "SAS",
    "812 456 789 00021",
    "",
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
    INTENT,
  );
}

const INTENT = "0b7f6f0e-8a52-4c1e-9d43-0d8e5f0a1b2c";

describe("CreateCompanyByStaffHandler", () => {
  /**
   * Régression (revue de S2, cas 4) : un double clic sur « Créer » rejouait
   * tout le geste — le second se faisait refuser au SIRET après un second
   * e-mail d'accès.
   */
  it("un second clic de même intention rend la société du premier, sans rien rejouer", async () => {
    const { handler, unowned, access } = doubles();

    const first = await handler.execute(command());
    await expect(handler.execute(command())).resolves.toEqual(first);
    expect(unowned).toHaveLength(1);
    expect(access.granted).toHaveLength(1);
  });

  /** Régression : sans SIRET, rien ne refusait le rejeu d'une création — il déclarait une seconde société. */
  it("un rejeu sans SIRET rend la même société, sans en déclarer une seconde", async () => {
    const { handler, unowned } = doubles();

    const first = await handler.execute(commandWithoutHolder());
    await expect(handler.execute(commandWithoutHolder())).resolves.toEqual(first);
    expect(unowned).toHaveLength(1);
  });

  it("crée la société SANS propriétaire et retourne son seul identifiant", async () => {
    const { handler, unowned, owned } = doubles();

    await expect(handler.execute(command())).resolves.toMatchObject({ id: "company_unowned" });
    expect(unowned).toHaveLength(1);
    expect(unowned[0]?.declaredVia).toBe("staff");
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
    expect(declared.owner).toBeNull();
  });

  it("porte le contact saisi par le staff, fonction incluse", async () => {
    const { handler, unowned } = doubles();

    await handler.execute(command());

    expect(unowned[0]?.contact?.email.value).toBe("camille@halles.fr");
    expect(unowned[0]?.contact?.fonction).toBe("Gérante");
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

  it("ouvre le compte sur la SEULE enseigne, sans détenteur", async () => {
    // Le commercial a le client au téléphone et n'a que le nom de la maison :
    // exiger une adresse ici ferait perdre l'appel, alors que le rattachement
    // se fait très bien le lendemain.
    const { handler, unowned, access } = doubles();

    await expect(handler.execute(commandWithoutHolder())).resolves.toEqual({
      id: "company_unowned",
      holder: "deferred",
      mailSent: false,
    });
    expect(unowned[0]?.contact).toBeNull();
    // RIEN n'est tenté auprès du fournisseur d'identité : il n'y a pas
    // d'adresse, donc pas d'accès à ouvrir — et surtout pas d'incident à
    // annoncer.
    expect(access.granted).toEqual([]);
  });

  it("un rejeu après un accès en panne relit « failed », sans retenter l'accès", async () => {
    const { handler, access } = doubles({ access: new Error("canal indisponible") });

    const first = await handler.execute(command());
    await expect(handler.execute(command())).resolves.toEqual(first);
    expect(first.holder).toBe("failed");
    expect(access.granted).toHaveLength(1);
  });

  it("distingue « pas de détenteur » d'un canal d'identité en panne", async () => {
    // Les deux laissent le compte sans accès, mais l'un est un choix et l'autre
    // une panne : les confondre ferait annoncer un incident au client.
    const { handler } = doubles({ access: new Error("canal indisponible") });

    await expect(handler.execute(command())).resolves.toMatchObject({ holder: "failed" });
  });

  /** Régression : la déclaration écrivait hors de toute unité de travail, une panne y laissait une société à moitié écrite. */
  it("une écriture qui échoue dans la déclaration ne laisse aucune société, ni fait, ni accès", async () => {
    const { handler, uow, events, access } = doubles({ failAfterWrite: true });

    await expect(handler.execute(command())).rejects.toThrow("écriture interrompue");
    expect(uow.committed).toEqual([]);
    expect(events.published).toEqual([]);
    expect(access.granted).toEqual([]);
  });

  it("garde la société une fois la déclaration validée", async () => {
    const { handler, uow } = doubles();

    await handler.execute(command());
    expect(uow.committed).toHaveLength(1);
  });
});
