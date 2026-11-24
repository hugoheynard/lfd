import type { Basket } from "../../../basket/domain/entities/basket.js";
import type { IsoDate } from "../../../basket/domain/value-objects/iso-date.js";
import type { Occurrence } from "../entities/occurrence.js";

/** Une échéance due, avec le panier qui la porte. */
export interface DueOccurrence {
  readonly occurrence: Occurrence;
  readonly basket: Basket;
}

/**
 * Port d'**écriture** des échéances. `save` n'écrit qu'à condition que la
 * ligne soit encore dans l'état relu (`Occurrence.loadedState`) : deux
 * écrivains concurrents ne s'écrasent pas, le second apprend qu'il a perdu.
 */
export abstract class OccurrenceRepository {
  abstract insertMany(occurrences: readonly Occurrence[]): Promise<void>;

  /** Les jours qui ont déjà leur ligne, à partir de `from`, tous états confondus. */
  abstract serviceDaysFrom(basketId: string, from: IsoDate): Promise<ReadonlySet<string>>;

  /** L'échéance d'un jour, ou `null`. */
  abstract load(basketId: string, serviceDay: IsoDate): Promise<Occurrence | null>;

  /** Les échéances encore ouvertes (`planned`, `skipped`, `refused`) d'un panier. */
  abstract openOf(basketId: string): Promise<readonly Occurrence[]>;

  /**
   * Les échéances dues : à passer au plus tard `today`, prévues ou refusées,
   * d'un panier actif — au plus `limit`, les plus anciennes d'abord.
   */
  abstract due(today: IsoDate, limit: number): Promise<readonly DueOccurrence[]>;

  /** Écrit l'état ; rend faux si la ligne avait quitté l'état relu entre-temps. */
  abstract save(occurrence: Occurrence): Promise<boolean>;
}
