import {
  EmptyInHouseRecapError,
  InHouseRecapAlreadyReplacedError,
  InHouseRecapDocumentAlreadyKeptError,
  RecapNoteDuplicatedError,
  RecapNoteOutsideMonthError,
} from "../errors/in-house-recap-errors.js";
import {
  aggregateRecapLines,
  type RecapLine,
  type RecapSourceNote,
} from "../services/recap-aggregation.js";
import { RecapMonth } from "../value-objects/recap-month.js";

/** Un BL couvert, sa version de contenu figée à l'émission. */
export interface CoveredNote {
  readonly deliveryNoteId: string;
  readonly number: string;
  readonly handedOverAt: Date;
  readonly contentVersion: number;
}

/** L'état complet d'un récapitulatif, tel que l'adaptateur le relit et l'écrit. */
export interface InHouseRecapState {
  readonly id: string;
  readonly payerId: string;
  readonly month: RecapMonth;
  readonly number: string;
  readonly issuedAt: Date;
  readonly storageKey: string | null;
  readonly replacedById: string | null;
  /** L'instant du remplacement, ou `null` tant qu'il ne l'est pas. */
  readonly replacedAt: Date | null;
  readonly lines: readonly RecapLine[];
  readonly notes: readonly CoveredNote[];
}

/** Ce qu'il faut pour émettre. */
export interface RecapIssuance {
  readonly id: string;
  readonly payerId: string;
  readonly month: RecapMonth;
  readonly number: string;
  readonly issuedAt: Date;
  readonly notes: readonly RecapSourceNote[];
}

/** Une version courante de BL, pour juger d'une révision (D8). */
export interface CurrentNoteVersion {
  readonly deliveryNoteId: string;
  readonly contentVersion: number;
}

/**
 * **Le récapitulatif des BL d'un restaurant maison** — un document figé, sans
 * montant (`plan-restaurants-maison.md`, D7, D8). Il porte trois invariants :
 * chaque BL couvert a été remis dans SON mois, n'y figure qu'une fois, et un
 * récapitulatif n'est remplacé qu'une fois — par un rectificatif du même
 * payeur et du même mois. Un mois sans BL n'a pas de récapitulatif : c'est
 * une issue vide du passage, pas un document.
 */
export class InHouseRecap {
  private constructor(private state: InHouseRecapState) {}

  /**
   * Émet le récapitulatif d'un mois : agrège les lignes, fige les versions.
   *
   * @throws {EmptyInHouseRecapError} aucun BL, ou aucune quantité.
   * @throws {RecapNoteOutsideMonthError} un BL remis hors du mois.
   * @throws {RecapNoteDuplicatedError} un même BL deux fois.
   */
  static issue(issuance: RecapIssuance): InHouseRecap {
    guardNotes(issuance.month, issuance.notes);
    const lines = aggregateRecapLines(issuance.notes);
    if (lines.length === 0) {
      throw new EmptyInHouseRecapError(issuance.payerId, issuance.month.key);
    }
    return new InHouseRecap({
      id: issuance.id,
      payerId: issuance.payerId,
      month: issuance.month,
      number: issuance.number,
      issuedAt: issuance.issuedAt,
      storageKey: null,
      replacedById: null,
      replacedAt: null,
      lines,
      notes: issuance.notes.map(({ deliveryNoteId, number, handedOverAt, contentVersion }) => ({
        deliveryNoteId,
        number,
        handedOverAt,
        contentVersion,
      })),
    });
  }

  /** Relit un récapitulatif rangé, sans rejuger : il a été émis par {@link issue}. */
  static rehydrate(state: InHouseRecapState): InHouseRecap {
    return new InHouseRecap(state);
  }

  /**
   * Le rectificatif (D8) : un récapitulatif neuf du même payeur et du même
   * mois, sur les BL d'aujourd'hui ; celui-ci est marqué remplacé et libère
   * ses BL. Pas d'avoir : il n'y a pas d'argent.
   *
   * @throws {InHouseRecapAlreadyReplacedError} déjà remplacé.
   */
  reissue(issuance: Omit<RecapIssuance, "payerId" | "month">): InHouseRecap {
    if (this.state.replacedById !== null) {
      throw new InHouseRecapAlreadyReplacedError(this.state.id);
    }
    const rectified = InHouseRecap.issue({
      ...issuance,
      payerId: this.state.payerId,
      month: this.state.month,
    });
    this.state = { ...this.state, replacedById: rectified.id, replacedAt: issuance.issuedAt };
    return rectified;
  }

  /**
   * Range le PDF du récapitulatif (D10) : un document figé n'a qu'un
   * exemplaire. La même clé une seconde fois ne change rien ; une autre clé
   * est refusée — le PDF parti est celui qui est gardé.
   *
   * @returns `true` si la clé vient d'être posée, `false` si elle l'était déjà.
   * @throws {InHouseRecapDocumentAlreadyKeptError} une autre clé est déjà rangée.
   */
  recordDocument(storageKey: string): boolean {
    if (this.state.storageKey === storageKey) {
      return false;
    }
    if (this.state.storageKey !== null) {
      throw new InHouseRecapDocumentAlreadyKeptError(this.state.number);
    }
    this.state = { ...this.state, storageKey };
    return true;
  }

  /** Les BL révisés depuis l'émission : leur version courante dépasse la figée (D8). */
  revisedNotes(current: readonly CurrentNoteVersion[]): readonly CoveredNote[] {
    const versions = new Map(current.map((one) => [one.deliveryNoteId, one.contentVersion]));
    return this.state.notes.filter(
      (note) => (versions.get(note.deliveryNoteId) ?? note.contentVersion) > note.contentVersion,
    );
  }

  get id(): string {
    return this.state.id;
  }

  get payerId(): string {
    return this.state.payerId;
  }

  get month(): RecapMonth {
    return this.state.month;
  }

  get number(): string {
    return this.state.number;
  }

  get storageKey(): string | null {
    return this.state.storageKey;
  }

  get isReplaced(): boolean {
    return this.state.replacedById !== null;
  }

  /** L'état à écrire : l'adaptateur le lit, il ne le reconstruit pas. */
  toState(): InHouseRecapState {
    return this.state;
  }
}

function guardNotes(month: RecapMonth, notes: readonly RecapSourceNote[]): void {
  const seen = new Set<string>();
  for (const note of notes) {
    if (!month.contains(note.handedOverAt)) {
      throw new RecapNoteOutsideMonthError(note.number, month.key);
    }
    if (seen.has(note.deliveryNoteId)) {
      throw new RecapNoteDuplicatedError(note.number);
    }
    seen.add(note.deliveryNoteId);
  }
}
