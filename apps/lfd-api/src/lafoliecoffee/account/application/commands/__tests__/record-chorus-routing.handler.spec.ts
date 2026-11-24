import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import {
  ChorusRoutingNotPublicError,
  CompanyNotFoundError,
} from "../../../domain/errors/account-errors.js";
import { Company } from "../../../domain/entities/company.js";
import { ChorusRoutingRepository } from "../../../domain/ports/chorus-routing.repository.js";
import { CompanyRepository, type KbisLocation } from "../../../domain/ports/company.repository.js";
import { StaffDirectory, type StaffIdentity } from "../../../domain/ports/staff-directory.js";
import { PayerLiveMercurialeReader } from "../../../domain/ports/payer-live-mercuriale.reader.js";
import { PayerUninvoicedOrdersReader } from "../../../domain/ports/payer-uninvoiced-orders.reader.js";
import {
  ChorusRoutingQuoteWithoutMercurialeError,
  ChorusRoutingTimingLockedError,
} from "../../../domain/errors/chorus-routing-errors.js";
import { ChorusRouting } from "../../../domain/value-objects/chorus-routing.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { RecordChorusRoutingCommand } from "../record-chorus-routing.command.js";
import { RecordChorusRoutingHandler } from "../record-chorus-routing.handler.js";

const READING = {
  commitmentRequired: true,
  serviceCodeRequired: true,
  defaultServiceCode: "SERVICE-A",
  commitmentTiming: "at_order" as const,
  checkedOn: "2026-11-01",
};

class Mercuriales extends PayerLiveMercurialeReader {
  readonly asked: string[] = [];
  constructor(private readonly live: boolean) {
    super();
  }
  hasLiveMercuriale(companyId: string): Promise<boolean> {
    this.asked.push(companyId);
    return Promise.resolve(this.live);
  }
}

class Uninvoiced extends PayerUninvoicedOrdersReader {
  readonly asked: string[] = [];
  constructor(private readonly pending: boolean) {
    super();
  }
  hasUninvoicedOrders(payerCompanyId: string): Promise<boolean> {
    this.asked.push(payerCompanyId);
    return Promise.resolve(this.pending);
  }
}

function company(formeJuridique: string): Company {
  return Company.reconstitute({
    id: "c1",
    raisonSociale: "Ministère des Armées",
    enseigne: "Base aérienne 701",
    formeJuridique,
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
  });
}

class OneCompany extends CompanyRepository {
  constructor(private readonly company: Company | null) {
    super();
  }
  existsBySiret(): Promise<boolean> {
    return Promise.resolve(false);
  }
  load(): Promise<Company | null> {
    return Promise.resolve(this.company);
  }
  save(): Promise<void> {
    return Promise.reject(new TypeError("la société ne se réécrit pas pour une fiche Chorus"));
  }
  declareOwnedBy(): Promise<string> {
    return Promise.resolve("c");
  }
  declareUnowned(): Promise<string> {
    return Promise.resolve("c");
  }
  kbisLocation(): Promise<KbisLocation | null> {
    return Promise.resolve(null);
  }
}

class InMemoryRoutings extends ChorusRoutingRepository {
  readonly saved: { companyId: string; routing: ChorusRouting }[] = [];
  constructor(private stored: ChorusRouting | null = null) {
    super();
  }
  load(): Promise<ChorusRouting | null> {
    return Promise.resolve(this.stored);
  }
  save(companyId: string, routing: ChorusRouting): Promise<void> {
    this.saved.push({ companyId, routing });
    this.stored = routing;
    return Promise.resolve();
  }
}

class KnownStaff extends StaffDirectory {
  identify(reference: string): Promise<StaffIdentity | null> {
    return Promise.resolve(
      reference === "staff_1" ? { name: "Camille", role: "commercial" } : null,
    );
  }
}

function handlerFor(
  target: Company | null,
  routings = new InMemoryRoutings(),
  facts: { live?: boolean; pending?: boolean } = {},
) {
  const events = new RecordingPublisher();
  const uninvoiced = new Uninvoiced(facts.pending ?? false);
  return {
    events,
    uninvoiced,
    handler: new RecordChorusRoutingHandler(
      new OneCompany(target),
      routings,
      new KnownStaff(),
      events,
      new DirectUnitOfWork(),
      new Mercuriales(facts.live ?? true),
      uninvoiced,
      new FixedClock(new Date(0)),
    ),
    routings,
  };
}

