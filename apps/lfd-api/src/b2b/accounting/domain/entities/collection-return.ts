import {
  CollectionReturnAlreadyResolvedError,
  InvalidCollectionReturnError,
  LineAlreadyReturnedError,
  RefundRequestOnB2bError,
  RepresentationRefusedError,
  ReturnAmountMismatchError,
  ReturnOnUndepositedBatchError,
  type RepresentationRefusal,
} from "../errors/collection-return-errors.js";
import type { SequenceType } from "../services/pain008-document.js";
import { BankReturnReason, type BankReturnKind } from "../value-objects/bank-return-reason.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";
import type { CollectionBatchStatus, StaffStamp } from "./collection-batch.js";

export type CollectionReturnSource = "manual" | "pain002" | "camt054";
export type CollectionReturnResolution =
  "pending" | "represented" | "settled_otherwise" | "written_off";

/**
 * Ce que la ligne encaissait : des factures émises (E4), un arrêté (F3), ou
 * rien de figé (lot d'avant F3). Seule la première se re-présente (§ 2 bis-2).
 */
export type ReturnableLineRegime = "invoices" | "statement" | "legacy";

/** La ligne de lot qu'un retour vise, telle que le lot l'a figée. Jamais d'IBAN. */
export interface ReturnableLine {
  readonly batchId: string;
  readonly rank: number;
  readonly endToEndId: string;
  readonly batchStatus: CollectionBatchStatus;
  readonly scheme: SepaScheme;
  /** La clôture du cycle du lot — ce qui le nomme (« Lot CORE 202609 »). */
  readonly cycleClosesAt: Date;
  readonly amountCents: number;
  readonly mandateId: string;
  readonly mandateReference: string;
  readonly sequence: SequenceType;
  readonly debtorCompanyId: string;
  readonly debtorName: string;
  readonly regime: ReturnableLineRegime;
  /** L'échéance figée du lot (`AAAA-MM-JJ`), `null` pour un lot d'avant PA1. */
  readonly requestedCollectionDay: string | null;
}

export interface CollectionReturnState {
  readonly id: string;
  readonly endToEndId: string;
  readonly kind: BankReturnKind;
  readonly reasonCode: string;
  readonly reasonLabel: string | null;
  /** `AAAA-MM-JJ` — la date que la banque donne. */
  readonly returnedOn: string;
  readonly amountCents: number;
  readonly feeCents: number | null;
  readonly source: CollectionReturnSource;
  readonly recorded: StaffStamp;
  readonly resolution: CollectionReturnResolution;
  readonly resolutionNote: string | null;
  readonly resolved: StaffStamp | null;
}

export interface RecordReturnInput {
  readonly id: string;
  readonly kind: BankReturnKind;
  readonly reasonCode: string;
  readonly reasonLabel: string | null;
  readonly returnedOn: string;
  /** Le montant que la banque dit ; il doit être celui de la ligne. */
  readonly amountCents: number;
  readonly feeCents: number | null;
  readonly source: CollectionReturnSource;
  readonly recorded: StaffStamp;
}

/** La note d'un règlement ou d'une perte : assez pour une référence de virement. */
export const RESOLUTION_NOTE_MAX = 500;

const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * **Le retour bancaire d'une ligne de lot** (plan `retours-bancaires.md`).
 *
 * Il garde ses règles, et rien d'autre ne les garde :
 *
 * - un retour porte sur **toute** la ligne : son montant EST celui de la
 *   ligne, les frais de la banque sont à part ;
 * - seule une ligne d'un lot **déposé** se retourne, et une seule fois ;
 * - pas de remboursement (`refund_request`) en interentreprises ;
 * - il se traite **une** fois : re-présenter, régler autrement, ou perdre ;
 * - re-présenter n'est permis que pour une ligne de factures émises, sous
 *   un mandat encore actif et récurrent (§ 2 bis-2, 5).
 */
export class CollectionReturn {
  private constructor(private state: CollectionReturnState) {}

