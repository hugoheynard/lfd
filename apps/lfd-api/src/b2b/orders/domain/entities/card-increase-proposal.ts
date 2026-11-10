import {
  CardIncreaseAfterCutoffError,
  CardIncreaseTransitionRefusedError,
  InvalidCardIncreaseProposalError,
  UnknownCardIncreaseStateError,
} from "../errors/card-increase-proposal-errors.js";
import type { RevisionActor } from "./order-revision.js";

/**
 * **Le projet de hausse d'une commande payée par carte** (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, §1, §2.2,
 * §2.3) — la modification attend ici que son complément soit payé ; la
 * commande ne change pas avant.
 *
 * L'agrégat tient la machine des sept états, et elle seule :
 *
 * ```
 * awaiting_payment → ready | abandoned
 * ready            → applied | refused | stalled
 * stalled          → ready | refused
 * abandoned        → closed
 * ```
 *
 * Toute transition est écrite **conditionnée** sur l'état relu
 * ({@link expectedState}) : deux gestes qui se croisent n'écrivent jamais
 * l'un sur l'autre — le second n'écrit rien, et le dépôt le dit.
 */

export const CARD_INCREASE_STATES = [
  "awaiting_payment",
  "ready",
  "applied",
  "refused",
  "stalled",
  "abandoned",
  "closed",
] as const;
export type CardIncreaseState = (typeof CARD_INCREASE_STATES)[number];

/** Les états d'un projet VIVANT — un seul par commande (R5, index unique partiel). */
export const LIVE_CARD_INCREASE_STATES: readonly CardIncreaseState[] = [
  "awaiting_payment",
  "ready",
  "stalled",
];

/**
 * Pourquoi un projet en attente de paiement est abandonné (R12) — le délai,
 * le client, l'équipe (« Abandonner » sur la fiche, §2.5), le remplacement par
 * une nouvelle hausse, ou l'annulation de la commande.
 */
export type CardIncreaseAbandonCause =
  "expired" | "customer" | "staff" | "replaced" | "order_cancelled";

/** Le délai de paiement (Q1, Hugo, 2026-11-10) : 15 minutes. */
export const CARD_INCREASE_PAYMENT_DELAY_MS = 15 * 60 * 1000;

/** Au 5ᵉ échec de l'exécuteur, le projet passe `stalled` et la cloche sonne (§2.6). */
export const CARD_INCREASE_MAX_ATTEMPTS = 5;

/** Au 3ᵉ contrôle au prestataire en échec, la cloche sonne (§2.7) — compteur à part des essais. */
export const CARD_INCREASE_PROVIDER_CHECK_BELL = 3;

/** Les règles figées de l'auteur au geste (§2.3) — relues à l'application (R6, R7). */
export interface FrozenIncreaseRules {
  readonly rulesOf: RevisionActor["kind"];
}

/** Le contenu saisi, tel qu'il a été chiffré : opaque pour l'agrégat, recomposé à l'application. */
export type FrozenIncreaseContent = Readonly<Record<string, unknown>>;

/** Ce que l'agrégat porte, et que le dépôt écrit et relit. */
export interface CardIncreaseProposalState {
  readonly id: string;
  readonly orderId: string;
  readonly baseRevision: number;
  readonly content: FrozenIncreaseContent;
  readonly rules: FrozenIncreaseRules;
  readonly targetTotalCents: number;
  readonly complementCents: number;
  readonly author: RevisionActor;
  readonly paymentId: string;
  readonly state: CardIncreaseState;
  readonly expiresAt: Date;
  readonly attempts: number;
  readonly nextAttemptAt: Date | null;
  readonly leasedUntil: Date | null;
  readonly lastFailure: string | null;
  readonly providerChecks: number;
  readonly refusal: string | null;
  readonly createdAt: Date;
  readonly settledAt: Date | null;
  readonly closedAt: Date | null;
}

