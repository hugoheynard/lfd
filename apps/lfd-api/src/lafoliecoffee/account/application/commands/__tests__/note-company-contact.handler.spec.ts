import { randomUUID } from "node:crypto";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { Company } from "../../../domain/entities/company.js";
import { CompanyNotFoundError } from "../../../domain/errors/account-errors.js";
import { NotedContactInFutureError } from "../../../domain/errors/noted-contact-errors.js";
import { CompanyRepository } from "../../../domain/ports/company.repository.js";
import { NoteCompanyContactCommand } from "../note-company-contact.command.js";
import { NoteCompanyContactHandler } from "../note-company-contact.handler.js";

// L'horloge est fixée : 23 h 30 UTC le 14 est déjà le 15 à Paris. Les jours
// de la fixture ne sont comparés qu'à cette horloge-là, jamais au mur.
const NOW = new Date("2026-11-14T23:30:00.000Z");
const PARIS_TODAY = "2026-11-15";
const ENSEIGNE = "Marais Café";

function company(): Company {
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
  });
}

/** Port d'écriture doublé : rend la société donnée, et compte les écritures — il n'y en a aucune. */
class StoredCompanies extends CompanyRepository {
  saves = 0;

  constructor(private readonly stored: Company | null) {
    super();
  }
  existsBySiret(): Promise<boolean> {
    return Promise.resolve(false);
  }
  load(): Promise<Company | null> {
    return Promise.resolve(this.stored);
  }
  save(): Promise<void> {
    this.saves += 1;
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

function setup(stored: Company | null = company()) {
  const companies = new StoredCompanies(stored);
  const events = new RecordingPublisher();
  const handler = new NoteCompanyContactHandler(
    companies,
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
    inMemoryIntents(),
  );
  return { companies, events, handler };
}

function command(over: { date?: string; note?: string; key?: string; companyId?: string } = {}) {
  return new NoteCompanyContactCommand(
    over.companyId ?? "c1",
    "phone",
    over.date ?? PARIS_TODAY,
    over.note,
    "staff_1",
    over.key ?? randomUUID(),
  );
}

describe("noter un contact", () => {
  it("écrit le fait au journal, avec la note, sans toucher la société", async () => {
    const { companies, events, handler } = setup();

    await handler.execute(command({ note: "  rappelle lundi  " }));

    expect(events.factTypes()).toEqual(["company.contacted"]);
    expect(events.traced[0]?.journalFact()).toEqual({
      type: "company.contacted",
      subjectType: "company",
      subjectId: "c1",
      payload: { subjectLabel: ENSEIGNE, mode: "phone", date: PARIS_TODAY, note: "rappelle lundi" },
    });
    expect(companies.saves).toBe(0);
  });

  it("n'écrit pas de note quand il n'y en a pas", async () => {
    const { events, handler } = setup();

    await handler.execute(command());

    expect(events.traced[0]?.journalFact().payload).toEqual({
      subjectLabel: ENSEIGNE,
      mode: "phone",
      date: PARIS_TODAY,
    });
  });

  it("juge « aujourd'hui » au jour de Paris, pas au jour UTC", async () => {
    const { events, handler } = setup();

    await handler.execute(command({ date: PARIS_TODAY }));

    expect(events.traced).toHaveLength(1);
  });

  it("refuse un contact daté de demain, et n'écrit rien", async () => {
    const { events, handler } = setup();

    await expect(handler.execute(command({ date: "2026-11-16" }))).rejects.toBeInstanceOf(
      NotedContactInFutureError,
    );
    expect(events.traced).toEqual([]);
  });

  it("refuse une société inconnue", async () => {
    const { events, handler } = setup(null);

    await expect(handler.execute(command())).rejects.toBeInstanceOf(CompanyNotFoundError);
    expect(events.traced).toEqual([]);
  });

  it("ne note qu'une fois par intention", async () => {
    const { events, handler } = setup();
    const key = randomUUID();

    await handler.execute(command({ key }));
    await handler.execute(command({ key }));

    expect(events.traced).toHaveLength(1);
  });
});
