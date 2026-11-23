import type { OrderTimeLimitPayload } from "@lfd/pim-contracts";

import {
  ExclusionOnProductLimitError,
  IncompleteOrderTimeLimitError,
  ProductGraceRetiredError,
  RetiredOrderTimeLimitScopeError,
} from "../errors/order-time-limit-errors.js";
import { LimitScope } from "../value-objects/limit-scope.js";
import { isLive, type OrderTimeLimitExclusion } from "./order-time-limit-exclusion.js";

/** Ce qu'un rang peut poser. `null` = **ce rang ne se prononce pas**. */
export interface LimitValues {
  readonly daysBefore: number | null;
  readonly time: string | null;
  readonly graceMinutes: number | null;
  /** L'équipe peut passer outre cette limite (avec le droit, en saisie). */
  readonly staffMayExceed: boolean;
}

/**
 * **Une limite posée sur un produit ou sur une famille**, règle entière.
 *
 * Décisions de Hugo (2026-10-21 et 2026-11-23, `limites-de-commande/`) : ni
 * « toute la production » (elle se règle au commerce), ni déclinaison (elle
 * suit son produit) ; pas d'héritage champ par champ — le délai et l'heure
 * sont tous deux posés. **Pas de rattrapage** : le seul est celui de la règle
 * générale du commerce, et la dérogation reste le geste d'exception.
 * `graceMinutes` n'accepte que `null` ou `0`, et s'enregistre `null`.
 *
 * Une limite de **famille** vise toute sa descendance, sauf les produits
 * qu'elle **exclut** nommément. Les exclusions font partie de l'agrégat : elles
 * ne s'effacent pas (retirer pose `removedAt`), et archiver la limite les
 * garde — la reposer les remet en vigueur avec elle.
 */
export class OrderTimeLimit {
  private constructor(
    readonly id: string,
    readonly scope: LimitScope,
    private values: LimitValues,
    private archivedAtValue: Date | null,
    private exclusionsValue: readonly OrderTimeLimitExclusion[],
  ) {}

  /**
   * Pose une limite. L'intention est nommée `set` et non `create` parce qu'il y
   * en a **au plus une par portée** : reposer sur la même portée remplace, ça ne
   * crée pas un second avis.
   *
   * @throws {RetiredOrderTimeLimitScopeError} la portée n'est ni un produit ni une famille.
   * @throws {IncompleteOrderTimeLimitError} le délai ou l'heure manque.
   */
  static set(id: string, payload: OrderTimeLimitPayload): OrderTimeLimit {
    const scope = LimitScope.of(payload.scope);
    ensureAdmittedScope(scope);
    const values = completeValuesOf(payload);
    return new OrderTimeLimit(id, scope, values, null, []);
  }

  /**
   * Rehydrate depuis la base, avec ses exclusions (retirées comprises ou non :
   * seules les vivantes comptent). La portée se revérifie (cohérence
   * `id`/type) ; la règle « produit ou famille, règle entière » NON : une ligne
   * résiduelle doit encore pouvoir se relire pour être retirée. La résolution
   * l'ignore, et `reset` la refuse.
   */
  static reconstitute(
    id: string,
    payload: OrderTimeLimitPayload,
    archivedAt: Date | null,
    exclusions: readonly OrderTimeLimitExclusion[] = [],
  ): OrderTimeLimit {
    return new OrderTimeLimit(
      id,
      LimitScope.of(payload.scope),
      valuesOf(payload),
      archivedAt,
      exclusions,
    );
  }

  /**
   * Réécrit les réglages — délai, heure, rattrapage et la case « l'équipe peut
   * passer outre ». La **portée ne bouge pas** : déplacer une règle
   * d'une famille à l'autre n'est pas une modification, c'est une suppression et
   * une création — et le confondre ferait perdre la trace de ce qui s'appliquait
   * à l'ancienne portée.
   *
   * Reposer une règle sur la portée d'une limite **archivée** la remet en
   * vigueur : il n'y a qu'une ligne par portée, et poser une limite, c'est
   * vouloir qu'elle s'applique.
   *
   * @throws {RetiredOrderTimeLimitScopeError} la règle vise une portée retirée.
   * @throws {IncompleteOrderTimeLimitError} le délai ou l'heure manque.
   * @returns `false` si les réglages reposés sont ceux qu'elle porte déjà, en
   *   vigueur — la case seule changée est un changement.
   */
  reset(payload: OrderTimeLimitPayload): boolean {
    ensureAdmittedScope(this.scope);
    const next = completeValuesOf(payload);
    const before = this.values;
    const revived = this.restore();
    this.values = next;
    return (
      revived ||
      before.daysBefore !== next.daysBefore ||
      before.time !== next.time ||
      before.graceMinutes !== next.graceMinutes ||
      before.staffMayExceed !== next.staffMayExceed
    );
  }

