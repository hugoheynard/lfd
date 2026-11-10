import type {
  VitrineDeliveryKind,
  VitrineDeliveryState,
  VitrineNotification,
} from "@lfd/contracts";

import {
  VitrineDeliveryEmptyError,
  VitrineDeliveryNotPendingError,
  VitrineDeliveryNotResendableError,
} from "./errors/vitrine-errors.js";
import { VitrineChanges } from "./vitrine-changes.js";

/** Un refus lu à l'écran tient en une ligne : au-delà, c'est un corps de réponse. */
const MAX_ERROR_LENGTH = 300;

export interface VitrineDeliveryRecord {
  readonly id: string;
  /**
   * **L'identifiant d'ENVOI**, celui de l'en-tête `Vitrine-Delivery` : stable
   * d'un essai à l'autre, NEUF à chaque absorption. Distinct de `id`, qui
   * reste celui de la ligne du journal (« Renvoyer » la retrouve par lui).
   */
  readonly dispatchId: string;
  readonly subscriberId: string;
  readonly kind: VitrineDeliveryKind;
  /** Croissante par abonné pour `change` ; `null` pour `test`. */
  readonly sequence: number | null;
  readonly changes: VitrineChanges;
  readonly state: VitrineDeliveryState;
  readonly attempts: number;
  readonly nextAttemptAt: Date | null;
  readonly lastError: string | null;
  readonly lastStatus: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deliveredAt: Date | null;
}

/** Ce qu'un essai d'envoi a donné, vu du domaine. */
export interface VitrineDeliveryFailure {
  readonly status: number | null;
  readonly reason: string;
}

/**
 * **Une livraison à un abonné** (plan vitrine, W2′ et B3).
 *
 * Ses invariants : une livraison de changements n'est jamais vide ; elle ne
 * reçoit de nouveaux changements que tant qu'elle attend (la base tient
 * qu'il n'y en a qu'UNE en attente par abonné) ; un essai (`test`) ne se
 * relance pas, et ne se renvoie pas.
 *
 * Le délai entre deux essais n'est pas décidé ici : l'appelant le tire de la
 * politique de l'outbox (`retry-policy.ts`) et le passe à `recordFailure`.
 */
export class VitrineDelivery {
  private constructor(private state: VitrineDeliveryRecord) {}

  /** @throws {VitrineDeliveryEmptyError} aucun changement à annoncer. */
  static prepare(input: {
    readonly id: string;
    readonly subscriberId: string;
    readonly sequence: number;
    readonly changes: VitrineChanges;
    readonly at: Date;
  }): VitrineDelivery {
    if (input.changes.isEmpty) {
      throw new VitrineDeliveryEmptyError();
    }
    return new VitrineDelivery({
      ...pendingAt(input.at),
      ...input,
      dispatchId: input.id,
      kind: "change",
    });
  }

  /** « Envoyer un test » : un corps vide, `test: true`, un seul essai. */
  static test(input: {
    readonly id: string;
    readonly subscriberId: string;
    readonly at: Date;
  }): VitrineDelivery {
    return new VitrineDelivery({
      ...pendingAt(input.at),
      id: input.id,
      dispatchId: input.id,
      subscriberId: input.subscriberId,
      kind: "test",
      sequence: null,
      changes: VitrineChanges.none(),
    });
  }

  static rehydrate(state: VitrineDeliveryRecord): VitrineDelivery {
    return new VitrineDelivery(state);
  }

