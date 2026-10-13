import {
  RefundRequestAlreadyIssuedError,
  RefundRequestAmountError,
  RefundRequestNotFailedError,
} from "../errors/order-refund-request-errors.js";
import type { RefundStatus } from "./order-refund.js";

/**
 * Pourquoi de l'argent est à rendre. 🔴 Valeurs écrites en base
 * (`OrderRefundCause`) : irréversibles dès la première ligne (C4.11 bis).
 */
export const ORDER_REFUND_CAUSES = [
  "cancellation",
  "paid_after_cancellation",
  "refund_reversed",
] as const;
export type OrderRefundCause = (typeof ORDER_REFUND_CAUSES)[number];

/** Une demande telle que la table `order_refund_request` la range. */
export interface OrderRefundRequestState {
  readonly orderId: string;
  readonly cause: OrderRefundCause;
  readonly announcedCents: number;
  readonly requestedAt: Date;
  readonly requestedBy: string | null;
  readonly generation: number;
  readonly stripeRefundId: string | null;
  readonly issuedAt: Date | null;
  readonly attempts: number;
  readonly lastFailure: string | null;
  readonly lastAttemptAt: Date | null;
  readonly round: number;
  readonly claimedUntil: Date | null;
  readonly claimToken: string | null;
  readonly nextAttemptAt: Date | null;
}

/** Ce que l'intention de rendre de l'argent nomme. */
export interface RefundRequestIntent {
  readonly orderId: string;
  readonly cause: OrderRefundCause;
  readonly announcedCents: number;
  readonly requestedAt: Date;
  readonly requestedBy: string | null;
  /** Quand le balayage peut la prendre ; `null` : elle attend le bouton (C4.11 bis). */
  readonly firstAttemptAt: Date | null;
}

/** La condition de l'écriture : ce qu'on a chargé, ou `null` pour une demande neuve. */
export interface RefundRequestExpectation {
  readonly generation: number;
  readonly claimToken: string | null;
}

/** Un statut de remboursement qui dit qu'une génération est morte. */
const DEAD: ReadonlySet<RefundStatus> = new Set<RefundStatus>(["failed", "canceled"]);

/** Le préfixe de la clé d'idempotence Stripe — une valeur, stable. */
const KEY_PREFIX = "lfd-order-refund";

/** Le motif d'un essai qui n'a pas abouti, tel que l'écran le relit. */
export const UNAVAILABLE_FAILURE = "unavailable";

/**
 * **La demande de remboursement d'une commande** (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, C4.5, C4.7) — ce qui
 * a été PROMIS et ce qui a été TENTÉ. L'argent vrai reste au carnet
 * (`OrderRefundLedger`) : la demande n'a aucun statut, son état se lit par
 * {@link refundRequestStateOf}.
 *
 * Le bail (`claimedUntil`, `claimToken`) se PREND par une écriture
 * conditionnée du port de bail, hors de l'agrégat : c'est une exclusion
 * mutuelle, pas une règle métier. L'agrégat le relâche.
 */
export class OrderRefundRequest {
  private constructor(
    private state: OrderRefundRequestState,
    private readonly loaded: RefundRequestExpectation | null,
  ) {}

  /** @throws {RefundRequestAmountError} rien de positif à rendre. */
  static request(intent: RefundRequestIntent): OrderRefundRequest {
    if (!Number.isInteger(intent.announcedCents) || intent.announcedCents <= 0) {
      throw new RefundRequestAmountError(intent.announcedCents);
    }
    return new OrderRefundRequest(
      {
        orderId: intent.orderId,
        cause: intent.cause,
        announcedCents: intent.announcedCents,
        requestedAt: intent.requestedAt,
        requestedBy: intent.requestedBy,
        generation: 1,
        stripeRefundId: null,
        issuedAt: null,
        attempts: 0,
        lastFailure: null,
        lastAttemptAt: null,
        round: 1,
        claimedUntil: null,
        claimToken: null,
        nextAttemptAt: intent.firstAttemptAt,
      },
      null,
    );
  }

  static reconstitute(state: OrderRefundRequestState): OrderRefundRequest {
    return new OrderRefundRequest(state, {
      generation: state.generation,
      claimToken: state.claimToken,
    });
  }

  get orderId(): string {
    return this.state.orderId;
  }

  get generation(): number {
    return this.state.generation;
  }

  /** Les appels faits pour la génération. */
  get attempts(): number {
    return this.state.attempts;
  }

  get announcedCents(): number {
    return this.state.announcedCents;
  }

  get stripeRefundId(): string | null {
    return this.state.stripeRefundId;
  }

