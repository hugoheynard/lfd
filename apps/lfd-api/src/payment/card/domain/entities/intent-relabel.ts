import type { IntentLabel } from "../value-objects/intent-label.js";

/** Au-delà de tant d'essais en panne, le libellé est abandonné (et journalisé). */
export const MAX_RELABEL_ATTEMPTS = 8;

/** Premier délai : cinq minutes — le pas du balayage —, doublé à chaque panne. */
const FIRST_DELAY_MS = 5 * 60 * 1000;
/** Plafond : six heures. Huit essais couvrent une dizaine d'heures de panne. */
const MAX_DELAY_MS = 6 * 60 * 60 * 1000;

/** La raison gardée d'une panne, bornée : elle vient du prestataire. */
const FAILURE_MAX = 500;

/**
 * Où en est le libellé : `pending` (à poser), `posted` (posé chez le
 * prestataire), `abandoned` (refusé, ou essais épuisés — le paiement n'en
 * est pas touché). 🔴 Valeurs écrites en base.
 */
export type IntentRelabelState = "pending" | "posted" | "abandoned";

/** La ligne, telle que le port la lit et l'écrit. */
export interface IntentRelabelSnapshot {
  readonly paymentId: string;
  readonly description: string;
  readonly metadata: Readonly<Record<string, string>>;
  /** Monte à chaque libellé neuf : un essai lancé sur l'ancien ne conclut rien. */
  readonly revision: number;
  readonly state: IntentRelabelState;
  readonly attempts: number;
  readonly nextAttemptAt: Date;
  readonly lastFailure: string | null;
  readonly updatedAt: Date;
}

/** Ce qu'une panne a décidé : reprendre plus tard, abandonner, ou rien (essai périmé). */
export type IntentRelabelFailure = "retry" | "abandoned" | "stale";

/**
 * **Le libellé définitif d'une intention, à poser chez le prestataire** (plan
 * `documentation/payment/plan-pointage-stripe.md`, lot 2) — un par paiement.
 *
 * Il porte les deux règles qui refusent une écriture : un libellé identique
 * à celui qu'il garde ne relance rien (un fait relivré est sans effet), et
 * l'issue d'un essai ne conclut que la révision qu'il a lue. Les essais sont
 * bornés ; un abandon ne touche jamais au paiement.
 */
export class IntentRelabel {
  private constructor(
    private state: IntentRelabelSnapshot,
    /** La révision lue en base ; `null` : la ligne est neuve. L'écriture s'y conditionne. */
    readonly loadedRevision: number | null,
  ) {}

  /** Un libellé neuf, dû tout de suite. */
  static request(paymentId: string, label: IntentLabel, at: Date): IntentRelabel {
    return new IntentRelabel(
      {
        paymentId,
        description: label.description,
        metadata: label.metadata,
        revision: 1,
        state: "pending",
        attempts: 0,
        nextAttemptAt: at,
        lastFailure: null,
        updatedAt: at,
      },
      null,
    );
  }

  static rehydrate(snapshot: IntentRelabelSnapshot): IntentRelabel {
    return new IntentRelabel(snapshot, snapshot.revision);
  }

  get paymentId(): string {
    return this.state.paymentId;
  }

  get revision(): number {
    return this.state.revision;
  }

  /**
   * Remplace le libellé s'il diffère, et le rend dû. Rend `false` quand il est
   * identique : rien ne change, quel que soit l'état (idempotence du fait).
   */
  describe(label: IntentLabel, at: Date): boolean {
    if (sameLabel(this.state, label)) {
      return false;
    }
    this.state = {
      ...this.state,
      description: label.description,
      metadata: label.metadata,
      revision: this.state.revision + 1,
      state: "pending",
      attempts: 0,
      nextAttemptAt: at,
      lastFailure: null,
      updatedAt: at,
    };
    return true;
  }

  /** Le libellé est-il à poser à cet instant ? */
  isDueAt(at: Date): boolean {
    return this.state.state === "pending" && this.state.nextAttemptAt.getTime() <= at.getTime();
  }

  /** Posé. Rend `false` si l'essai portait une révision périmée, ou si ce n'était plus à poser. */
  markPosted(revision: number, at: Date): boolean {
    if (!this.concerns(revision)) {
      return false;
    }
    this.state = { ...this.state, state: "posted", lastFailure: null, updatedAt: at };
    return true;
  }

  /**
   * Un essai en échec. `definitive` (le prestataire refuse la demande) ou les
   * essais épuisés : abandonné. Sinon, repris après un délai croissant.
   */
  markFailed(
    revision: number,
    failure: string,
    definitive: boolean,
    at: Date,
  ): IntentRelabelFailure {
    if (!this.concerns(revision)) {
      return "stale";
    }
    const attempts = this.state.attempts + 1;
    const lastFailure = failure.slice(0, FAILURE_MAX);
    if (definitive || attempts >= MAX_RELABEL_ATTEMPTS) {
      this.state = { ...this.state, state: "abandoned", attempts, lastFailure, updatedAt: at };
      return "abandoned";
    }
    const nextAttemptAt = new Date(at.getTime() + relabelDelayMs(attempts));
    this.state = { ...this.state, attempts, nextAttemptAt, lastFailure, updatedAt: at };
    return "retry";
  }

  /** Ce que l'adaptateur pose chez le prestataire. */
  label(): { readonly description: string; readonly metadata: Readonly<Record<string, string>> } {
    return { description: this.state.description, metadata: this.state.metadata };
  }

  toSnapshot(): IntentRelabelSnapshot {
    return this.state;
  }

  private concerns(revision: number): boolean {
    return revision === this.state.revision && this.state.state === "pending";
  }
}

/** Délai avant le prochain essai, une fois `attempts` essais échoués (≥ 1). */
export function relabelDelayMs(attempts: number): number {
  return Math.min(FIRST_DELAY_MS * 2 ** Math.max(0, attempts - 1), MAX_DELAY_MS);
}

function sameLabel(current: IntentRelabelSnapshot, label: IntentLabel): boolean {
  if (current.description !== label.description) {
    return false;
  }
  const before = Object.entries(current.metadata);
  const after = Object.entries(label.metadata);
  return (
    before.length === after.length && after.every(([key, value]) => current.metadata[key] === value)
  );
}