  /**
   * Le balayage suivant trouve d'autres changements alors que celle-ci attend
   * encore : elle les absorbe, garde sa séquence (personne ne l'a lue) et ses
   * essais — sans quoi un abonné en panne qui change toutes les cinq minutes
   * ne passerait jamais « en échec » (B3).
   *
   * 🔴 **Elle change d'identifiant d'envoi** (`dispatchId`). Un essai refusé
   * peut avoir été TRAITÉ chez l'agence (réponse arrivée trop tard) ; si le
   * contenu grossi repartait sous le même `Vitrine-Delivery`, une agence qui
   * écarte les doublons par lui perdrait les ajouts (bug corrigé le
   * 2026-10-18). Un contenu différent est un envoi différent.
   *
   * @throws {VitrineDeliveryNotPendingError}
   */
  absorb(changes: VitrineChanges, at: Date, dispatchId: string): void {
    if (this.state.state !== "pending" || this.state.kind !== "change") {
      throw new VitrineDeliveryNotPendingError(this.state.id);
    }
    this.state = {
      ...this.state,
      dispatchId,
      changes: this.state.changes.merge(changes),
      updatedAt: at,
    };
  }

  recordSuccess(status: number, at: Date): void {
    this.state = {
      ...this.state,
      state: "delivered",
      attempts: this.state.attempts + 1,
      nextAttemptAt: null,
      lastStatus: status,
      lastError: null,
      deliveredAt: at,
      updatedAt: at,
    };
  }

  /**
   * Un essai refusé. `retryAt` est `null` quand la politique dit « épuisé » :
   * la livraison passe en échec. Un essai (`test`) n'est jamais relancé.
   */
  recordFailure(failure: VitrineDeliveryFailure, retryAt: Date | null, at: Date): void {
    const next = this.state.kind === "test" ? null : retryAt;
    this.state = {
      ...this.state,
      state: next === null ? "failed" : "pending",
      attempts: this.state.attempts + 1,
      nextAttemptAt: next,
      lastStatus: failure.status,
      lastError: failure.reason.slice(0, MAX_ERROR_LENGTH),
      updatedAt: at,
    };
  }

  /**
   * « Renvoyer » : la même notification repart, essais remis à zéro. L'appelant
   * vérifie qu'aucune autre n'attend pour cet abonné.
   *
   * @throws {VitrineDeliveryNotResendableError} elle attend déjà, ou c'est un essai.
   */
  requeue(at: Date): void {
    if (this.state.kind === "test") {
      throw new VitrineDeliveryNotResendableError("test");
    }
    if (this.state.state === "pending") {
      throw new VitrineDeliveryNotResendableError("pending");
    }
    this.state = {
      ...this.state,
      ...pendingAt(at),
      createdAt: this.state.createdAt,
      deliveredAt: null,
    };
  }

  /** Le corps envoyé : un signal, l'agence relit. */
  notification(): VitrineNotification {
    const { changed, removed } = this.state.changes.toShape();
    const base = {
      subscriber: this.state.subscriberId,
      sequence: this.state.sequence ?? 0,
      at: this.state.updatedAt.toISOString(),
      changed,
      removed,
    };
    return this.state.kind === "test" ? { ...base, test: true } : base;
  }

  get id(): string {
    return this.state.id;
  }

  /** La valeur de l'en-tête `Vitrine-Delivery`. */
  get dispatchId(): string {
    return this.state.dispatchId;
  }

  get subscriberId(): string {
    return this.state.subscriberId;
  }

  get kind(): VitrineDeliveryKind {
    return this.state.kind;
  }

  get attempts(): number {
    return this.state.attempts;
  }

  get isPending(): boolean {
    return this.state.state === "pending";
  }

  get isFailed(): boolean {
    return this.state.state === "failed";
  }

  toPersistence(): VitrineDeliveryRecord {
    return this.state;
  }
}

function pendingAt(at: Date): PendingFields {
  return {
    state: "pending",
    attempts: 0,
    nextAttemptAt: at,
    lastError: null,
    lastStatus: null,
    createdAt: at,
    updatedAt: at,
    deliveredAt: null,
  };
}

type PendingFields = Pick<
  VitrineDeliveryRecord,
  | "state"
  | "attempts"
  | "nextAttemptAt"
  | "lastError"
  | "lastStatus"
  | "createdAt"
  | "updatedAt"
  | "deliveredAt"
>;