  get isArchived(): boolean {
    return this.archivedAtValue !== null;
  }

  get archivedAt(): Date | null {
    return this.archivedAtValue;
  }

  /**
   * Archive la limite : elle **cesse de s'appliquer** — le fil vers le commerce
   * ne la porte plus, et seule la règle générale du commerce juge l'article.
   * Toujours permis ; ses valeurs sont gardées pour la restaurer.
   *
   * @returns `false` si elle l'était déjà — le geste rejoué ne change rien.
   */
  archive(at: Date): boolean {
    if (this.archivedAtValue !== null) {
      return false;
    }
    this.archivedAtValue = at;
    return true;
  }

  /** La remet en vigueur, avec les valeurs qu'elle portait. `false` si elle l'était. */
  restore(): boolean {
    if (this.archivedAtValue === null) {
      return false;
    }
    this.archivedAtValue = null;
    return true;
  }

  /**
   * Exclut un produit de la limite de cette famille. L'appartenance du produit
   * à la descendance de la famille se vérifie avant, par qui lit le catalogue.
   *
   * @param exclusionId l'identifiant de la nouvelle exclusion (`IdGenerator`).
   * @throws {ExclusionOnProductLimitError} la limite n'est pas celle d'une famille.
   * @returns `false` si le produit était déjà exclu — le geste rejoué ne change rien.
   */
  exclude(exclusionId: string, productId: string, at: Date): boolean {
    this.ensureFamily();
    if (this.liveExclusionOf(productId) !== undefined) {
      return false;
    }
    const exclusion = { id: exclusionId, productId, createdAt: at, removedAt: null };
    this.exclusionsValue = [...this.exclusionsValue, exclusion];
    return true;
  }

  /**
   * Réintègre un produit exclu : son exclusion est **retirée** (`removedAt`),
   * jamais effacée.
   *
   * @throws {ExclusionOnProductLimitError} la limite n'est pas celle d'une famille.
   * @returns `false` si le produit n'était pas exclu.
   */
  include(productId: string, at: Date): boolean {
    this.ensureFamily();
    const live = this.liveExclusionOf(productId);
    if (live === undefined) {
      return false;
    }
    this.exclusionsValue = this.exclusionsValue.map((exclusion) =>
      exclusion === live ? { ...exclusion, removedAt: at } : exclusion,
    );
    return true;
  }

  /** Toutes les exclusions que l'agrégat tient, retirées comprises. */
  get exclusions(): readonly OrderTimeLimitExclusion[] {
    return this.exclusionsValue;
  }

  /** Les produits exclus en vigueur. */
  get excludedProductIds(): readonly string[] {
    return this.exclusionsValue.filter(isLive).map((exclusion) => exclusion.productId);
  }

  private liveExclusionOf(productId: string): OrderTimeLimitExclusion | undefined {
    return this.exclusionsValue.find(
      (exclusion) => isLive(exclusion) && exclusion.productId === productId,
    );
  }

  private ensureFamily(): void {
    if (this.scope.type !== "category") {
      throw new ExclusionOnProductLimitError();
    }
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

  get staffMayExceed(): boolean {
    return this.values.staffMayExceed;
  }
}

function valuesOf(payload: OrderTimeLimitPayload): LimitValues {
  return {
    daysBefore: payload.daysBefore,
    time: payload.time,
    graceMinutes: payload.graceMinutes,
    staffMayExceed: payload.staffMayExceed,
  };
}

/**
 * Les valeurs d'une limite : délai ET heure, sans rattrapage.
 *
 * Un rattrapage non nul est **refusé**, pas ignoré : l'ignorer laisserait
 * l'appelant croire qu'il a posé une heure de grâce que la passation
 * n'appliquera jamais.
 */
function completeValuesOf(payload: OrderTimeLimitPayload): LimitValues {
  const values = valuesOf(payload);
  ensureComplete(values);
  if (values.graceMinutes !== null && values.graceMinutes !== 0) {
    throw new ProductGraceRetiredError();
  }
  return { ...values, graceMinutes: null };
}

/** Le référentiel pose une limite sur un produit ou une famille, rien d'autre. */
function ensureAdmittedScope(scope: LimitScope): void {
  if (scope.type !== "product" && scope.type !== "category") {
    throw new RetiredOrderTimeLimitScopeError(scope.type);
  }
}

/**
 * Pas de rang au-dessus dont hériter : un délai sans heure, ou l'inverse, se
 * montrerait comme une règle sans jamais rien refuser.
 */
function ensureComplete(values: LimitValues): void {
  if (values.daysBefore === null || values.time === null) {
    throw new IncompleteOrderTimeLimitError();
  }
}
