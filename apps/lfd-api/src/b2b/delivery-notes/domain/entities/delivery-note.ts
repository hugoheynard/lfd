import {
  DeliveryNoteNotPlannedError,
  DeliveryNoteTermsAlreadySetError,
  DeliveryNoteTransitionRefusedError,
  DeliveryNoteWithoutLinesError,
  InvalidDeliveryNoteReceivedOnError,
} from "../errors/delivery-note-errors.js";
import {
  DeliveryNoteLine,
  type DeliveryNoteLineState,
  type DeliveryNoteSourceLine,
} from "../value-objects/delivery-note-line.js";
import {
  copyOfTerms,
  termsDifferences,
  type DeliveryNoteTerms,
} from "../value-objects/delivery-note-terms.js";
import { DeliveryNoteNumber } from "../value-objects/delivery-note-number.js";
import { RemainderSchedule } from "../value-objects/remainder-schedule.js";

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

/** Ce que la prévision lit d'une commande : son identité, ses lignes figées, ses totaux. */
export interface DeliveryNoteSource {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly lines: readonly DeliveryNoteSourceLine[];
  readonly terms: DeliveryNoteTerms;
  /**
   * Le départ de la commande est décidé (E6b) : lignes et en-tête sont ceux
   * de ce qui part. Absent = non.
   */
  readonly departureDecided?: boolean;
}

/** La source d'un reliquat : la commande, et son jour demandé `AAAA-MM-JJ` (D1). */
export interface DeliveryNoteRemainderSource extends DeliveryNoteSource {
  readonly orderDay: string;
}

/** L'état complet d'un BL, tel que l'adaptateur l'écrit et le relit. */
export interface DeliveryNoteState {
  readonly id: string;
  readonly orderId: string;
  readonly rank: number;
  readonly number: string;
  /**
   * Jour de service `AAAA-MM-JJ` d'un reliquat (rang > 1) ; `null` au rang 1,
   * dont le jour est celui de la commande (plan E7, choix 2).
   */
  readonly serviceDay: string | null;
  readonly status: DeliveryNoteStatus;
  readonly plannedAt: Date;
  readonly voidedAt: Date | null;
  readonly preparedAt: Date | null;
  readonly handedOverAt: Date | null;
  /** Jour de réception `AAAA-MM-JJ` (Europe/Paris), celui de la commande. */
  readonly receivedOn: string | null;
  readonly lines: readonly DeliveryNoteLineState[];
  /** L'en-tête recopié de la commande (plan E4a) ; `null` sur un BL d'avant E4a. */
  readonly terms: DeliveryNoteTerms | null;
  /** La version du contenu (plan E6, § 14). Absent = 1. */
  readonly contentVersion?: number;
  /** La dernière impression. Absent = jamais imprimé. */
  readonly printed?: DeliveryNotePrint | null;
}

/** Une impression : la version imprimée, l'instant, la fiche staff. */
export interface DeliveryNotePrint {
  readonly version: number;
  readonly at: Date;
  readonly by: string;
}

/** Ce qui bouge dans un BL ; le reste est son identité. */
type Progress = Pick<
  DeliveryNoteState,
  "status" | "voidedAt" | "preparedAt" | "handedOverAt" | "receivedOn"
>;
type Identity = Omit<
  DeliveryNoteState,
  keyof Progress | "lines" | "terms" | "contentVersion" | "printed"
>;

/** Ce qui suit le papier : la version du contenu, la dernière impression. */
interface Paper {
  readonly contentVersion: number;
  readonly printed: DeliveryNotePrint | null;
}

const FIRST_PAPER: Paper = { contentVersion: 1, printed: null };

const PLANNED: Progress = {
  status: "planned",
  voidedAt: null,
  preparedAt: null,
  handedOverAt: null,
  receivedOn: null,
};

