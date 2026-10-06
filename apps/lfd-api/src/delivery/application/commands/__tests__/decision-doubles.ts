import type { DoorstepRule } from "@lfd/contracts";

import type { DurableFact } from "../../../../platform/outbox/durable-event.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import {
  type StaffNotice,
  StaffNotifier,
} from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { StopDecision, type StopDecisionSnapshot } from "../../../domain/entities/stop-decision.js";
import { StopDecisionStaleError } from "../../../domain/errors/delivery-decision-errors.js";
import { DoorstepSettingsReader } from "../../../domain/ports/doorstep-settings.reader.js";
import { StopDecisionRepository } from "../../../domain/ports/stop-decision.repository.js";

/**
 * Les doubles de la décision du commercial (`a-la-porte.md`, B3, B5) —
 * chacun hérite de son port abstrait.
 */

/** Des décisions « en base », par arrêt, versionnées comme l'adaptateur. */
export class InMemoryStopDecisions extends StopDecisionRepository {
  readonly saves: string[] = [];
  private readonly rows = new Map<string, { state: StopDecisionSnapshot; version: number }>();

  constructor(...decisions: readonly StopDecisionSnapshot[]) {
    super();
    for (const state of decisions) {
      this.rows.set(state.stopId, { state, version: 1 });
    }
  }

  load(stopId: string): Promise<StopDecision | null> {
    const row = this.rows.get(stopId);
    return Promise.resolve(row === undefined ? null : StopDecision.restore(row.state, row.version));
  }

  save(decision: StopDecision, label: string): Promise<void> {
    const current = this.rows.get(decision.stopId);
    if (decision.loadedVersion === null) {
      if (current === undefined) {
        this.rows.set(decision.stopId, { state: decision.toSnapshot(), version: 1 });
      }
    } else if (current?.version !== decision.loadedVersion) {
      return Promise.reject(new StopDecisionStaleError(label));
    } else {
      this.rows.set(decision.stopId, {
        state: decision.toSnapshot(),
        version: decision.loadedVersion + 1,
      });
    }
    this.saves.push(decision.stopId);
    return Promise.resolve();
  }

  /** La décision telle qu'elle est « en base ». */
  stored(stopId: string): StopDecisionSnapshot | undefined {
    return this.rows.get(stopId)?.state;
  }
}

/** La cloche, enregistrée : ce qui a été émis, dans l'ordre. */
export class RecordingStaffNotifier extends StaffNotifier {
  readonly notified: StaffNotice[] = [];

  notify(notices: readonly StaffNotice[]): Promise<void> {
    this.notified.push(...notices);
    return Promise.resolve();
  }
}

/**
 * La boîte d'envoi, enregistrée : chaque fait durable écrit, une clé déjà vue
 * absorbée comme la vraie (`plan-depart-durable.md`, DD1).
 */
export class RecordingDurable extends DurablePublisher {
  readonly facts: DurableFact[] = [];

  publish(fact: DurableFact): Promise<void> {
    if (!this.facts.some((known) => known.key === fact.key)) {
      this.facts.push(fact);
    }
    return Promise.resolve();
  }

  /** Les charges des faits d'un type, dans l'ordre d'écriture. */
  payloadsOf(type: string): readonly Readonly<Record<string, unknown>>[] {
    return this.facts.filter((fact) => fact.type === type).map((fact) => fact.payload);
  }
}

/** Une décision ouverte sur l'arrêt `s_1` de la tournée `r_1`, à décider. */
export function openDecision(overrides: Partial<StopDecisionSnapshot> = {}): StopDecisionSnapshot {
  return {
    stopId: "s_1",
    roundId: "r_1",
    orderId: "o_1",
    serviceDay: "2030-03-12",
    openedByIncidentId: "inc_1",
    openedAt: new Date(2_000),
    outcome: null,
    source: null,
    decidedAt: null,
    decidedBy: null,
    decidedByName: null,
    ...overrides,
  };
}

/** Le réglage global à la porte (B3 bis) ; `null` : personne ne l'a posé. */
export class FixedDoorstepSettings extends DoorstepSettingsReader {
  constructor(private readonly rule: DoorstepRule | null = null) {
    super();
  }

  current(): Promise<DoorstepRule | null> {
    return Promise.resolve(this.rule);
  }
}