  /**
   * @param alreadyReturned la ligne a-t-elle déjà un retour ? (l'index unique le tient aussi)
   * @throws {ReturnOnUndepositedBatchError} lot non déposé.
   * @throws {LineAlreadyReturnedError} un retour existe déjà.
   * @throws {RefundRequestOnB2bError} remboursement sur un lot B2B.
   * @throws {ReturnAmountMismatchError} montant ≠ ligne.
   * @throws {InvalidBankReturnReasonError} motif refusé.
   * @throws {InvalidCollectionReturnError} date ou frais mal formés.
   */
  static record(
    input: RecordReturnInput,
    line: ReturnableLine,
    alreadyReturned: boolean,
  ): CollectionReturn {
    if (line.batchStatus !== "deposited") {
      throw new ReturnOnUndepositedBatchError(line.endToEndId, line.batchStatus);
    }
    if (alreadyReturned) {
      throw new LineAlreadyReturnedError(line.endToEndId);
    }
    if (input.kind === "refund_request" && line.scheme === "B2B") {
      throw new RefundRequestOnB2bError(line.endToEndId);
    }
    if (input.amountCents !== line.amountCents) {
      throw new ReturnAmountMismatchError(line.endToEndId, line.amountCents, input.amountCents);
    }
    assertDay(input.returnedOn);
    assertFee(input.feeCents);
    const reason = BankReturnReason.of(input.kind, input.reasonCode, input.reasonLabel);
    return new CollectionReturn({
      id: input.id,
      endToEndId: line.endToEndId,
      kind: input.kind,
      reasonCode: reason.code,
      reasonLabel: reason.label,
      returnedOn: input.returnedOn,
      amountCents: line.amountCents,
      feeCents: input.feeCents,
      source: input.source,
      recorded: input.recorded,
      resolution: "pending",
      resolutionNote: null,
      resolved: null,
    });
  }

  static rehydrate(state: CollectionReturnState): CollectionReturn {
    return new CollectionReturn(state);
  }

  /**
   * Re-présenter au prochain lot : les commandes repassent `due`.
   *
   * @param mandateActive le mandat figé sur la ligne est-il encore `active` ?
   * @throws {RepresentationRefusedError} ligne d'arrêté ou d'avant, mandat inactif, ponctuel.
   * @throws {CollectionReturnAlreadyResolvedError}
   */
  represent(stamp: StaffStamp, line: ReturnableLine, mandateActive: boolean): void {
    this.assertPending();
    const refusal = representationRefusal(line, mandateActive);
    if (refusal !== null) {
      throw new RepresentationRefusedError(refusal);
    }
    this.resolve("represented", null, stamp);
  }

  /** Réglé par un autre chemin (lien de paiement, virement) : la note dit lequel. */
  settleOtherwise(note: string, stamp: StaffStamp): void {
    this.assertPending();
    this.resolve("settled_otherwise", requiredNote(note), stamp);
  }

  /** Passé en perte, avec un motif — aucune écriture comptable (§ 2 bis-9). */
  writeOff(note: string, stamp: StaffStamp): void {
    this.assertPending();
    this.resolve("written_off", requiredNote(note), stamp);
  }

  get id(): string {
    return this.state.id;
  }
  get endToEndId(): string {
    return this.state.endToEndId;
  }
  get resolution(): CollectionReturnResolution {
    return this.state.resolution;
  }
  get reason(): BankReturnReason {
    return BankReturnReason.rehydrate(this.state.reasonCode, this.state.reasonLabel);
  }

  toPersistence(): CollectionReturnState {
    return this.state;
  }

  private resolve(
    resolution: Exclude<CollectionReturnResolution, "pending">,
    note: string | null,
    stamp: StaffStamp,
  ): void {
    this.state = { ...this.state, resolution, resolutionNote: note, resolved: stamp };
  }

  private assertPending(): void {
    if (this.state.resolution !== "pending") {
      throw new CollectionReturnAlreadyResolvedError(this.state.id, this.state.resolution);
    }
  }
}

/**
 * Pourquoi une ligne ne se re-présente pas, `null` si elle le peut. Une
 * ligne `OOFF` a consommé son mandat ponctuel en partant.
 */
export function representationRefusal(
  line: ReturnableLine,
  mandateActive: boolean,
): RepresentationRefusal | null {
  if (line.regime === "statement") {
    return "statement_line";
  }
  if (line.regime === "legacy") {
    return "legacy_line";
  }
  if (line.sequence === "OOFF") {
    return "one_off_consumed";
  }
  return mandateActive ? null : "mandate_not_active";
}

function requiredNote(note: string): string {
  const trimmed = note.trim();
  if (trimmed === "") {
    throw new InvalidCollectionReturnError(
      "une note dit comment c'est réglé, ou pourquoi c'est perdu",
    );
  }
  return trimmed.slice(0, RESOLUTION_NOTE_MAX);
}

function assertDay(day: string): void {
  const parsed = new Date(`${day}T00:00:00.000Z`);
  if (
    !DAY_SHAPE.test(day) ||
    Number.isNaN(parsed.getTime()) ||
    !parsed.toISOString().startsWith(day)
  ) {
    throw new InvalidCollectionReturnError(
      `la date du retour « ${day} » n'est pas un jour (AAAA-MM-JJ)`,
    );
  }
}

function assertFee(fee: number | null): void {
  if (fee !== null && (!Number.isInteger(fee) || fee < 0)) {
    throw new InvalidCollectionReturnError(`des frais de ${fee} centimes`);
  }
}
