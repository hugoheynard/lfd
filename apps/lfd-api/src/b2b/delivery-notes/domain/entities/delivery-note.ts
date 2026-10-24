import {
  DeliveryNoteNotPlannedError,
  DeliveryNoteTransitionRefusedError,
  DeliveryNoteWithoutLinesError,
  InvalidDeliveryNoteReceivedOnError,
} from "../errors/delivery-note-errors.js";
import {
  DeliveryNoteLine,
  type DeliveryNoteLineState,
} from "../value-objects/delivery-note-line.js";
import { DeliveryNoteNumber } from "../value-objects/delivery-note-number.js";

/**
 * Le cycle d'un BL : `planned` à l'arrêt du plan (E1), `prepared` au bac
 * fermé, `handed_over` à la remise (E2), `voided` avec l'annulation de sa
 * commande.
 */
export const DELIVERY_NOTE_STATUSES = ["planned", "prepared", "handed_over", "voided"] as const;
export type DeliveryNoteStatus = (typeof DELIVERY_NOTE_STATUSES)[number];

/** Le premier BL d'une commande — le seul que le système écrit jusqu'aux reliquats. */
export const FIRST_DELIVERY_NOTE_RANK = 1;

/** Un jour civil `AAAA-MM-JJ` — la forme de la date de réception d'une commande. */
const CIVIL_DAY = /^\d{4}-\d{2}-\d{2}$/;

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
  readonly preparedAt: Date | null;
  readonly handedOverAt: Date | null;
  /** Jour de réception `AAAA-MM-JJ` (Europe/Paris), celui de la commande. */
  readonly receivedOn: string | null;
  readonly lines: readonly DeliveryNoteLineState[];
}

/** Ce qui bouge dans un BL ; le reste est son identité. */
type Progress = Pick<
  DeliveryNoteState,
  "status" | "voidedAt" | "preparedAt" | "handedOverAt" | "receivedOn"
>;
type Identity = Omit<DeliveryNoteState, keyof Progress | "lines">;

const PLANNED: Progress = {
  status: "planned",
  voidedAt: null,
  preparedAt: null,
  handedOverAt: null,
  receivedOn: null,
};

/**
 * **Le bon de livraison** — plans `documentation/commandes/plan-e1-bon-de-livraison-prevu.md`
 * et `plan-e2-rattrapage-des-bons.md`.
 *
 * Prévu, il est un **brouillon qui appartient à sa commande** (plan E1, § 6,
 * bloquant 1) : chaque arrêt du plan réécrit ses lignes sur celles de la
 * commande, le rang et le numéro restent ceux du premier. Il **suit** ensuite
 * la commande (plan E2, § 8.3) : préparé au bac fermé, remis avec elle. Annulé,
 * il reste en base et consomme son numéro ; remis, il ne bouge plus.
 */
export class DeliveryNote {
  private constructor(
    private readonly identity: Identity,
    private progress: Progress,
    private currentLines: readonly DeliveryNoteLine[],
  ) {}

  /**
   * Le BL-1 d'une commande, prévu, ses lignes égales à celles de la commande.
   * Un BL né hors plan passe par ici puis par {@link prepare} / {@link handOver}.
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
    return new DeliveryNote(identity, PLANNED, linesOf(source));
  }

  /** Recharge un BL écrit ; ses lignes revalident. */
  static rehydrate(state: DeliveryNoteState): DeliveryNote {
    const { status, voidedAt, preparedAt, handedOverAt, receivedOn, lines, ...identity } = state;
    return new DeliveryNote(
      identity,
      { status, voidedAt, preparedAt, handedOverAt, receivedOn },
      lines.map((l) => DeliveryNoteLine.of(l)),
    );
  }

  get orderId(): string {
    return this.identity.orderId;
  }

  get status(): DeliveryNoteStatus {
    return this.progress.status;
  }

  /** Vivant = pas annulé : une commande vivante en a exactement un (plan E2, § 1). */
  get isLive(): boolean {
    return this.progress.status !== "voided";
  }

  /**
   * Réécrit les lignes d'un BL prévu sur celles de sa commande — une re-clôture
   * après réouverture, une réannonce, ou juste avant de l'avancer.
   *
   * @throws {DeliveryNoteNotPlannedError} le BL n'est plus prévu.
   * @throws {DeliveryNoteWithoutLinesError} la commande n'a plus aucune ligne.
   */
  replanFrom(source: DeliveryNoteSource): void {
    if (this.progress.status !== "planned") {
      throw new DeliveryNoteNotPlannedError(this.identity.number, this.progress.status);
    }
    this.currentLines = linesOf(source);
  }

  /**
   * Le bac est fermé : prévu → préparé.
   *
   * @throws {DeliveryNoteTransitionRefusedError} le BL n'est plus prévu.
   */
  prepare(at: Date): void {
    this.ensureIn(["planned"], "préparé");
    this.progress = { ...this.progress, status: "prepared", preparedAt: at };
  }

  /**
   * La marchandise a changé de mains, depuis un BL prévu **ou** préparé.
   * Depuis `planned` (une commande remise sans bac), l'instant de préparation
   * est celui de la remise (plan E2, § 8.3).
   *
   * @throws {DeliveryNoteTransitionRefusedError} le BL est déjà remis ou annulé.
   * @throws {InvalidDeliveryNoteReceivedOnError} le jour n'est pas `AAAA-MM-JJ`.
   */
  handOver(at: Date, receivedOn: string): void {
    this.ensureIn(["planned", "prepared"], "remis");
    if (!CIVIL_DAY.test(receivedOn)) {
      throw new InvalidDeliveryNoteReceivedOnError(this.identity.number, receivedOn);
    }
    const preparedAt = this.progress.preparedAt ?? at;
    this.progress = {
      ...this.progress,
      status: "handed_over",
      preparedAt,
      handedOverAt: at,
      receivedOn,
    };
  }

  /**
   * Annule un BL **non remis** — sa commande est annulée. Il reste en base,
   * garde son instant de préparation s'il en a un, et son numéro n'est jamais
   * réemployé.
   *
   * @throws {DeliveryNoteTransitionRefusedError} le BL est déjà remis ou annulé.
   */
  void(at: Date): void {
    this.ensureIn(["planned", "prepared"], "annulé");
    this.progress = { ...this.progress, status: "voided", voidedAt: at };
  }

  toState(): DeliveryNoteState {
    return {
      ...this.identity,
      ...this.progress,
      lines: this.currentLines.map((line) => line.state),
    };
  }

  private ensureIn(allowed: readonly DeliveryNoteStatus[], gesture: string): void {
    if (!allowed.includes(this.progress.status)) {
      throw new DeliveryNoteTransitionRefusedError(
        this.identity.number,
        this.progress.status,
        gesture,
      );
    }
  }
}

function linesOf(source: DeliveryNoteSource): readonly DeliveryNoteLine[] {
  if (source.lines.length === 0) {
    throw new DeliveryNoteWithoutLinesError(source.orderNumber);
  }
  return source.lines.map((line) => DeliveryNoteLine.of(line));
}