/**
 * **Le bon de livraison** — plans E1 et E2, retirés
 * (`documentation/commandes/bon-de-livraison.md`).
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
    private currentTerms: DeliveryNoteTerms | null,
    private paper: Paper,
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
      serviceDay: null,
      plannedAt,
    };
    const note = new DeliveryNote(identity, PLANNED, linesOf(source), null, FIRST_PAPER);
    note.copyTermsFrom(source);
    return note;
  }

  /**
   * **Un reliquat** (plan E7, lot L1) : un BL de rang > 1, né d'une décision,
   * prévu pour SON jour de service, ses lignes celles du reste à relivrer. Les
   * lots suivants s'en servent aussi pour leurs données de test.
   *
   * @throws {InvalidDeliveryNoteRemainderError} rang 1, jour absent ou mal
   *   formé, jour antérieur à celui de la commande.
   * @throws {DeliveryNoteWithoutLinesError} le reste n'a aucune ligne.
   */
  static planRemainder(
    id: string,
    source: DeliveryNoteRemainderSource,
    rank: number,
    serviceDay: string,
    plannedAt: Date,
  ): DeliveryNote {
    const schedule = RemainderSchedule.of(source.orderNumber, rank, serviceDay, source.orderDay);
    const number = DeliveryNoteNumber.of(source.orderNumber, schedule.rank);
    const identity = {
      id,
      orderId: source.orderId,
      rank: schedule.rank,
      number: number.value,
      serviceDay: schedule.serviceDay,
      plannedAt,
    };
    const note = new DeliveryNote(identity, PLANNED, linesOf(source), null, FIRST_PAPER);
    note.copyTermsFrom(source);
    return note;
  }

  /** Recharge un BL écrit ; ses lignes revalident. */
  static rehydrate(state: DeliveryNoteState): DeliveryNote {
    const { status, voidedAt, preparedAt, handedOverAt, receivedOn, lines, terms } = state;
    const { id, orderId, rank, number, serviceDay, plannedAt, contentVersion, printed } = state;
    const head = { id, orderId, rank, number, serviceDay, plannedAt };
    return new DeliveryNote(
      head,
      { status, voidedAt, preparedAt, handedOverAt, receivedOn },
      lines.map((l) => DeliveryNoteLine.of(l)),
      terms,
      { contentVersion: contentVersion ?? 1, printed: printed ?? null },
    );
  }

  get orderId(): string {
    return this.identity.orderId;
  }

  get number(): string {
    return this.identity.number;
  }

  get rank(): number {
    return this.identity.rank;
  }

  get status(): DeliveryNoteStatus {
    return this.progress.status;
  }

  /**
   * Vivant = pas annulé. Une commande vivante en a exactement un PAR RANG
   * (plan E7, choix 3) : un BL-1 remis reste vivant à côté d'un reliquat.
   */
  get isLive(): boolean {
    return this.progress.status !== "voided";
  }

  /**
   * Le BL de rang 1, le seul qui suit sa commande (plan E7, choix 3) : un
   * reliquat a son propre état, que seuls les gestes de son envoi font avancer.
   */
  get followsItsOrder(): boolean {
    return this.identity.rank === FIRST_DELIVERY_NOTE_RANK;
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
    const changed = !this.matches(source);
    this.currentLines = linesOf(source);
    this.copyTermsFrom(source);
    if (changed) {
      // Le contenu a changé : un papier déjà imprimé ment désormais (§ 14).
      this.paper = { ...this.paper, contentVersion: this.paper.contentVersion + 1 };
    }
  }

  /**
   * **Une impression** du BL (PDF de transport ou chiffré équipe, plan E6
   * § 14) : la version courante du contenu est celle du papier. La dernière
   * suffit.
   */
  recordPrint(at: Date, by: string): void {
    this.paper = { ...this.paper, printed: { version: this.paper.contentVersion, at, by } };
  }

  /** Imprimé, puis changé : le papier ne dit plus le contenu. Jamais imprimé : non. */
  get reprintNeeded(): boolean {
    return reprintNeededOf(this.paper);
  }

  /**
   * Ses lignes et son en-tête sont-ils ceux de la source — même SKU, même
   * quantité, même total par ligne, même en-tête ?
   */
  matches(source: DeliveryNoteSource): boolean {
    const terms = this.currentTerms;
    const sameLines =
      this.currentLines.length === source.lines.length &&
      this.currentLines.every((line, index) => {
        const other = source.lines[index];
        return (
          other !== undefined &&
          other.sku === line.state.sku &&
          other.quantity === line.state.quantity &&
          other.lineTotalCents === line.state.lineTotalCents
        );
      });
    return sameLines && terms !== null && termsDifferences(terms, source.terms).length === 0;
  }

  /** L'en-tête est posé — faux pour un BL écrit avant E4a. */
  get hasTerms(): boolean {
    return this.currentTerms !== null;
  }

  /**
   * **Complète** l'en-tête VIDE d'un BL non annulé, à partir des totaux
   * actuels de sa commande, quel que soit son statut — remis compris. C'est
   * l'exception écrite à « remis, il ne change plus » (plan E4a, § 4,
   * bloquant 3) : elle remplit un champ vide, elle ne change aucune valeur
   * posée. Une commande remise ne change plus de totaux : aucun écrivain des
   * totaux d'`orders` n'agit après `placed` (vérifié le 2026-10-24 : la
   * passation, la révision `status: placed`, l'annulation `status: placed`
   * sans toucher aux totaux, le remboursement qui n'écrit que le règlement).
   *
   * L'éligibilité des lignes se remplit là où elle manque, sur une ligne qui
   * est la même — rang, SKU, quantité, total — que celle de la commande ;
   * ailleurs elle reste `null`, et le contrôle la compte.
   *
   * @throws {DeliveryNoteTermsAlreadySetError} l'en-tête est déjà posé, ou le BL est annulé.
   */
  completeTermsFrom(source: DeliveryNoteSource): void {
    if (this.currentTerms !== null || this.progress.status === "voided") {
      throw new DeliveryNoteTermsAlreadySetError(this.identity.number, this.progress.status);
    }
    this.currentTerms = copyOfTerms(source.orderNumber, source.terms);
    this.currentLines = this.currentLines.map((line, index) =>
      line.withEligibilityFrom(source.lines[index]),
    );
  }

  /** La recopie, une seule : appelée par {@link planFromOrder} et {@link replanFrom}. */
  private copyTermsFrom(source: DeliveryNoteSource): void {
    this.currentTerms = copyOfTerms(source.orderNumber, source.terms);
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
      terms: this.currentTerms,
      contentVersion: this.paper.contentVersion,
      printed: this.paper.printed,
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

/**
 * Imprimé, puis changé : le papier ne dit plus le contenu (plan E6, § 14).
 * Une seule définition, lue par l'agrégat et par la vue de l'équipe.
 */
export function reprintNeededOf(
  paper: Pick<DeliveryNoteState, "contentVersion" | "printed">,
): boolean {
  const printed = paper.printed ?? null;
  return printed !== null && printed.version !== (paper.contentVersion ?? 1);
}

function linesOf(source: DeliveryNoteSource): readonly DeliveryNoteLine[] {
  // Les lignes d'abord : une commande sans ligne est refusée avant ses totaux.
  if (source.lines.length === 0) {
    throw new DeliveryNoteWithoutLinesError(source.orderNumber);
  }
  return source.lines.map((line) => DeliveryNoteLine.of(line));
}