describe("RecordChorusRoutingHandler", () => {
  it("range la fiche d'un organisme public, signée par l'agent", async () => {
    const { handler, routings } = handlerFor(company("public_state"));

    await handler.execute(new RecordChorusRoutingCommand("c1", "staff_1", READING));

    expect(routings.saved).toHaveLength(1);
    expect(routings.saved[0]?.companyId).toBe("c1");
    expect(routings.saved[0]?.routing.checkedBy).toEqual({
      staffUserId: "staff_1",
      name: "Camille",
      role: "commercial",
    });
  });

  it("journalise le relevé sur la société, avec ce qui a été lu", async () => {
    const { handler, events } = handlerFor(company("public_state"));

    await handler.execute(new RecordChorusRoutingCommand("c1", "staff_1", READING));
    const payload: unknown = expect.objectContaining(READING);

    expect(events.traced.map((event) => event.journalFact())).toEqual([
      expect.objectContaining({
        type: "company.chorus_routing_recorded",
        subjectId: "c1",
        payload,
      }),
    ]);
  });

  it("garde l'identifiant seul d'un agent que l'annuaire ne connaît pas", async () => {
    const { handler, routings } = handlerFor(company("public_state"));

    await handler.execute(new RecordChorusRoutingCommand("c1", "inconnu", READING));

    expect(routings.saved[0]?.routing.checkedBy).toEqual({
      staffUserId: "inconnu",
      name: "",
      role: "",
    });
  });

  it("n'écrit rien quand le même relevé est reposé, même par un autre agent", async () => {
    const { handler, routings } = handlerFor(company("public_establishment"));
    await handler.execute(new RecordChorusRoutingCommand("c1", "staff_1", READING));

    await handler.execute(new RecordChorusRoutingCommand("c1", "inconnu", READING));

    expect(routings.saved).toHaveLength(1);
    expect(routings.saved[0]?.routing.checkedBy.name).toBe("Camille");
  });

  it("réécrit la fiche quand le relevé change", async () => {
    const { handler, routings } = handlerFor(company("public_establishment"));
    await handler.execute(new RecordChorusRoutingCommand("c1", "staff_1", READING));

    await handler.execute(
      new RecordChorusRoutingCommand("c1", "staff_1", { ...READING, commitmentRequired: false }),
    );

    expect(routings.saved).toHaveLength(2);
  });

  it("refuse une entreprise sans rien écrire", async () => {
    const { handler, routings } = handlerFor(company("SAS"));

    await expect(
      handler.execute(new RecordChorusRoutingCommand("c1", "staff_1", READING)),
    ).rejects.toThrow(ChorusRoutingNotPublicError);
    expect(routings.saved).toHaveLength(0);
  });

  it("dit 404 sur une société inconnue", async () => {
    const { handler } = handlerFor(null);

    await expect(
      handler.execute(new RecordChorusRoutingCommand("absente", "staff_1", READING)),
    ).rejects.toThrow(CompanyNotFoundError);
  });

  it("passe au devis de période : mercuriale active, tout facturé", async () => {
    const { handler, routings } = handlerFor(company("public_state"));

    await handler.execute(
      new RecordChorusRoutingCommand("c1", "staff_1", {
        ...READING,
        commitmentTiming: "on_period_quote",
      }),
    );

    expect(routings.saved[0]?.routing.commitmentTiming).toBe("on_period_quote");
  });

  it("refuse le devis de période sans mercuriale active, sans rien écrire", async () => {
    const { handler, routings } = handlerFor(company("public_state"), undefined, { live: false });

    await expect(
      handler.execute(
        new RecordChorusRoutingCommand("c1", "staff_1", {
          ...READING,
          commitmentTiming: "on_period_quote",
        }),
      ),
    ).rejects.toThrow(ChorusRoutingQuoteWithoutMercurialeError);
    expect(routings.saved).toHaveLength(0);
  });

  it("ne demande rien à la comptabilité quand le mode ne change pas", async () => {
    const { handler, uninvoiced } = handlerFor(company("public_state"), undefined, {
      pending: true,
    });

    await handler.execute(new RecordChorusRoutingCommand("c1", "staff_1", READING));

    expect(uninvoiced.asked).toEqual([]);
  });

  it("refuse de quitter le devis de période sous une commande non facturée", async () => {
    const stored = ChorusRouting.reconstitute(
      { ...READING, commitmentTiming: "on_period_quote" },
      { staffUserId: "staff_1", name: "Camille", role: "commercial" },
    );
    const { handler, routings } = handlerFor(
      company("public_state"),
      new InMemoryRoutings(stored),
      { pending: true },
    );

    await expect(
      handler.execute(new RecordChorusRoutingCommand("c1", "staff_1", READING)),
    ).rejects.toThrow(ChorusRoutingTimingLockedError);
    expect(routings.saved).toHaveLength(0);
  });

  it("revient à la commande quand tout est facturé, et le journal porte le mode", async () => {
    const stored = ChorusRouting.reconstitute(
      { ...READING, commitmentTiming: "on_period_quote" },
      { staffUserId: "staff_1", name: "Camille", role: "commercial" },
    );
    const { handler, routings, events, uninvoiced } = handlerFor(
      company("public_state"),
      new InMemoryRoutings(stored),
    );

    await handler.execute(new RecordChorusRoutingCommand("c1", "staff_1", READING));

    expect(uninvoiced.asked).toEqual(["c1"]);
    expect(routings.saved[0]?.routing.commitmentTiming).toBe("at_order");
    const payload: unknown = expect.objectContaining({ commitmentTiming: "at_order" });
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      expect.objectContaining({ payload }),
    ]);
  });
});
