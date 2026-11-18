import {
  ChorusRoutingNotPublicError,
  CompanyNotFoundError,
} from "../../../domain/errors/account-errors.js";
import { Company } from "../../../domain/entities/company.js";
import { ChorusRoutingRepository } from "../../../domain/ports/chorus-routing.repository.js";
import { CompanyRepository, type KbisLocation } from "../../../domain/ports/company.repository.js";
import { StaffDirectory, type StaffIdentity } from "../../../domain/ports/staff-directory.js";
import type { ChorusRouting } from "../../../domain/value-objects/chorus-routing.js";
import { RecordChorusRoutingCommand } from "../record-chorus-routing.command.js";
import { RecordChorusRoutingHandler } from "../record-chorus-routing.handler.js";

const READING = {
  commitmentRequired: true,
  serviceCodeRequired: true,
  defaultServiceCode: "SERVICE-A",
  checkedOn: "2026-11-01",
};

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

function handlerFor(target: Company | null, routings = new InMemoryRoutings()) {
  return {
    handler: new RecordChorusRoutingHandler(new OneCompany(target), routings, new KnownStaff()),
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
});
