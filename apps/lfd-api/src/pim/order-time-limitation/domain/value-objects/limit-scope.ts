import type { OrderTimeLimitScope, OrderTimeLimitScopeType } from "@lfd/pim-contracts";

import { InvalidOrderTimeLimitScopeError } from "../errors/order-time-limit-errors.js";

/**
 * **La portée d'une limite** — ce sur quoi elle est posée.
 *
 * Un value object plutôt qu'un couple de chaînes qui circule, parce que
 * l'invariant qui les lie est facile à perdre entre deux couches : `id` est
 * renseigné **si et seulement si** le type n'est pas `global`. Écrit une fois
 * ici, il ne peut plus être oublié par un appelant.
 *
 * La base le tient aussi (`order_time_limit_scope_id_iff_not_global`) : le value
 * object refuse à la construction, la contrainte refuse à l'écriture. Le second
 * barreau existe parce qu'un `UPDATE` manuel ou un futur adaptateur passeraient
 * à côté du premier.
 */
export class LimitScope {
  private constructor(
    readonly type: OrderTimeLimitScopeType,
    readonly id: string | null,
  ) {}

  static of(scope: OrderTimeLimitScope): LimitScope {
    const isGlobal = scope.type === "global";
    if (isGlobal !== (scope.id === null)) {
      throw new InvalidOrderTimeLimitScopeError(scope.type);
    }
    return new LimitScope(scope.type, scope.id);
  }

  /**
   * La clé naturelle, avec `''` pour l'absence de cible.
   *
   * `coalesce(scope_id, '')` est exactement ce que fait l'index unique en base ;
   * la même écriture des deux côtés évite qu'un jour l'un accepte ce que l'autre
   * refuse.
   */
  get key(): string {
    return `${this.type}:${this.id ?? ""}`;
  }

  toPayload(): OrderTimeLimitScope {
    return { type: this.type, id: this.id };
  }
}
