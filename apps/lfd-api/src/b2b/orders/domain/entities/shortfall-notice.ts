import { ShortfallCustomerAlreadyNotifiedError } from "../errors/shortfall-letter-errors.js";

/** L'état tel que l'adaptateur le lit et l'écrit, sur la ligne de la décision. */
export interface ShortfallNoticeSnapshot {
  readonly decisionId: string;
  readonly orderId: string;
  readonly reference: string;
  readonly notifiedAt: Date | null;
  readonly notifiedBy: string | null;
}

/**
 * **Le client prévenu du départ incomplet** (plan
 * `documentation/commandes/plan-e6d-ecrire-au-client.md`, § 1) — la part de
 * la décision que le geste « Écrire au client » écrit.
 *
 * Son invariant : **une fois par décision**. L'instant et l'auteur vont
 * ensemble (le CHECK de la table le redit) ; un second envoi est refusé avant
 * de partir, et la clé d'idempotence du courriel absorbe la course.
 */
export class ShortfallNotice {
  private constructor(private state: ShortfallNoticeSnapshot) {}

  static fromSnapshot(snapshot: ShortfallNoticeSnapshot): ShortfallNotice {
    return new ShortfallNotice(snapshot);
  }

  /** La clé d'idempotence du courriel : une par décision. */
  get letterKey(): string {
    return `order-shortfall:${this.state.decisionId}`;
  }

  get reference(): string {
    return this.state.reference;
  }

  /** @throws {ShortfallCustomerAlreadyNotifiedError} le client a déjà été prévenu. */
  notify(at: Date, by: string): void {
    if (this.state.notifiedAt !== null) {
      throw new ShortfallCustomerAlreadyNotifiedError(this.state.reference);
    }
    this.state = { ...this.state, notifiedAt: at, notifiedBy: by };
  }

  toSnapshot(): ShortfallNoticeSnapshot {
    return this.state;
  }
}
