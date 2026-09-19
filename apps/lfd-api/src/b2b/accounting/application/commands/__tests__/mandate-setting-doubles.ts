import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../../platform/events/domain-event-publisher.js";
import type { JournaledEvent } from "../../../../../platform/journal/journal-fact.js";
import { LegalEntity } from "../../../domain/entities/legal-entity.js";
import {
  IssuedDraftMandates,
  type IssuerDraftVoidingCause,
  type IssuerDraftVoidingChannel,
  type VoidedDraftMandate,
} from "../../../domain/ports/issued-draft-mandates.js";
import { LegalEntityRepository } from "../../../domain/ports/legal-entity.repository.js";
import { LegalAddress } from "../../../domain/value-objects/legal-address.js";
import { Siren } from "../../../domain/value-objects/siren.js";
import { STRICT_JOURNAL_FACTS } from "../../../../../platform/journal/__tests__/strict-journal-facts.js";

/**
 * Doublés des réglages de mandat de l'entité — schéma et défauts.
 *
 * Tous écrivent dans UN journal de bord (`log`), comme `payment-doubles.ts` :
 * c'est ce qui permet d'affirmer que la caducité est DANS l'unité de travail
 * et la cloche APRÈS. Chacun hérite du port abstrait.
 */
export class SettingSteps {
  readonly log: string[] = [];
}

/** Un brouillon émis par l'entité, tel que le port le rend. */
export const VOIDED: VoidedDraftMandate = {
  id: "mdt_1",
  companyId: "cmp_1",
  reference: "LFC-9P2X4B-260915-K7M3QT",
};

/** SIREN à clé de Luhn valide : un SIREN inventé serait refusé par le value object. */
const SIREN = "552100554";

/** Une entité fraîchement déclarée — donc interentreprises, récurrente, sans description. */
export function declaredEntity(): LegalEntity {
  return LegalEntity.declare({
    id: "le1",
    name: "La Folie Douce",
    legalForm: "SAS",
    siren: Siren.create(SIREN),
    address: LegalAddress.create({
      line1: "12 rue du Fournil",
      line2: "",
      postalCode: "73000",
      city: "Chambéry",
      countryCode: "FR",
    }),
    rcs: "",
    shareCapitalCents: 1_000_000,
    vatNumber: "",
  });
}

export class StepEntities extends LegalEntityRepository {
  readonly rows = new Map<string, LegalEntity>();

  constructor(private readonly steps: SettingSteps) {
    super();
  }

  load(id: string): Promise<LegalEntity | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  save(entity: LegalEntity): Promise<void> {
    this.steps.log.push("entity:save");
    this.rows.set(entity.id, entity);
    return Promise.resolve();
  }

  hasAnotherActive(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

/** Le port de caducité : rend ce qu'on lui confie, et marque chaque temps. */
export class StepDrafts extends IssuedDraftMandates {
  drafts: readonly VoidedDraftMandate[] = [VOIDED];
  readonly calls: {
    readonly creditorId: string;
    readonly cause: IssuerDraftVoidingCause;
    readonly via: IssuerDraftVoidingChannel;
  }[] = [];

  constructor(private readonly steps: SettingSteps) {
    super();
  }

  voidDraftsOf(
    creditorId: string,
    cause: IssuerDraftVoidingCause,
    via: IssuerDraftVoidingChannel,
  ): Promise<readonly VoidedDraftMandate[]> {
    this.steps.log.push(`drafts:void:${cause}`);
    this.calls.push({ creditorId, cause, via });
    return Promise.resolve(this.drafts);
  }

  announceVoided(voided: readonly VoidedDraftMandate[]): Promise<void> {
    this.steps.log.push(`drafts:bell:${String(voided.length)}`);
    return Promise.resolve();
  }
}

export class StepUnitOfWork extends UnitOfWork {
  constructor(private readonly steps: SettingSteps) {
    super();
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.steps.log.push("uow:begin");
    const result = await work();
    this.steps.log.push("uow:end");
    return result;
  }
}

export class StepPublisher extends DomainEventPublisher {
  readonly traced: JournaledEvent[] = [];

  constructor(private readonly steps: SettingSteps) {
    super();
  }

  publish(): void {
    this.steps.log.push("publish");
  }

  publishTraced(event: JournaledEvent): Promise<void> {
    const fact = event.journalFact();
    STRICT_JOURNAL_FACTS.verify(fact.type, fact.payload);
    this.traced.push(event);
    this.steps.log.push(`journal:${event.journalFact().type}`);
    return Promise.resolve();
  }
}
