import {
  InvalidResupplyArrivalTimeError,
  ResupplyArrivalOnAsapError,
} from "./resupply-arrival-errors.js";
import type { ResupplyTarget } from "./site-resupply-snapshot.js";

/** `HH:MM`, de 00:00 à 23:59 — la même forme que le CHECK `…_arrival_by_clock`. */
const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;

/**
 * **L'heure d'arrivée voulue d'un réassort au point** (plan
 * `reassort-boutiques/plan-heure-du-reassort.md`, H-D1) : une heure
 * d'ARRIVÉE, comme le créneau d'une commande — jamais un départ ; le trajet,
 * la mise en place et le colisage s'en déduisent. Immuable, auto-validée.
 */
export class ResupplyArrivalTime {
  private constructor(readonly value: string) {}

  /** @throws {InvalidResupplyArrivalTimeError} pas une heure `HH:MM` de la journée. */
  static of(value: string): ResupplyArrivalTime {
    if (!CLOCK.test(value)) {
      throw new InvalidResupplyArrivalTimeError(value);
    }
    return new ResupplyArrivalTime(value);
  }

  /** `null` reste `null` : pas d'heure. */
  static ofNullable(value: string | null): ResupplyArrivalTime | null {
    return value === null ? null : ResupplyArrivalTime.of(value);
  }

  equals(other: ResupplyArrivalTime | null): boolean {
    return other !== null && other.value === this.value;
  }
}

/**
 * Une heure posée sur une visée (H-D2) : « au plus tôt » n'en porte jamais.
 * « Pour demain » sans heure n'est refusé qu'à l'ENVOI d'un réassort : un
 * brouillon ou un modèle peut ne pas encore en avoir.
 *
 * @throws {ResupplyArrivalOnAsapError}
 */
export function assertArrivalFitsTarget(
  target: ResupplyTarget,
  arrivalBy: ResupplyArrivalTime | null,
): void {
  if (target === "asap" && arrivalBy !== null) {
    throw new ResupplyArrivalOnAsapError();
  }
}

/**
 * L'heure d'une composition qui ne part pas encore (brouillon du fournil,
 * modèle) : facultative, mais d'une forme juste et jamais sur `asap`.
 * Rendue en `HH:MM` relue, ou `null`.
 *
 * @throws {InvalidResupplyArrivalTimeError}
 * @throws {ResupplyArrivalOnAsapError}
 */
export function arrivalByOf(target: ResupplyTarget, raw: string | null): string | null {
  const arrivalBy = ResupplyArrivalTime.ofNullable(raw);
  assertArrivalFitsTarget(target, arrivalBy);
  return arrivalBy?.value ?? null;
}