  /** La clé d'idempotence Stripe : change avec la génération ET avec le round (C4.7). */
  key(): string {
    return `${KEY_PREFIX}:${this.state.orderId}:${String(this.state.generation)}:${String(this.state.round)}`;
  }

  /** Le bail court-il encore à `wallNow` ? */
  isClaimedAt(wallNow: Date): boolean {
    const until = this.state.claimedUntil;
    return until !== null && until.getTime() > wallNow.getTime();
  }

  /** Ce jeton tient-il le bail ? */
  isHeldBy(token: string): boolean {
    return this.state.claimToken === token;
  }

  /**
   * Stripe a accepté `refundId` pour la génération. Le même id une seconde
   * fois ne change rien (rend `false`) ; un autre lève.
   *
   * @throws {RefundRequestAlreadyIssuedError} un autre `re_…` est déjà posé.
   */
  issued(refundId: string, at: Date): boolean {
    if (this.state.stripeRefundId === refundId) {
      return false;
    }
    if (this.state.stripeRefundId !== null) {
      throw new RefundRequestAlreadyIssuedError(this.state.orderId);
    }
    this.state = {
      ...this.state,
      stripeRefundId: refundId,
      issuedAt: at,
      attempts: this.state.attempts + 1,
      lastAttemptAt: at,
      lastFailure: null,
      nextAttemptAt: null,
    };
    return true;
  }

  /**
   * Stripe n'a pas répondu : un essai de plus, un round de plus (une 500 ne
   * se rejoue pas sous sa clé), et la reprise à `retryAt`. Rend `true` au
   * PREMIER échec de la génération — la cloche ne sonne qu'une fois.
   */
  unavailable(at: Date, retryAt: Date): boolean {
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
   * Un essai dont rejouer ne changerait rien (`declined:<code>`,
   * `nothing_left`, `rejected:<raison>`) : plus de reprise automatique, le
   * bouton reste.
   */
  stopped(at: Date, failure: string): void {
    this.state = {
      ...this.state,
      attempts: this.state.attempts + 1,
      lastFailure: failure,
      lastAttemptAt: at,
      nextAttemptAt: null,
    };
  }

  /**
   * Le `re_…` courant a échoué chez Stripe : la génération suivante, sous une
   * clé neuve — la recherche ignorera l'ancien.
   *
   * @throws {RefundRequestNotFailedError} pas de `re_…`, ou il n'est pas mort.
   */
  reopenAfterFailure(currentStatus: RefundStatus | null): void {
    if (this.state.stripeRefundId === null || currentStatus === null || !DEAD.has(currentStatus)) {
      throw new RefundRequestNotFailedError(this.state.orderId);
    }
    this.state = {
      ...this.state,
      generation: this.state.generation + 1,
      round: 1,
      attempts: 0,
      stripeRefundId: null,
      issuedAt: null,
    };
  }

  /** « Relancer » : le balayage et l'exécuteur peuvent la prendre dès `wallNow`. */
  scheduleAt(wallNow: Date): void {
    this.state = { ...this.state, nextAttemptAt: wallNow };
  }

  /** Relâche le bail. */
  release(): void {
    this.state = { ...this.state, claimedUntil: null, claimToken: null };
  }

  /** La ligne, et la condition de son écriture (`null` : à insérer). */
  toPersistence(): {
    readonly state: OrderRefundRequestState;
    readonly expected: RefundRequestExpectation | null;
  } {
    return { state: this.state, expected: this.loaded };
  }
}

/**
 * L'état LU d'une demande (C4.5) — jamais stocké :
 *
 * - `to_issue` — aucun `re_…` pour la génération, et un reste à rendre ;
 * - `issued` — le `re_…` attend la banque (`pending`, `requires_action`) ;
 * - `refunded` — il a réussi, ou le carnet dit qu'il ne reste rien ;
 * - `failed` — il a échoué ou été annulé : la génération suivante est due.
 */
export type RefundRequestState = "to_issue" | "issued" | "refunded" | "failed";

/** Ce que le carnet sait, réduit à ce que l'état lit. */
export interface RefundLedgerView {
  readonly remainderCents: number;
  readonly statusOf: (stripeRefundId: string) => RefundStatus | null;
}

export function refundRequestStateOf(
  request: { readonly stripeRefundId: string | null },
  ledger: RefundLedgerView,
): RefundRequestState {
  if (request.stripeRefundId === null) {
    return ledger.remainderCents <= 0 ? "refunded" : "to_issue";
  }
  const status = ledger.statusOf(request.stripeRefundId);
  if (status === "succeeded") {
    return "refunded";
  }
  if (status !== null && DEAD.has(status)) {
    return "failed";
  }
  return "issued";
}
