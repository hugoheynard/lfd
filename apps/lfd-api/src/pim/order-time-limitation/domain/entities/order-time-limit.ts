import type { OrderTimeLimitPayload } from "@lfd/pim-contracts";

import { EmptyOrderTimeLimitError } from "../errors/order-time-limit-errors.js";
import { LimitScope } from "../value-objects/limit-scope.js";

/** Ce qu'un rang peut poser. `null` = **ce rang ne se prononce pas**. */
export interface LimitValues {
  readonly daysBefore: number | null;
  readonly time: string | null;
  readonly graceMinutes: number | null;
}

/**
 * **Une limite posée sur une portée.**
 *
 * L'entité ne connaît ni l'échelle ni l'héritage : elle garantit qu'**une ligne
 * dit quelque chose**. Résoudre est le travail d'un service de domaine, qui
 * lit plusieurs de ces règles — les mélanger ici ferait dépendre la validité
 * d'une ligne de l'existence des autres, et la première règle créée serait
 * toujours refusée.
 */
export class OrderTimeLimit {
  private constructor(
    readonly id: string,
    readonly scope: LimitScope,
    private values: LimitValues,
  ) {}

  /**
   * Pose une limite. L'intention est nommée `set` et non `create` parce qu'il y
   * en a **au plus une par portée** : reposer sur la même portée remplace, ça ne
   * crée pas un second avis.
   *
   * @throws {EmptyOrderTimeLimitError} les trois réglages sont absents.
   */
  static set(id: string, payload: OrderTimeLimitPayload): OrderTimeLimit {
    const values = valuesOf(payload);
    ensureSaysSomething(values);
    return new OrderTimeLimit(id, LimitScope.of(payload.scope), values);
  }

  /** Rehydrate depuis la base. Les invariants se revérifient — une ligne écrite à la main aussi. */
  static reconstitute(id: string, payload: OrderTimeLimitPayload): OrderTimeLimit {
    return OrderTimeLimit.set(id, payload);
  }

  /**
   * Réécrit les trois réglages. La **portée ne bouge pas** : déplacer une règle
   * d'une famille à l'autre n'est pas une modification, c'est une suppression et
   * une création — et le confondre ferait perdre la trace de ce qui s'appliquait
   * à l'ancienne portée.
   *
   * @throws {EmptyOrderTimeLimitError} les trois réglages sont absents.
   */
  reset(payload: OrderTimeLimitPayload): void {
    const values = valuesOf(payload);
    ensureSaysSomething(values);
    this.values = values;
  }

  get daysBefore(): number | null {
    return this.values.daysBefore;
  }

  get time(): string | null {
    return this.values.time;
  }

  get graceMinutes(): number | null {
    return this.values.graceMinutes;
  }
}

function valuesOf(payload: OrderTimeLimitPayload): LimitValues {
  return {
    daysBefore: payload.daysBefore,
    time: payload.time,
    graceMinutes: payload.graceMinutes,
  };
}

/**
 * Une règle dont les trois valeurs sont nulles n'est pas « une règle permissive »,
 * c'est une ligne muette : elle laisserait tout hériter du rang du dessus tout en
 * se montrant à l'écran comme une règle. Pour ne rien dire, on supprime.
 */
function ensureSaysSomething(values: LimitValues): void {
  if (values.daysBefore === null && values.time === null && values.graceMinutes === null) {
    throw new EmptyOrderTimeLimitError();
  }
}
