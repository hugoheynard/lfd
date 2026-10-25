import { EmptyShortfallError, NoShortfallToDecideError } from "../errors/order-shortfall-errors.js";

/** Une ligne de la commande au signalement : la quantité due et ce qui est au bac. */
export interface ShortfallQuantity {
  readonly sku: string;
  readonly due: number;
  readonly packed: number;
}

/** L'état tel que l'adaptateur l'écrit et le relit. */
export interface OrderShortfallSnapshot {
  readonly orderId: string;
  readonly reference: string;
  /** Le signalement en vigueur ; `null` = aucun, rien n'attend de décision. */
  readonly reportedAt: Date | null;
  /** Non nul exactement quand `reportedAt` l'est (CHECK en base). */
  readonly lines: readonly ShortfallQuantity[] | null;
  /** Le dernier effacement reçu. */
  readonly clearedAt: Date | null;
  /**
   * La décision qui a résolu le signal en vigueur (E6b) ; il reste posé, il
   * n'attend plus. Absent = aucune : un snapshot d'avant le champ.
   */
  readonly decidedAt?: Date | null;
}

/** Le signal en vigueur, tel que la décision le reprend. */
export interface PendingShortfall {
  readonly reportedAt: Date;
  readonly lines: readonly ShortfallQuantity[];
}

/**
 * **Le manque signalé sur une commande** — « décision attendue » (lot E6a,
 * `documentation/commandes/plan-e6-le-depart-incomplet.md` § 3).
 *
 * Le snapshot de deux faits du colisage, `packing.shortfall_reported` et
 * `packing.shortfall_cleared`, livrés au moins une fois et dans un ordre que
 * personne ne garantit. L'invariant : **le fait le plus récent gagne**. Un
 * signalement ne remplace que s'il est postérieur au signalement en vigueur ET
 * au dernier effacement ; un effacement n'efface qu'un signalement antérieur.
 * Un fait rejoué ou en retard est donc sans effet, jamais une erreur — sous la
 * boîte d'envoi, une erreur finirait en message mort pour rien.
 *
 * Pas d'agrégat `Order` ici : la commande est un agrégat de PASSATION qui ne
 * se recharge pas (cf. `OrderCancellationRepository`) ; le manque ne touche ni
 * ses lignes, ni son statut, ni son argent.
 */
export class OrderShortfall {
  private constructor(
    readonly orderId: string,
    readonly reference: string,
    private reportedAtValue: Date | null,
    private linesValue: readonly ShortfallQuantity[] | null,
    private clearedAtValue: Date | null,
    private decidedAtValue: Date | null,
  ) {}

  static fromSnapshot(snapshot: OrderShortfallSnapshot): OrderShortfall {
    return new OrderShortfall(
      snapshot.orderId,
      snapshot.reference,
      snapshot.reportedAt,
      snapshot.lines,
      snapshot.clearedAt,
      snapshot.decidedAt ?? null,
    );
  }

  /** « Manque signalé — décision attendue ». */
  get awaitingDecision(): boolean {
    return this.reportedAtValue !== null && this.decidedAtValue === null;
  }

  /** Le signal décidé est définitif (Q-I4) : plus aucun fait du colisage ne le touche. */
  get decided(): boolean {
    return this.decidedAtValue !== null;
  }

  /** Le signal qui attend une décision, ou `null`. */
  get pending(): PendingShortfall | null {
    const { reportedAtValue: reportedAt, linesValue: lines } = this;
    if (this.decided || reportedAt === null || lines === null) {
      return null;
    }
    return { reportedAt, lines };
  }

  /**
   * **Le signal est résolu par une décision** (E6b, plan § 13) : il n'est pas
   * effacé — ses quantités sont celles qui partent —, il n'attend plus.
   *
   * @throws {NoShortfallToDecideError} aucun signal n'attend de décision.
   */
  decide(at: Date): void {
    if (!this.awaitingDecision) {
      throw new NoShortfallToDecideError(this.reference);
    }
    this.decidedAtValue = at;
  }

  /**
   * Pose le signalement, ou remplace le précédent.
   *
   * @returns `false` si le fait est plus ancien que l'état connu : rien n'est changé.
   * @throws {EmptyShortfallError} un signalement sans aucune ligne.
   */
  report(at: Date, lines: readonly ShortfallQuantity[]): boolean {
    if (lines.length === 0) {
      throw new EmptyShortfallError(this.reference);
    }
    // Une fiche autorisée ne se re-signale pas (packing) : un fait qui
    // arriverait quand même est sans effet, la décision est définitive.
    if (this.decided) {
      return false;
    }
    if (!isAfter(at, this.reportedAtValue) || !isAfter(at, this.clearedAtValue)) {
      return false;
    }
    this.reportedAtValue = at;
    this.linesValue = lines;
    return true;
  }

  /**
   * Efface le signalement : le bac s'est fermé complet.
   *
   * L'instant est retenu même sans signalement en vigueur, pour qu'un
   * signalement plus ancien, livré après, ne ressuscite pas.
   *
   * @returns `false` si le fait est plus ancien que l'état connu.
   */
  clear(at: Date): boolean {
    if (this.decided) {
      return false;
    }
    if (!isAfter(at, this.clearedAtValue) || !isAfter(at, this.reportedAtValue, true)) {
      return false;
    }
    this.clearedAtValue = at;
    this.reportedAtValue = null;
    this.linesValue = null;
    return true;
  }

  toSnapshot(): OrderShortfallSnapshot {
    return {
      orderId: this.orderId,
      reference: this.reference,
      reportedAt: this.reportedAtValue,
      lines: this.linesValue,
      clearedAt: this.clearedAtValue,
      decidedAt: this.decidedAtValue,
    };
  }
}

/** `at` est-il postérieur à `known` (strictement, sauf `orEqual`) ? Rien de connu : oui. */
function isAfter(at: Date, known: Date | null, orEqual = false): boolean {
  if (known === null) {
    return true;
  }
  return orEqual ? at.getTime() >= known.getTime() : at.getTime() > known.getTime();
}
