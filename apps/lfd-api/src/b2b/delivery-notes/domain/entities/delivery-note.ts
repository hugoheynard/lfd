import {
  DeliveryNoteNotPlannedError,
  DeliveryNoteWithoutLinesError,
} from "../errors/delivery-note-errors.js";
import {
  DeliveryNoteLine,
  type DeliveryNoteLineState,
} from "../value-objects/delivery-note-line.js";
import { DeliveryNoteNumber } from "../value-objects/delivery-note-number.js";

/**
 * Le cycle d'un BL. E1 n'écrit que `planned` et `voided` ; `prepared` (le
 * colisage, E3) et `handed_over` (le retrait, E3) arrivent aux lots suivants.
 */
export const DELIVERY_NOTE_STATUSES = ["planned", "prepared", "handed_over", "voided"] as const;
export type DeliveryNoteStatus = (typeof DELIVERY_NOTE_STATUSES)[number];

/** Le premier BL d'une commande — le seul qu'E1 prévoit. */
export const FIRST_DELIVERY_NOTE_RANK = 1;

/** Ce que la prévision lit d'une commande : son identité et ses lignes figées. */
export interface DeliveryNoteSource {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly lines: readonly DeliveryNoteLineState[];
}

/** L'état complet d'un BL, tel que l'adaptateur l'écrit et le relit. */
export interface DeliveryNoteState {
  readonly id: string;
  readonly orderId: string;
  readonly rank: number;
  readonly number: string;
  readonly status: DeliveryNoteStatus;
  readonly plannedAt: Date;
  readonly voidedAt: Date | null;
  readonly lines: readonly DeliveryNoteLineState[];
}

/**
 * **Le bon de livraison** — plan `documentation/commandes/plan-e1-bon-de-livraison-prevu.md`.
 *
 * Prévu, il est un **brouillon qui appartient à sa commande** (plan E1, § 6,
 * bloquant 1) : chaque arrêt du plan réécrit ses lignes sur celles de la
 * commande, le rang et le numéro restent ceux du premier. Annulé, il reste en
 * base et consomme son numéro.
 */
export class DeliveryNote {
  private constructor(
    private readonly identity: Omit<DeliveryNoteState, "status" | "voidedAt" | "lines">,
    private currentStatus: DeliveryNoteStatus,
    private currentVoidedAt: Date | null,
    private currentLines: readonly DeliveryNoteLine[],
  ) {}

  /**
   * Le BL-1 d'une commande que l'arrêt du plan vient de confirmer : prévu, ses
   * lignes égales à celles de la commande.
   *
   * @throws {DeliveryNoteWithoutLinesError} la commande n'a aucune ligne.
   */
  static planFromOrder(id: string, source: DeliveryNoteSource, plannedAt: Date): DeliveryNote {
    const number = DeliveryNoteNumber.of(source.orderNumber, FIRST_DELIVERY_NOTE_RANK);
    const identity = {
      id,
      orderId: source.orderId,
      rank: FIRST_DELIVERY_NOTE_RANK,
      number: number.value,
      plannedAt,
    };
    return new DeliveryNote(identity, "planned", null, linesOf(source));
  }

  /** Recharge un BL écrit ; ses lignes revalident. */
  static rehydrate(state: DeliveryNoteState): DeliveryNote {
    const { status, voidedAt, lines, ...identity } = state;
    return new DeliveryNote(
      identity,
      status,
      voidedAt,
      lines.map((l) => DeliveryNoteLine.of(l)),
    );
  }

  get orderId(): string {
    return this.identity.orderId;
  }

  get status(): DeliveryNoteStatus {
    return this.currentStatus;
  }

  /**
   * Réécrit les lignes d'un BL prévu sur celles de sa commande — une re-clôture
   * après réouverture, une réannonce, une seconde livraison du fait.
   *
   * @throws {DeliveryNoteNotPlannedError} le BL n'est plus prévu.
   * @throws {DeliveryNoteWithoutLinesError} la commande n'a plus aucune ligne.
   */
  replanFrom(source: DeliveryNoteSource): void {
    this.ensurePlanned();
    this.currentLines = linesOf(source);
  }

  /**
   * Annule un BL prévu — sa commande est annulée. Il reste en base, et son
   * numéro n'est jamais réemployé.
   *
   * @throws {DeliveryNoteNotPlannedError} le BL n'est plus prévu.
   */
  void(at: Date): void {
    this.ensurePlanned();
    this.currentStatus = "voided";
    this.currentVoidedAt = at;
  }

  toState(): DeliveryNoteState {
    return {
      ...this.identity,
      status: this.currentStatus,
      voidedAt: this.currentVoidedAt,
      lines: this.currentLines.map((line) => line.state),
    };
  }

  private ensurePlanned(): void {
    if (this.currentStatus !== "planned") {
      throw new DeliveryNoteNotPlannedError(this.identity.number, this.currentStatus);
    }
  }
}

function linesOf(source: DeliveryNoteSource): readonly DeliveryNoteLine[] {
  if (source.lines.length === 0) {
    throw new DeliveryNoteWithoutLinesError(source.orderNumber);
  }
  return source.lines.map((line) => DeliveryNoteLine.of(line));
}
