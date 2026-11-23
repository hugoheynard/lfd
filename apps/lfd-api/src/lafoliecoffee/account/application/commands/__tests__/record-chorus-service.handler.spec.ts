import type { ChorusServicePayload, CompanyFollowAspect } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { Company } from "../../../domain/entities/company.js";
import { CompanyNotFoundError } from "../../../domain/errors/account-errors.js";
import {
  ChorusServiceCodeOnSolePayerError,
  ChorusServicePayerNotPublicError,
} from "../../../domain/errors/chorus-service-errors.js";
import { ChorusServiceRepository } from "../../../domain/ports/chorus-service.repository.js";
import { CompanyFollowsReader } from "../../../domain/ports/company-follows.reader.js";
import { CompanyRepository, type KbisLocation } from "../../../domain/ports/company.repository.js";
import { StaffDirectory, type StaffIdentity } from "../../../domain/ports/staff-directory.js";
import type { ChorusService } from "../../../domain/value-objects/chorus-service.js";
import { FollowPeriod } from "../../../domain/value-objects/follow-period.js";
import { RecordChorusServiceCommand } from "../record-chorus-service.command.js";
import { RecordChorusServiceHandler } from "../record-chorus-service.handler.js";

/** L'instant du geste n'est comparé qu'à lui-même. */
const NOW = new Date(0);
const SHEET: ChorusServicePayload = {
  serviceCode: "UNITE-TIGNES",
  commitmentNumber: "1300012345",
  commitmentEndsOn: "2026-12-31",
};

function company(id: string, formeJuridique: string): Company {
  return Company.reconstitute({
    id,
    raisonSociale: "Ministère des Armées",
    enseigne: id,
    formeJuridique,
    siret: "",
    vatNumber: "",
    contact: null,
    grantedTerms: [],
    requestedTerm: null,
    status: "active",
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
  });
}

