import type { OrderTimeLimitPayload } from "@lfd/pim-contracts";

import {
  IncompleteOrderTimeLimitError,
  ProductGraceRetiredError,
  RetiredOrderTimeLimitScopeError,
} from "../errors/order-time-limit-errors.js";
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
 * Depuis le 2026-10-21 (décision de Hugo, `limites-de-commande/
 * schema-des-reglages.md` §4) : **une limite par produit, règle entière**. Ni
 * « toute la production » (elle se règle au commerce), ni famille, ni
 * déclinaison (elle suit son produit) ; et plus d'héritage champ par champ —
 * le délai et l'heure sont tous deux posés. **Pas de rattrapage** (même jour,
 * point 2) : le seul rattrapage est celui de la règle générale du commerce, et
 * la dérogation reste le geste d'exception. `graceMinutes` n'accepte que
 * `null` ou `0`, et s'enregistre `null`.
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
   * @throws {RetiredOrderTimeLimitScopeError} la portée n'est pas un produit.
   * @throws {IncompleteOrderTimeLimitError} le délai ou l'heure manque.
   */
  static set(id: string, payload: OrderTimeLimitPayload): OrderTimeLimit {
    const scope = LimitScope.of(payload.scope);
    ensureProduct(scope);
    const values = productValuesOf(payload);
    return new OrderTimeLimit(id, scope, values);
  }

  /**
   * Rehydrate depuis la base. La portée se revérifie (cohérence `id`/type) ;
   * la règle « produit seulement, règle entière » NON : une ligne d'avant le
   * 2026-10-21 doit encore pouvoir se relire pour être retirée. La résolution
   * l'ignore, et `reset` la refuse.
   */
  static reconstitute(id: string, payload: OrderTimeLimitPayload): OrderTimeLimit {
    return new OrderTimeLimit(id, LimitScope.of(payload.scope), valuesOf(payload));
  }

  /**
   * Réécrit les trois réglages. La **portée ne bouge pas** : déplacer une règle
   * d'une famille à l'autre n'est pas une modification, c'est une suppression et
   * une création — et le confondre ferait perdre la trace de ce qui s'appliquait
   * à l'ancienne portée.
   *
   * @throws {RetiredOrderTimeLimitScopeError} la règle vise une portée retirée.
   * @throws {IncompleteOrderTimeLimitError} le délai ou l'heure manque.
   */
  reset(payload: OrderTimeLimitPayload): void {
    ensureProduct(this.scope);
    this.values = productValuesOf(payload);
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
 * Les valeurs d'une limite de produit : délai ET heure, sans rattrapage.
 *
 * Un rattrapage non nul est **refusé**, pas ignoré : l'ignorer laisserait
 * l'appelant croire qu'il a posé une heure de grâce que la passation
 * n'appliquera jamais.
 */
function productValuesOf(payload: OrderTimeLimitPayload): LimitValues {
  const values = valuesOf(payload);
  ensureComplete(values);
  if (values.graceMinutes !== null && values.graceMinutes !== 0) {
    throw new ProductGraceRetiredError();
  }
  return { ...values, graceMinutes: null };
}

/** Seul le produit porte encore une limite au référentiel (2026-10-21). */
function ensureProduct(scope: LimitScope): void {
  if (scope.type !== "product") {
    throw new RetiredOrderTimeLimitScopeError(scope.type);
  }
}

/**
 * Plus de rang au-dessus dont hériter : un délai sans heure, ou l'inverse, se
 * montrerait comme une règle sans jamais rien refuser.
 */
function ensureComplete(values: LimitValues): void {
  if (values.daysBefore === null || values.time === null) {
    throw new IncompleteOrderTimeLimitError();
  }
}