/** Ce que la hausse demandée apporte à sa naissance (§2.4). */
export interface ProposedIncrease {
  readonly id: string;
  readonly orderId: string;
  readonly baseRevision: number;
  readonly content: FrozenIncreaseContent;
  readonly rules: FrozenIncreaseRules;
  readonly totalBeforeCents: number;
  readonly targetTotalCents: number;
  readonly author: RevisionActor;
  readonly paymentId: string;
  readonly now: Date;
  /** L'heure limite de la journée, ou `null` sans limite : elle borne le délai (Q1). */
  readonly cutoff: Date | null;
}

export class CardIncreaseProposal {
  private constructor(
    private current: CardIncreaseProposalState,
    /** L'état relu (ou `null` à la naissance) : la condition de l'écriture. */
    readonly expectedState: CardIncreaseState | null,
  ) {}

  /**
   * **Une hausse est demandée** : le complément est l'écart des totaux, le
   * délai 15 minutes, raccourci à l'heure limite si elle tombe avant (Q1).
   *
   * @throws {InvalidCardIncreaseProposalError} ce n'est pas une hausse, ou l'auteur est vide.
   * @throws {CardIncreaseAfterCutoffError} l'heure limite est déjà passée.
   */
  static propose(input: ProposedIncrease): CardIncreaseProposal {
    const complementCents = input.targetTotalCents - input.totalBeforeCents;
    if (!Number.isInteger(complementCents) || complementCents <= 0) {
      throw new InvalidCardIncreaseProposalError(
        `le total visé (${input.targetTotalCents}) doit dépasser le total payé (${input.totalBeforeCents})`,
      );
    }
    ensureFilled("commande", input.orderId);
    ensureFilled("paiement", input.paymentId);
    if (!Number.isInteger(input.baseRevision) || input.baseRevision < 0) {
      throw new InvalidCardIncreaseProposalError(
        "la révision corrigée doit être un entier positif",
      );
    }
    const delay = input.now.getTime() + CARD_INCREASE_PAYMENT_DELAY_MS;
    if (input.cutoff !== null && input.cutoff.getTime() <= input.now.getTime()) {
      throw new CardIncreaseAfterCutoffError(input.orderId);
    }
    const expiresAt = new Date(
      input.cutoff === null ? delay : Math.min(delay, input.cutoff.getTime()),
    );
    return new CardIncreaseProposal(
      {
        id: input.id,
        orderId: input.orderId,
        baseRevision: input.baseRevision,
        content: input.content,
        rules: input.rules,
        targetTotalCents: input.targetTotalCents,
        complementCents,
        author: input.author,
        paymentId: input.paymentId,
        state: "awaiting_payment",
        expiresAt,
        attempts: 0,
        nextAttemptAt: null,
        leasedUntil: null,
        lastFailure: null,
        providerChecks: 0,
        refusal: null,
        createdAt: input.now,
        settledAt: null,
        closedAt: null,
      },
      null,
    );
  }

  /**
   * Réhydrate une ligne relue ; l'état relu devient la condition d'écriture.
   *
   * @throws {UnknownCardIncreaseStateError} l'état n'est pas des sept.
   */
  static rehydrate(
    row: Omit<CardIncreaseProposalState, "state"> & { readonly state: string },
  ): CardIncreaseProposal {
    const state = CARD_INCREASE_STATES.find((known) => known === row.state);
    if (state === undefined) {
      throw new UnknownCardIncreaseStateError(row.id, row.state);
    }
    return new CardIncreaseProposal({ ...row, state }, state);
  }

  get id(): string {
    return this.current.id;
  }

  get state(): CardIncreaseState {
    return this.current.state;
  }

  get complementCents(): number {
    return this.current.complementCents;
  }

  /** Vivant : il bloque toute autre modification de la commande (R5). */
  get live(): boolean {
    return LIVE_CARD_INCREASE_STATES.includes(this.current.state);
  }

