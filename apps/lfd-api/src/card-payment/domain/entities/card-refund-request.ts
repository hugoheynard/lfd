import {
  CardRefundAlreadyIssuedError,
  CardRefundNotStoppedError,
  CardRefundRequestInvalidError,
  CardRefundRetryRefusedError,
  CardRefundTransitionRefusedError,
} from "../errors/card-refund-errors.js";
import {
  type CardRefundRequestState,
  type CardRefundStatus,
  isCardRefundRequestTransition,
} from "../value-objects/card-refund-values.js";
import {
  type CardRefundRequestSnapshot,
  bornSnapshot,
  type CardRefundIssuanceEffect,
  type CardRefundRequestExpectation,
  type CardRefundRequestIntent,
  issuanceStopOf,
  KEY_PREFIX,
  retryRefusalOf,
  SETTLED_REASON_MAX,
  UNAVAILABLE_FAILURE,
  validIntent,
} from "./card-refund-request-shape.js";

export type {
  CardRefundIssuanceEffect,
  CardRefundRequestExpectation,
  CardRefundRequestIntent,
  CardRefundRequestSnapshot,
} from "./card-refund-request-shape.js";
export { UNAVAILABLE_FAILURE } from "./card-refund-request-shape.js";

/**
 * **Une demande de remboursement d'un paiement** (plan M2, §3.4, §3.5) —
 * l'agrégat qui porte la machine `refund_request.state`. L'argent vrai reste
 * au carnet (`CardRefundLedger`) : la demande dit ce qui a été PROMIS et ce
 * qui a été TENTÉ, sous un état persisté.
 *
 * Les colonnes que le déclencheur `refund_request_guard` tient immuables
 * (paiement, forme, montant, nature, motif) n'ont ici aucun mutateur. Le bail
 * se PREND par une écriture conditionnée du port de bail, hors de l'agrégat :
 * c'est une exclusion mutuelle, pas une règle métier. L'agrégat le relâche.
 */
export class CardRefundRequest {
  private constructor(
    private state: CardRefundRequestSnapshot,
    private readonly loaded: CardRefundRequestExpectation | null,
  ) {}

  /** @throws {CardRefundRequestInvalidError} montant, forme ou motif hors règle. */
  static request(intent: CardRefundRequestIntent): CardRefundRequest {
    const problem = validIntent(intent);
    if (problem !== null) {
      throw new CardRefundRequestInvalidError(problem);
    }
    return new CardRefundRequest(bornSnapshot(intent), null);
  }

  static rehydrate(snapshot: CardRefundRequestSnapshot): CardRefundRequest {
    return new CardRefundRequest(snapshot, {
      state: snapshot.state,
      generation: snapshot.generation,
      claimToken: snapshot.claimToken,
    });
  }

  /** Les colonnes, telles quelles — pour lire ; seules les méthodes écrivent. */
  get view(): CardRefundRequestSnapshot {
    return this.state;
  }
  get id(): string {
    return this.state.id;
  }
  get paymentId(): string {
    return this.state.paymentId;
  }
  get current(): CardRefundRequestState {
    return this.state.state;
  }
  get generation(): number {
    return this.state.generation;
  }

  /** En cours : la seule `remainder` de ce genre que l'index partiel admet par paiement. */
  isInProgress(): boolean {
    return this.state.state === "to_issue" || this.state.state === "issued";
  }

  /** La clé d'idempotence, une seule forme pour toutes les demandes (§3.5, v14). */
  key(): string {
    const { id, generation, round } = this.state;
    return `${KEY_PREFIX}:${id}:${String(generation)}:${String(round)}`;
  }

  /** Le bail court-il encore à `wallNow` ? */
  isClaimedAt(wallNow: Date): boolean {
    const until = this.state.claimedUntil;
    return until !== null && until.getTime() > wallNow.getTime();
  }

  isHeldBy(token: string): boolean {
    return this.state.claimToken === token;
  }

  release(): void {
    this.state = { ...this.state, claimedUntil: null, claimToken: null };
  }

  /**
   * **Le prestataire a rendu `providerRef`** pour la génération — à l'exécuteur
   * (émission, recherche) ou au constat arrivé avant lui. L'état visé suit le
   * statut : `succeeded` → `refunded`, en attente → `issued`, mort → `stopped`.
   * Une `amount` émise pour un autre montant que demandé s'arrête (§3.5).
   * Jamais de recul : une demande déjà au-delà ne bouge pas.
   *
   * @param attempt l'instant de l'essai de l'exécuteur ; `null` pour le constat.
   * @throws {CardRefundAlreadyIssuedError} un autre `re_…` est déjà posé.
   */
  acceptIssuance(
    providerRef: string,
    issuedCents: number,
    status: CardRefundStatus,
    attempt: Date | null,
    at: Date,
  ): CardRefundIssuanceEffect {
    if (this.state.providerRef !== null && this.state.providerRef !== providerRef) {
      throw new CardRefundAlreadyIssuedError(this.state.id);
    }
    const stopped = issuanceStopOf(this.state, issuedCents, status);
    const target: CardRefundRequestState =
      stopped !== null ? "stopped" : status === "succeeded" ? "refunded" : "issued";
    const from = this.state.state;
    if (from !== "to_issue" && !(from === "issued" && target !== "issued")) {
      return { changed: false, stopped: null };
    }
    this.move(target);
    this.state = {
      ...this.state,
      providerRef,
      issuedAt: this.state.issuedAt ?? at,
      issuedCents,
      attempts: this.state.attempts + (attempt === null || from !== "to_issue" ? 0 : 1),
      lastAttemptAt: attempt ?? this.state.lastAttemptAt,
      lastFailure: stopped,
      nextAttemptAt: null,
    };
    return { changed: true, stopped };
  }

