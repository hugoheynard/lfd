import { InvalidPlannedTimingError } from "../errors/delivery-round-errors.js";

/**
 * **L'horaire prévu d'une tournée** (décision Hugo 2026-10-06) — le départ, le
 * retour et la distance que le calcul routier a prévus quand la proposition a
 * été appliquée. Une PRÉVISION, jamais une mesure : le départ réel est
 * `departedAt`, le retour réel `returnedAt`.
 *
 * Les trois vont ensemble : un départ sans retour ne se lit pas.
 */
export class PlannedTiming {
  private constructor(
    readonly departureAt: Date,
    readonly returnAt: Date,
    /** Mètres entiers. */
    readonly meters: number,
  ) {}

  /** @throws {InvalidPlannedTimingError} retour avant départ, distance négative ou non entière. */
  static of(input: {
    readonly departureAt: Date;
    readonly returnAt: Date;
    readonly meters: number;
  }): PlannedTiming {
    if (Number.isNaN(input.departureAt.getTime()) || Number.isNaN(input.returnAt.getTime())) {
      throw new InvalidPlannedTimingError("instant illisible");
    }
    if (input.returnAt.getTime() < input.departureAt.getTime()) {
      throw new InvalidPlannedTimingError("retour avant le départ");
    }
    if (!Number.isInteger(input.meters) || input.meters < 0) {
      throw new InvalidPlannedTimingError(`distance de ${String(input.meters)} m`);
    }
    return new PlannedTiming(new Date(input.departureAt), new Date(input.returnAt), input.meters);
  }

  /** Relu en base : tous nuls → `null` (la contrainte interdit l'entre-deux). */
  static restore(input: {
    readonly departureAt: Date | null;
    readonly returnAt: Date | null;
    readonly meters: number | null;
  }): PlannedTiming | null {
    if (input.departureAt === null || input.returnAt === null || input.meters === null) {
      return null;
    }
    return PlannedTiming.of({
      departureAt: input.departureAt,
      returnAt: input.returnAt,
      meters: input.meters,
    });
  }

  equals(other: PlannedTiming | null): boolean {
    return (
      other !== null &&
      other.departureAt.getTime() === this.departureAt.getTime() &&
      other.returnAt.getTime() === this.returnAt.getTime() &&
      other.meters === this.meters
    );
  }
}