  /** Ce que le dépôt écrit. */
  toPersistence(): CardIncreaseProposalState {
    return this.current;
  }

  /** Le complément est encaissé à temps : le projet attend d'être appliqué (§2.5). */
  markPaid(at: Date): void {
    this.move(["awaiting_payment"], "ready", "payé");
    this.current = { ...this.current, settledAt: at, nextAttemptAt: at };
  }

  /**
   * Délai passé, client, remplacement ou annulation de la commande (R9,
   * §2.7). La cause ({@link CardIncreaseAbandonCause}) ne va pas en base :
   * elle part au journal (R12), de la main du geste.
   */
  abandon(at: Date): void {
    this.move(["awaiting_payment"], "abandoned", "abandonné");
    this.current = { ...this.current, closedAt: at };
  }

  /** La modification est écrite (§2.6). */
  apply(at: Date): void {
    this.move(["ready"], "applied", "appliqué");
    this.current = { ...this.current, closedAt: at, leasedUntil: null, nextAttemptAt: null };
  }

  /** Plus possible : le complément sera rendu (R7, R8, R9). */
  refuse(refusal: string, at: Date): void {
    ensureFilled("refus", refusal);
    this.move(["ready", "stalled"], "refused", "refusé");
    this.current = {
      ...this.current,
      refusal,
      closedAt: at,
      leasedUntil: null,
      nextAttemptAt: null,
    };
  }

  /**
   * Une panne de l'exécuteur : un essai de plus, et le prochain à `retryAt` ;
   * au {@link CARD_INCREASE_MAX_ATTEMPTS}ᵉ, `stalled` (§2.6).
   *
   * @returns `true` si le projet vient de passer `stalled` (la cloche sonne).
   */
  recordFailure(failure: string, retryAt: Date): boolean {
    this.ensureIn(["ready"], "relancé après une panne");
    const attempts = this.current.attempts + 1;
    const stalled = attempts >= CARD_INCREASE_MAX_ATTEMPTS;
    this.current = {
      ...this.current,
      attempts,
      lastFailure: failure,
      leasedUntil: null,
      nextAttemptAt: stalled ? null : retryAt,
      state: stalled ? "stalled" : "ready",
    };
    return stalled;
  }

  /** Un contrôle au prestataire a échoué (§2.7) ; `true` au 3ᵉ exactement : la cloche sonne une fois. */
  recordProviderCheckFailure(): boolean {
    this.ensureIn(["awaiting_payment"], "vérifié chez le prestataire");
    const providerChecks = this.current.providerChecks + 1;
    this.current = { ...this.current, providerChecks };
    return providerChecks === CARD_INCREASE_PROVIDER_CHECK_BELL;
  }

  /** « Relancer » (`b2b_orders:write`) : les essais repartent de zéro. */
  relaunch(at: Date): void {
    this.move(["stalled"], "ready", "relancé");
    this.current = { ...this.current, attempts: 0, nextAttemptAt: at, lastFailure: null };
  }

  /** Le complément d'un projet abandonné est encaissé tard : il sera rendu (§2.5). */
  closeLatePayment(at: Date): void {
    this.move(["abandoned"], "closed", "encaissé");
    this.current = { ...this.current, settledAt: at };
  }

  private move(from: readonly CardIncreaseState[], to: CardIncreaseState, gesture: string): void {
    this.ensureIn(from, gesture);
    this.current = { ...this.current, state: to };
  }

  private ensureIn(from: readonly CardIncreaseState[], gesture: string): void {
    if (!from.includes(this.current.state)) {
      throw new CardIncreaseTransitionRefusedError(this.current.id, this.current.state, gesture);
    }
  }
}

function ensureFilled(what: string, value: string): void {
  if (value.trim() === "") {
    throw new InvalidCardIncreaseProposalError(`le champ « ${what} » est vide`);
  }
}