class Companies extends CompanyRepository {
  constructor(private readonly known: readonly Company[]) {
    super();
  }
  existsBySiret(): Promise<boolean> {
    return Promise.resolve(false);
  }
  load(id: string): Promise<Company | null> {
    return Promise.resolve(this.known.find((c) => c.id === id) ?? null);
  }
  save(): Promise<void> {
    return Promise.reject(new TypeError("la société ne se réécrit pas pour une fiche de service"));
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

/** La société `unite` suit la facturation de `parentId`, ou rien. */
class BillingFollows extends CompanyFollowsReader {
  readonly asked: { companyId: string; aspect: CompanyFollowAspect; at: Date }[] = [];
  constructor(private readonly parentId: string | null) {
    super();
  }
  followsAt(
    companyId: string,
    aspect: CompanyFollowAspect,
    at: Date,
  ): Promise<FollowPeriod | null> {
    this.asked.push({ companyId, aspect, at });
    return Promise.resolve(
      this.parentId === null || aspect !== "billing"
        ? null
        : FollowPeriod.open("billing", this.parentId, NOW),
    );
  }
}

class InMemoryServices extends ChorusServiceRepository {
  readonly saved: { companyId: string; service: ChorusService }[] = [];
  private stored: ChorusService | null = null;
  load(): Promise<ChorusService | null> {
    return Promise.resolve(this.stored);
  }
  save(companyId: string, service: ChorusService): Promise<void> {
    this.saved.push({ companyId, service });
    this.stored = service;
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

function scene(known: readonly Company[], parentId: string | null) {
  const events = new RecordingPublisher();
  const services = new InMemoryServices();
  const follows = new BillingFollows(parentId);
  const handler = new RecordChorusServiceHandler(
    new Companies(known),
    follows,
    services,
    new KnownStaff(),
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
  );
  return { handler, services, events, follows };
}

const UNIT = company("unite", "");
const PUBLIC_PRINCIPAL = company("principal", "public_state");

describe("RecordChorusServiceHandler", () => {
  it("range la fiche d'une unité sous son principal public, signée par l'agent", async () => {
    const { handler, services, follows } = scene([UNIT, PUBLIC_PRINCIPAL], "principal");

    await handler.execute(new RecordChorusServiceCommand("unite", "staff_1", SHEET));

    expect(follows.asked).toEqual([{ companyId: "unite", aspect: "billing", at: NOW }]);
    expect(services.saved).toHaveLength(1);
    const saved = services.saved[0];
    expect(saved?.companyId).toBe("unite");
    expect(saved?.service.payerCompanyId).toBe("principal");
    expect(saved?.service.recordedAt).toBe(NOW);
    expect(saved?.service.recordedBy).toEqual({
      staffUserId: "staff_1",
      name: "Camille",
      role: "commercial",
    });
  });

  it("journalise la fiche sur la société, avec son payeur", async () => {
    const { handler, events } = scene([UNIT, PUBLIC_PRINCIPAL], "principal");

    await handler.execute(new RecordChorusServiceCommand("unite", "staff_1", SHEET));
    const payload: unknown = expect.objectContaining({ ...SHEET, payerCompanyId: "principal" });

    expect(events.traced.map((event) => event.journalFact())).toEqual([
      expect.objectContaining({
        type: "company.chorus_service_recorded",
        subjectId: "unite",
        payload,
      }),
    ]);
  });

  it("n'écrit rien quand la même fiche est reposée, même par un autre agent", async () => {
    const { handler, services, events } = scene([UNIT, PUBLIC_PRINCIPAL], "principal");
    await handler.execute(new RecordChorusServiceCommand("unite", "staff_1", SHEET));

    await handler.execute(new RecordChorusServiceCommand("unite", "inconnu", SHEET));

    expect(services.saved).toHaveLength(1);
    expect(events.traced).toHaveLength(1);
    expect(services.saved[0]?.service.recordedBy.name).toBe("Camille");
  });

  it("réécrit la fiche quand l'engagement est retiré", async () => {
    const { handler, services } = scene([UNIT, PUBLIC_PRINCIPAL], "principal");
    await handler.execute(new RecordChorusServiceCommand("unite", "staff_1", SHEET));

    await handler.execute(
      new RecordChorusServiceCommand("unite", "staff_1", {
        ...SHEET,
        commitmentNumber: "",
        commitmentEndsOn: null,
      }),
    );

    expect(services.saved).toHaveLength(2);
    expect(services.saved[1]?.service.currentCommitment).toBeNull();
  });

  it("refuse une unité dont le principal n'est pas public, sans rien écrire", async () => {
    const { handler, services, events } = scene([UNIT, company("principal", "SAS")], "principal");

    await expect(
      handler.execute(new RecordChorusServiceCommand("unite", "staff_1", SHEET)),
    ).rejects.toThrow(ChorusServicePayerNotPublicError);
    expect(services.saved).toHaveLength(0);
    expect(events.traced).toHaveLength(0);
  });

  it("refuse une entreprise qui est son propre payeur", async () => {
    const { handler, services } = scene([company("seul", "SAS")], null);

    await expect(
      handler.execute(new RecordChorusServiceCommand("seul", "staff_1", SHEET)),
    ).rejects.toThrow(ChorusServicePayerNotPublicError);
    expect(services.saved).toHaveLength(0);
  });

  it("refuse un code service sur un compte public qui est son propre payeur", async () => {
    const { handler, services } = scene([company("seul", "public_establishment")], null);

    await expect(
      handler.execute(new RecordChorusServiceCommand("seul", "staff_1", SHEET)),
    ).rejects.toThrow(ChorusServiceCodeOnSolePayerError);
    expect(services.saved).toHaveLength(0);
  });

  it("range l'engagement seul d'un compte public qui est son propre payeur", async () => {
    const { handler, services } = scene([company("seul", "public_establishment")], null);

    await handler.execute(
      new RecordChorusServiceCommand("seul", "staff_1", { ...SHEET, serviceCode: "" }),
    );

    expect(services.saved[0]?.service.payerCompanyId).toBe("seul");
  });

  it("dit 404 sur une société inconnue", async () => {
    const { handler } = scene([], null);

    await expect(
      handler.execute(new RecordChorusServiceCommand("absente", "staff_1", SHEET)),
    ).rejects.toThrow(CompanyNotFoundError);
  });
});
