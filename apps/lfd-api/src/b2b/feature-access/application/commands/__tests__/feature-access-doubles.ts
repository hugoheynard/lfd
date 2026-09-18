import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../../platform/events/domain-event-publisher.js";
import type { JournaledEvent } from "../../../../../platform/journal/journal-fact.js";
import {
  StaffDirectory,
  type StaffIdentity,
} from "../../../../account/domain/ports/staff-directory.js";
import type { FeatureExemption } from "../../../domain/feature-exemption.js";
import type { FeatureOverride } from "../../../domain/feature-override.js";
import {
  FeatureExemptionRepository,
  type ExemptionAddOutcome,
  type RemovedExemption,
} from "../../../domain/ports/feature-exemption.repository.js";
import { FeatureOverrideRepository } from "../../../domain/ports/feature-override.repository.js";

/**
 * Doublés partagés des handlers de l'accès aux fonctionnalités.
 *
 * Tous écrivent dans UN journal de bord commun (`steps`) : c'est ce qui permet
 * d'affirmer l'ORDRE — l'écriture et sa trace à l'intérieur de l'unité de
 * travail, jamais avant ni après.
 */
export class Steps {
  readonly log: string[] = [];
}

/** Une unité de travail qui marque son ouverture et sa fermeture, sans transaction. */
export class StepUnitOfWork extends UnitOfWork {
  constructor(private readonly steps: Steps) {
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

  constructor(private readonly steps: Steps) {
    super();
  }

  publish(): void {
    this.steps.log.push("publish");
  }

  publishTraced(event: JournaledEvent): Promise<void> {
    this.traced.push(event);
    this.steps.log.push(`journal:${event.journalFact().type}`);
    return Promise.resolve();
  }
}

export class KnownStaff extends StaffDirectory {
  identify(reference: string): Promise<StaffIdentity | null> {
    return Promise.resolve(
      reference === "staff_admin" ? { name: "Camille Admin", role: "admin" } : null,
    );
  }
}

/** Dérogations en mémoire. */
export class InMemoryOverrides extends FeatureOverrideRepository {
  readonly rows = new Map<string, FeatureOverride>();

  constructor(private readonly steps: Steps) {
    super();
  }

  put(override: FeatureOverride): Promise<string | null> {
    this.steps.log.push(`override:put:${override.key}`);
    const previous = this.rows.get(override.key)?.value ?? null;
    this.rows.set(override.key, override);
    return Promise.resolve(previous);
  }

  remove(key: string): Promise<string | null> {
    this.steps.log.push(`override:remove:${key}`);
    const previous = this.rows.get(key)?.value ?? null;
    this.rows.delete(key);
    return Promise.resolve(previous);
  }
}

/** Exemptions en mémoire, uniques sur `(clé, adresse)` comme en base. */
export class InMemoryExemptions extends FeatureExemptionRepository {
  readonly rows: FeatureExemption[] = [];

  constructor(private readonly steps: Steps) {
    super();
  }

  addIfAbsent(exemption: FeatureExemption): Promise<ExemptionAddOutcome> {
    this.steps.log.push(`exemption:add:${exemption.email}`);
    const existing = this.rows.find(
      (row) => row.key === exemption.key && row.email === exemption.email,
    );
    if (existing !== undefined) {
      return Promise.resolve({ id: existing.id, created: false });
    }
    this.rows.push(exemption);
    return Promise.resolve({ id: exemption.id, created: true });
  }

  remove(key: string, id: string): Promise<RemovedExemption | null> {
    this.steps.log.push(`exemption:remove:${id}`);
    const index = this.rows.findIndex((row) => row.key === key && row.id === id);
    if (index === -1) {
      return Promise.resolve(null);
    }
    const [removed] = this.rows.splice(index, 1);
    return Promise.resolve(removed === undefined ? null : { email: removed.email });
  }
}
