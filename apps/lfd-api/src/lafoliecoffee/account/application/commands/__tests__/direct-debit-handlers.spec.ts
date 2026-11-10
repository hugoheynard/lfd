import type { DeferredTerm } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { Company } from "../../../domain/entities/company.js";
import { CompanyNotFoundError } from "../../../domain/errors/account-errors.js";
import {
  DirectDebitAlreadyBlockedError,
  DirectDebitNotBlockedError,
} from "../../../domain/errors/direct-debit-errors.js";
import { CompanyRepository } from "../../../domain/ports/company.repository.js";
import { DirectDebitBlock } from "../../../domain/value-objects/direct-debit-block.js";
import { BlockDirectDebitCommand } from "../block-direct-debit.command.js";
import { BlockDirectDebitHandler } from "../block-direct-debit.handler.js";
import { UnblockDirectDebitCommand } from "../unblock-direct-debit.command.js";
import { UnblockDirectDebitHandler } from "../unblock-direct-debit.handler.js";

// L'instant du blocage est relu tel quel, jamais comparé à l'horloge murale.
const NOW = new Date("2026-09-25T09:00:00.000Z");
const ENSEIGNE = "Marais Café";

function company(
  grantedTerms: readonly DeferredTerm[],
  directDebitBlock: DirectDebitBlock | null = null,
): Company {
  return Company.reconstitute({
    id: "c1",
    raisonSociale: "PQ Marais",
    enseigne: ENSEIGNE,
    formeJuridique: "SAS",
    siret: "81245678900021",
    vatNumber: "",
    contact: null,
    grantedTerms,
    requestedTerm: null,
    status: "active",
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
    directDebitBlock,
  });
}

/** Port d'écriture doublé : rend la société donnée et capture ce qui est sauvé. */
class RecordingCompanies extends CompanyRepository {
  saved: Company | null = null;

  constructor(private readonly stored: Company | null) {
    super();
  }
  existsBySiret(): Promise<boolean> {
    return Promise.resolve(false);
  }
  load(): Promise<Company | null> {
    return Promise.resolve(this.stored);
  }
  save(aggregate: Company): Promise<void> {
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

function blockHandler(companies: CompanyRepository, events: RecordingPublisher) {
  return new BlockDirectDebitHandler(
    companies,
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
  );
}

describe("BlockDirectDebitHandler", () => {
  it("bloque, sauve la société datée par l'horloge et inscrit le fait avec la raison", async () => {
    const companies = new RecordingCompanies(company(["monthly"]));
    const events = new RecordingPublisher();

    await blockHandler(companies, events).execute(
      new BlockDirectDebitCommand("c1", "staff_compta", "  Rejet SEPA d'août  "),
    );

    const block = companies.saved?.toPersistence().directDebitBlock;
    expect(block).toMatchObject({
      blockedAt: NOW,
      blockedBy: "staff_compta",
      reason: "Rejet SEPA d'août",
    });
    expect(events.factTypes()).toEqual(["company.direct_debit_blocked"]);
    expect(events.traced[0]?.journalFact().payload).toEqual({
      subjectLabel: ENSEIGNE,
      reason: "Rejet SEPA d'août",
    });
  });

  it("refus de l'agrégat : rien n'est sauvé, rien n'est inscrit", async () => {
    const companies = new RecordingCompanies(
      company(["monthly"], DirectDebitBlock.reconstitute(NOW, "staff_1", "Impayé")),
    );
    const events = new RecordingPublisher();

    await expect(
      blockHandler(companies, events).execute(
        new BlockDirectDebitCommand("c1", "staff_2", "Autre"),
      ),
    ).rejects.toBeInstanceOf(DirectDebitAlreadyBlockedError);
    expect(companies.saved).toBeNull();
    expect(events.factTypes()).toEqual([]);
  });

  it("société inconnue : 404", async () => {
    await expect(
      blockHandler(new RecordingCompanies(null), new RecordingPublisher()).execute(
        new BlockDirectDebitCommand("c404", "staff_1", "Rejet"),
      ),
    ).rejects.toBeInstanceOf(CompanyNotFoundError);
  });
});

describe("UnblockDirectDebitHandler", () => {
  it("débloque, sauve et inscrit le fait", async () => {
    const companies = new RecordingCompanies(
      company(["monthly"], DirectDebitBlock.reconstitute(NOW, "staff_1", "Impayé")),
    );
    const events = new RecordingPublisher();

    await new UnblockDirectDebitHandler(companies, events, new DirectUnitOfWork()).execute(
      new UnblockDirectDebitCommand("c1"),
    );

    expect(companies.saved?.toPersistence().directDebitBlock).toBeNull();
    expect(companies.saved?.settlesOnAccount()).toBe(true);
    expect(events.factTypes()).toEqual(["company.direct_debit_unblocked"]);
    expect(events.traced[0]?.journalFact().payload).toEqual({ subjectLabel: ENSEIGNE });
  });

  it("rien de bloqué : 409, rien d'écrit", async () => {
    const companies = new RecordingCompanies(company(["monthly"]));
    const events = new RecordingPublisher();

    await expect(
      new UnblockDirectDebitHandler(companies, events, new DirectUnitOfWork()).execute(
        new UnblockDirectDebitCommand("c1"),
      ),
    ).rejects.toBeInstanceOf(DirectDebitNotBlockedError);
    expect(companies.saved).toBeNull();
    expect(events.factTypes()).toEqual([]);
  });
});
