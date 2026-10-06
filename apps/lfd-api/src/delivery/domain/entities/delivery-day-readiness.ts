import { InvalidServiceDayError } from "../errors/delivery-round-errors.js";
import { isCalendarDay } from "../value-objects/service-day.js";

/** Ce qu'une ligne relue rend à l'agrégat. */
export interface DeliveryDayReadinessState {
  readonly serviceDay: string;
  readonly closedAt: Date | null;
  readonly deliveryOrderIds: readonly string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * **Le plan arrêté, vu par la livraison** (plan de composition automatique,
 * §16.5, CA6a) : par journée, l'ENSEMBLE des livraisons que les faits du
 * fournil lui ont apprises.
 *
 * L'invariant est structurel : l'ensemble ne fait que grandir. Chaque fait
 * — clôture, réannonce, plus tard retirage (CA6b) — en fait l'UNION ; un fait
 * rejoué, ou une réannonce qui recouvre ce qu'on sait déjà, n'ajoute rien.
 * Aucun ordre d'arrivée n'est supposé : `closedAt` se pose à la première
 * clôture reçue et ne bouge plus (une journée close ne se rouvre pas, S1).
 *
 * Ce que l'appelant en tire — sonner ou non — est le nombre de livraisons
 * AJOUTÉES, rendu par `learnClosure`.
 */
export class DeliveryDayReadiness {
  private constructor(
    readonly serviceDay: string,
    private closed: Date | null,
    private ids: ReadonlySet<string>,
    readonly createdAt: Date,
    private touchedAt: Date,
  ) {}

  /**
   * Une journée dont la livraison n'a encore rien appris.
   *
   * @throws {InvalidServiceDayError} le jour n'existe pas au calendrier.
   */
  static start(serviceDay: string, at: Date): DeliveryDayReadiness {
    if (!isCalendarDay(serviceDay)) {
      throw new InvalidServiceDayError(serviceDay);
    }
    return new DeliveryDayReadiness(serviceDay, null, new Set(), at, at);
  }

  /** Relit une ligne rangée ; le jour revalide. */
  static restore(state: DeliveryDayReadinessState): DeliveryDayReadiness {
    const day = DeliveryDayReadiness.start(state.serviceDay, state.createdAt);
    day.closed = state.closedAt;
    day.ids = new Set(state.deliveryOrderIds);
    day.touchedAt = state.updatedAt;
    return day;
  }

  get closedAt(): Date | null {
    return this.closed;
  }

  get updatedAt(): Date {
    return this.touchedAt;
  }

  /** Triés : une ligne réécrite à l'identique ne change pas de forme. */
  get deliveryOrderIds(): readonly string[] {
    return [...this.ids].sort();
  }

  get deliveryCount(): number {
    return this.ids.size;
  }

  /**
   * Une clôture (ou sa réannonce) reçue : ses livraisons rejoignent
   * l'ensemble, et l'instant d'arrêt se pose s'il manquait.
   *
   * @returns le nombre de livraisons qui n'étaient pas encore connues.
   */
  learnClosure(closedAt: Date, deliveryOrderIds: readonly string[], at: Date): number {
    const before = this.ids.size;
    this.ids = new Set([...this.ids, ...deliveryOrderIds]);
    this.closed ??= closedAt;
    this.touchedAt = at;
    return this.ids.size - before;
  }
}