  /**
   * Le prestataire n'a pas répondu : un essai de plus, un round de plus (une
   * 500 ne se rejoue pas sous sa clé), et la reprise à `retryAt`. Rend `true`
   * au PREMIER échec de la génération — la cloche ne sonne qu'une fois.
   */
  unavailable(at: Date, retryAt: Date): boolean {
    this.assertIn(["to_issue"], "to_issue");
    const first = this.state.attempts === 0;
    this.state = {
      ...this.state,
      attempts: this.state.attempts + 1,
      round: this.state.round + 1,
      lastFailure: UNAVAILABLE_FAILURE,
      lastAttemptAt: at,
      nextAttemptAt: retryAt,
    };
    return first;
  }

  /**
   * **Arrêtée** : rejouer ne changerait rien (`declined:<code>`,
   * `nothing_left`, `no_intent`, `rejected:<motif>`, un `re_…` mort). Plus de
   * reprise automatique ; « Relancer » ou « rendu autrement ».
   *
   * @param attempt l'instant de l'essai de l'exécuteur ; `null` pour le constat.
   */
  stop(failure: string, attempt: Date | null): void {
    this.move("stopped");
    this.state = {
      ...this.state,
      attempts: this.state.attempts + (attempt === null ? 0 : 1),
      lastAttemptAt: attempt ?? this.state.lastAttemptAt,
      lastFailure: failure,
      nextAttemptAt: null,
    };
  }

  /**
   * Le paiement n'a plus de reste : une `remainder` à émettre ou arrêtée est
   * rendue (§6.2). Rend `false` si la demande n'est pas concernée.
   */
  settleWithoutRemainder(): boolean {
    const { form, state } = this.state;
    if (form !== "remainder" || (state !== "to_issue" && state !== "stopped")) {
      return false;
    }
    this.move("refunded");
    this.state = { ...this.state, nextAttemptAt: null };
    return true;
  }

  /** **Inversion** (§6.2) : son `re_…` réussi a échoué — l'argent n'est plus rendu. */
  reverse(): void {
    this.assertIn(["refunded"], "stopped");
    this.stop("reversed", null);
  }

  /**
   * **« Relancer »** (§3.4, v13) : une `stopped` repart sous une génération
   * neuve ; une `to_issue` déjà tentée repart tout de suite, même génération.
   *
   * @throws {CardRefundRetryRefusedError} hors de ces deux cas, sous bail, ou
   *   quand une autre `remainder` du même paiement est en cours.
   */
  retry(wallNow: Date, anotherRemainderInProgress: boolean): void {
    const refusal = retryRefusalOf(
      this.state,
      this.isClaimedAt(wallNow),
      anotherRemainderInProgress,
    );
    if (refusal !== null) {
      throw new CardRefundRetryRefusedError(refusal);
    }
    if (this.state.state === "to_issue") {
      this.state = { ...this.state, nextAttemptAt: wallNow };
      return;
    }
    this.move("to_issue");
    this.state = {
      ...this.state,
      generation: this.state.generation + 1,
      round: 1,
      attempts: 0,
      providerRef: null,
      issuedAt: null,
      issuedCents: null,
      nextAttemptAt: wallNow,
    };
  }

  /** Toute la règle de « Relancer », dite au front (§3.3, `retryable`). */
  retryable(wallNow: Date, anotherRemainderInProgress: boolean): boolean {
    return (
      retryRefusalOf(this.state, this.isClaimedAt(wallNow), anotherRemainderInProgress) === null
    );
  }

  /**
   * **« Rendu autrement »** (§5.5) : l'équipe a rendu l'argent hors de la
   * plateforme. Terminal.
   *
   * @throws {CardRefundNotStoppedError} la demande n'est pas arrêtée.
   * @throws {CardRefundRequestInvalidError} motif vide ou trop long, fiche absente.
   */
  settleElsewhere(staffId: string, reason: string): void {
    if (this.state.state !== "stopped") {
      throw new CardRefundNotStoppedError(this.state.id, this.state.state);
    }
    const motive = reason.trim();
    if (motive === "" || motive.length > SETTLED_REASON_MAX || staffId.trim() === "") {
      throw new CardRefundRequestInvalidError(
        `le motif d'un « rendu autrement » tient en 1 à ${String(SETTLED_REASON_MAX)} caractères`,
      );
    }
    this.move("settled_elsewhere");
    this.state = { ...this.state, settledByStaffId: staffId, settledReason: motive };
  }

  toPersistence(): {
    readonly state: CardRefundRequestSnapshot;
    readonly expected: CardRefundRequestExpectation | null;
  } {
    return { state: this.state, expected: this.loaded };
  }

  private assertIn(
    states: readonly CardRefundRequestState[],
    target: CardRefundRequestState,
  ): void {
    if (!states.includes(this.state.state)) {
      throw new CardRefundTransitionRefusedError(this.state.id, this.state.state, target);
    }
  }

  private move(target: CardRefundRequestState): void {
    const from = this.state.state;
    if (from !== target && !isCardRefundRequestTransition(from, target)) {
      throw new CardRefundTransitionRefusedError(this.state.id, from, target);
    }
    this.state = { ...this.state, state: target };
  }
}
