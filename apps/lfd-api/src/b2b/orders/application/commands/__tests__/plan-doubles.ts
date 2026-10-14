import {
  ClosedPlansReader,
  PlanAdmissionDesk,
  type PlanAdmission,
  type ServiceDay,
} from "../../../../../production/channels/commerce/index.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { SameDayOrderReader } from "../../../domain/ports/same-day-order.reader.js";
import { OrderPlanGate } from "../../services/order-plan-gate.service.js";

/**
 * Les journées dont le plan est arrêté, fixées par le test — aucune par défaut.
 * Note chaque question, pour vérifier qu'on a regardé la bonne journée.
 */
export class FixedClosedPlans extends ClosedPlansReader {
  readonly asked: { readonly from: string; readonly to: string }[] = [];

  constructor(private readonly closed: readonly string[] = []) {
    super();
  }

  closedBetween(from: string, to: string): Promise<readonly string[]> {
    this.asked.push({ from, to });
    return Promise.resolve(this.closed.filter((day) => from <= day && day <= to));
  }
}

/**
 * Le guichet d'admission doublé : il rend l'état que le test lui donne POUR
 * CHAQUE journée, et note dans l'ordre les journées qu'on lui a fait tenir —
 * c'est ce qui prouve que la passation prend la journée.
 */
export class RecordingAdmissionDesk extends PlanAdmissionDesk {
  readonly held: string[] = [];

  constructor(
    private readonly closed: readonly string[] = [],
    private readonly onAdmit: () => void = () => undefined,
  ) {
    super();
  }

  admit(day: ServiceDay): Promise<PlanAdmission> {
    this.held.push(day.value);
    this.onAdmit();
    return Promise.resolve(this.closed.includes(day.value) ? "closed" : "open");
  }
}

/** Le réglage « jour même », fixé par le test. */
export class FixedSameDay extends SameDayOrderReader {
  constructor(private readonly value: boolean) {
    super();
  }

  allowed(): Promise<boolean> {
    return Promise.resolve(this.value);
  }
}

/**
 * L'horloge des portes : le 1er janvier 2026 à midi, Paris. Les journées des
 * specs de passation (septembre 2026) sont après — elle n'est comparée qu'à
 * elles (exception étroite du CLAUDE.md §5).
 */
export const GATE_NOW = new Date("2026-01-01T11:00:00.000Z");

/** Une porte montée sur ces doubles ; le jour même fermé par défaut, comme en production. */
export function gateOf(
  plans: ClosedPlansReader = new FixedClosedPlans(),
  desk: PlanAdmissionDesk = new RecordingAdmissionDesk(),
  sameDayAllowed = false,
): OrderPlanGate {
  return new OrderPlanGate(plans, desk, new FixedSameDay(sameDayAllowed), new FixedClock(GATE_NOW));
}

/** Aucune journée arrêtée : la porte du plan laisse tout passer. */
export function openPlanGate(): OrderPlanGate {
  return gateOf();
}
