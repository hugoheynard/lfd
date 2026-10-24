import {
  BatchAttestationAlreadyGivenError,
  BatchAttestationNotGivenError,
  BatchAttestationOutOfOrderError,
  InvalidBatchAttestationError,
} from "../errors/collection-batch-attestation-errors.js";
import {
  isBatchAttestationKind,
  standingAttestationOf,
  type BatchAttestationKind,
  type BatchAttestationLine,
} from "../services/collection-batch-attestations.js";
import type { CollectionBatchStatus } from "./collection-batch-status.js";
import type { StaffStamp } from "./collection-batch.js";

/** La note d'un retrait : dire pourquoi, en une phrase. */
export const BATCH_ATTESTATION_NOTE_MAX = 500;

/** Une ligne du registre : une attestation, ou son retrait (avec sa note). */
export interface BatchAttestationEntry extends BatchAttestationLine {
  readonly note: string | null;
}

/** Ce que les attestations savent du lot — de quoi tenir l'ordre et nommer le lot. */
export interface AttestedBatch {
  readonly id: string;
  readonly legalEntityId: string;
  readonly scheme: "CORE" | "B2B";
  readonly status: CollectionBatchStatus;
  readonly cycleClosesAt: Date;
}

export interface BatchAttestationsState {
  readonly batch: AttestedBatch;
  readonly entries: readonly BatchAttestationEntry[];
}

/**
 * La sorte lue en base ou reçue, revalidée.
 *
 * @throws {InvalidBatchAttestationError} une sorte inconnue.
 */
export function batchAttestationKindOf(value: string): BatchAttestationKind {
  if (!isBatchAttestationKind(value)) {
    throw new InvalidBatchAttestationError(`sorte « ${value} » inconnue`);
  }
  return value;
}

/** Ce qu'il faut dire quand le lot n'en est pas là pour une sorte ; `null` : il y est. */
function outOfOrderExit(kind: BatchAttestationKind, status: CollectionBatchStatus): string | null {
  if (status === "cancelled") {
    return "il a été annulé. Attestez sur le lot préparé de nouveau.";
  }
  if (kind === "audit_reviewed") {
    return status === "rejected_by_bank"
      ? "la banque a rejeté son fichier. Attestez sur le lot préparé de nouveau."
      : null;
  }
  if (status === "constituted") {
    return "il n'est pas encore déposé. Dites d'abord « J'ai déposé le fichier dans CENET », puis signez la remise sur CENET.";
  }
  if (kind === "remittance_signed" && status === "rejected_by_bank") {
    return "la banque a rejeté son fichier : il n'y a plus de remise à signer.";
  }
  return null;
}

/**
 * **Les attestations d'un lot de prélèvement** (plan
 * `plan-page-procedure-de-prelevement.md` § 1.2, § 3.3, P3) — trois gestes
 * faits hors de l'outil que rien ne peut constater : le contrôle CSV relu,
 * la remise signée sur CENET, les accusés PSR lus.
 *
 * Les invariants :
 *
 * - **aucune ligne ne s'efface** : l'agrégat n'ajoute que des lignes, et la
 *   dernière d'une sorte fait foi (`standingAttestationOf`) ;
 * - on n'atteste pas ce qui l'est déjà, on ne retire que ce qui l'est ;
 * - un retrait dit pourquoi (note obligatoire) ;
 * - l'ordre de la procédure (§ 3.3) : la remise ne se signe qu'un lot déposé,
 *   les accusés PSR ne se lisent qu'après un dépôt, un lot annulé n'atteste
 *   plus rien.
 *
 * ⚠️ L'inverse n'existe pas : une attestation ne conditionne **aucun** geste
 * du domaine — « Marquer déposé » reste gardé par sa relecture, jamais par
 * « Contrôle CSV relu » (§ « Règles des attestations »).
 */
export class CollectionBatchAttestations {
  private readonly added: BatchAttestationEntry[] = [];

  private constructor(private readonly state: BatchAttestationsState) {}

  /** @throws {InvalidBatchAttestationError} une ligne d'un autre lot. */
  static rehydrate(state: BatchAttestationsState): CollectionBatchAttestations {
    const stray = state.entries.find((entry) => entry.batchId !== state.batch.id);
    if (stray !== undefined) {
      throw new InvalidBatchAttestationError(
        `la ligne ${stray.id} n'est pas du lot ${state.batch.id}`,
      );
    }
    return new CollectionBatchAttestations(state);
  }

  get batch(): AttestedBatch {
    return this.state.batch;
  }

  /** L'attestation qui fait foi pour une sorte, ou `null`. */
  standing(kind: BatchAttestationKind): BatchAttestationEntry | null {
    return standingAttestationOf([...this.state.entries, ...this.added], kind);
  }

  /**
   * @throws {BatchAttestationOutOfOrderError} le lot n'en est pas là.
   * @throws {BatchAttestationAlreadyGivenError} la sorte l'est déjà.
   */
  attest(kind: BatchAttestationKind, id: string, stamp: StaffStamp): BatchAttestationEntry {
    const exit = outOfOrderExit(kind, this.state.batch.status);
    if (exit !== null) {
      throw new BatchAttestationOutOfOrderError(kind, exit);
    }
    if (this.standing(kind) !== null) {
      throw new BatchAttestationAlreadyGivenError(kind);
    }
    return this.append({ id, kind, ...stamp, withdrawn: false, note: null });
  }

  /**
   * Un retrait reste possible quel que soit l'état du lot : une attestation
   * fausse se corrige toujours.
   *
   * @throws {InvalidBatchAttestationError} note vide ou trop longue.
   * @throws {BatchAttestationNotGivenError} rien à retirer.
   */
  withdraw(
    kind: BatchAttestationKind,
    id: string,
    stamp: StaffStamp,
    note: string,
  ): BatchAttestationEntry {
    const said = note.trim();
    if (said === "" || said.length > BATCH_ATTESTATION_NOTE_MAX) {
      throw new InvalidBatchAttestationError(
        `un retrait dit pourquoi, en ${String(BATCH_ATTESTATION_NOTE_MAX)} caractères au plus`,
      );
    }
    if (this.standing(kind) === null) {
      throw new BatchAttestationNotGivenError(kind);
    }
    return this.append({ id, kind, ...stamp, withdrawn: true, note: said });
  }

  /** Les lignes ajoutées depuis le chargement — les seules que `save` écrit. */
  newEntries(): readonly BatchAttestationEntry[] {
    return [...this.added];
  }

  private append(entry: Omit<BatchAttestationEntry, "batchId">): BatchAttestationEntry {
    const line = { ...entry, batchId: this.state.batch.id };
    this.added.push(line);
    return line;
  }
}
