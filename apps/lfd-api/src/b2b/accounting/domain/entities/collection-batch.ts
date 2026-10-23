import {
  BatchHasUnmandatedCompaniesError,
  BatchNeverDownloadedError,
  BatchNotConstitutedError,
  DepositedBatchNotCancellableError,
  ClosureNotAfterPreviousError,
  CycleNotClosedError,
  DepositRecheckFailedError,
  FirstClosureOffRhythmError,
} from "../errors/collection-errors.js";
import {
  CollectionNoticesNotSentError,
  type UnsentNotice,
} from "../errors/collection-notice-errors.js";
import type { BillingCycle } from "../services/billing-cycle.js";
import type { ClosureSequence } from "../services/calendar-cycles.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";
import {
  BANK_REJECTION_REASON_MAX,
  BankRejectionAfterCollectionDayError,
  BatchNotDepositedError,
  InvalidBankRejectionReasonError,
  RejectedBatchHasReturnsError,
} from "../errors/batch-bank-rejection-errors.js";
import { isBatchDepositable } from "./collection-batch-depositability.js";
import type { CollectionBatchLine } from "./collection-batch-line.js";
import type {
  BankRejectionStamp,
  ConstitutionStamp,
  StaffStamp,
} from "./collection-batch-stamps.js";
import type { CollectionBatchStatus } from "./collection-batch-status.js";
import type { CollectionNoticeStatus } from "./collection-notice.js";

export type { CollectionBatchStatus } from "./collection-batch-status.js";
export type { BatchLineInvoice, CollectionBatchLine } from "./collection-batch-line.js";
export type {
  BankRejectionStamp,
  ConstitutionAuthor,
  ConstitutionStamp,
  StaffStamp,
} from "./collection-batch-stamps.js";

export interface CollectionBatchState {
  readonly id: string;
  readonly legalEntityId: string;
  readonly scheme: SepaScheme;
  readonly cycle: BillingCycle;
  readonly status: CollectionBatchStatus;
  readonly constituted: ConstitutionStamp;
  readonly deposited: StaffStamp | null;
  readonly cancelled: StaffStamp | null;
  /** Posé ssi `rejected_by_bank` ; la trace du dépôt reste. */
  readonly rejected: BankRejectionStamp | null;
  /** Q2 : une société nommée ici rend le lot indéposable. */
  readonly unmandatedCompanies: readonly string[];
  readonly lines: readonly CollectionBatchLine[];
  /** Le fichier, rendu UNE fois. */
  readonly xml: string;
  readonly fileSha256: string;
  /**
   * L'échéance (`AAAA-MM-JJ`) figée à la constitution — celle du XML.
   * `null` pour un lot d'avant le 2026-10-08 : son XML fait foi. Changer
   * l'échéance d'un lot = l'annuler et le reconstituer, jamais un report en
   * place (plan `prelevement-automatique.md`, PA1).
   */
  readonly requestedCollectionDay: string | null;
  /**
   * L'échéance du calendrier (clôture + N) quand une constitution tardive l'a
   * repoussée pour tenir le préavis (D4) ; `null` sinon, et avant PA2.
   */
  readonly postponedFromDay: string | null;
  /**
   * L'instant du dernier téléchargement du fichier ; `null` = jamais
   * téléchargé, et « J'ai déposé le fichier » est alors refusé (Hugo,
   * 2026-10-23 — même modèle que les exports des mandats).
   */
  readonly lastDownloadedAt: Date | null;
}

export interface ConstituteBatchInput {
  readonly id: string;
  readonly legalEntityId: string;
  readonly scheme: SepaScheme;
  readonly cycle: BillingCycle;
  /** La dernière clôture enregistrée avant celle-ci, `null` s'il n'y en a pas. */
  readonly previousClosure: Date | null;
  /**
   * Le calendrier de la facture de l'entité (M3, `InvoicingCalendar`) : la
   * première clôture d'un lot doit en être une — celle d'au moins un payeur —,
   * pour fermer à l'instant où une facture se clôt.
   */
  readonly calendar: Pick<ClosureSequence, "isClosure">;
  readonly constituted: ConstitutionStamp;
  readonly unmandatedCompanies: readonly string[];
  readonly lines: readonly CollectionBatchLine[];
  readonly xml: string;
  readonly fileSha256: string;
  /** L'échéance que le XML porte, sortie du même calendrier. */
  readonly requestedCollectionDay: string;
  readonly postponedFromDay: string | null;
}

/**
 * **Le lot de prélèvement** — un fichier `pain.008` figé, d'une entité, d'un
 * schéma, d'un cycle (plan `lot-de-prelevement-fige.md`).
 *
 * Il garde trois invariants, et rien d'autre ne les garde :
 *
 * - on ne constitue qu'un cycle **clos** (`closesAt ≤ constitutedAt`), et la
 *   **première** clôture enregistrée tombe un 1er du mois (§6 bis) ;
 * - seul un lot `constituted` s'annule ou se dépose — une pièce déposée ne
 *   redevient jamais modifiable ;
 * - un lot qui nomme une société sans mandat **ne se dépose pas** (Q2 :
 *   l'interdiction d'aujourd'hui est gardée, Hugo 2026-10-05).
 *
 * Ce que le dépôt vérifie en plus — mandats révoqués, IBAN changés, commandes
 * annulées — est une relecture du monde, faite par l'application ; l'agrégat
 * en reçoit le verdict.
 */
export class CollectionBatch {
  private constructor(private state: CollectionBatchState) {}

  /**
   * @throws {CycleNotClosedError} la clôture est dans le futur.
   * @throws {FirstClosureOffRhythmError} première clôture hors du calendrier de l'entité.
   * @throws {ClosureNotAfterPreviousError} la clôture ne suit pas la précédente.
   */
  static constitute(input: ConstituteBatchInput): CollectionBatch {
    const { cycle, previousClosure, constituted } = input;
    if (cycle.closesAt.getTime() > constituted.at.getTime()) {
      throw new CycleNotClosedError(cycle.closesAt);
    }
    if (previousClosure === null && !input.calendar.isClosure(cycle.closesAt)) {
      throw new FirstClosureOffRhythmError(cycle.closesAt);
    }
    if (previousClosure !== null && previousClosure.getTime() >= cycle.closesAt.getTime()) {
      throw new ClosureNotAfterPreviousError(cycle.closesAt, previousClosure);
    }
    return new CollectionBatch({
      id: input.id,
      legalEntityId: input.legalEntityId,
      scheme: input.scheme,
      cycle,
      status: "constituted",
      constituted,
      deposited: null,
      cancelled: null,
      rejected: null,
      unmandatedCompanies: [...input.unmandatedCompanies],
      lines: [...input.lines],
      xml: input.xml,
      fileSha256: input.fileSha256,
      requestedCollectionDay: input.requestedCollectionDay,
      postponedFromDay: input.postponedFromDay,
      lastDownloadedAt: null,
    });
  }

  /** Réhydrate depuis la persistance — aucune règle de constitution rejouée. */
  static rehydrate(state: CollectionBatchState): CollectionBatch {
    return new CollectionBatch(state);
  }

  /**
   * Avant dépôt seulement. Ses commandes repassent `due` (`OrderCollection.release`).
   * Un lot déposé ne s'annule pas : sa remise a pu être signée, et ses
   * commandes repassées à prélever partiraient une seconde fois (doc
   * `procedure-de-prelevement.md` § 7).
   *
   * @throws {DepositedBatchNotCancellableError} le lot est déposé.
   * @throws {BatchNotConstitutedError} le lot est déjà annulé.
   */
  cancel(stamp: StaffStamp): void {
    if (this.state.status === "deposited") {
      throw new DepositedBatchNotCancellableError(this.state.id);
    }
    this.assertConstituted();
    this.state = { ...this.state, status: "cancelled", cancelled: stamp };
  }

  /**
   * Marque le fichier déposé à la banque.
   *
   * @param problems ce que la relecture a trouvé (mandat révoqué, IBAN changé,
   *        commande annulée) — vide si le monde n'a pas bougé.
   * @param notices l'état de l'avis de chaque ligne, par rang (PA2) : toutes
   *        `sent`, sinon refus en nommant les payeurs. Une ligne sans avis
   *        (lot d'avant PA2) n'a pas été pré-notifiée : refus aussi.
   * @throws {BatchNeverDownloadedError} le fichier n'a jamais été téléchargé.
   */
  markDeposited(
    stamp: StaffStamp,
    problems: readonly string[],
    notices: ReadonlyMap<number, CollectionNoticeStatus>,
  ): void {
    this.assertConstituted();
    if (this.state.unmandatedCompanies.length > 0) {
      throw new BatchHasUnmandatedCompaniesError(this.state.unmandatedCompanies);
    }
    if (this.state.lastDownloadedAt === null) {
      throw new BatchNeverDownloadedError(this.state.id);
    }
    const unsent = this.state.lines.flatMap((line): UnsentNotice[] => {
      const status = notices.get(line.rank);
      if (status === "sent") {
        return [];
      }
      return [{ debtorName: line.debtorName, reason: status ?? "missing" }];
    });
    if (unsent.length > 0) {
      throw new CollectionNoticesNotSentError(unsent);
    }
    if (problems.length > 0) {
      throw new DepositRecheckFailedError(problems);
    }
    this.state = { ...this.state, status: "deposited", deposited: stamp };
  }

  /**
   * **La banque a rejeté le fichier entier** (accusé PSR1), après « Marquer
   * déposé » : `deposited → rejected_by_bank`, terminal. Ses commandes
   * redeviennent à prélever (`OrderCollection.releaseRejected`) ; ce n'est
   * pas une annulation, la trace du dépôt reste.
   *
   * @param today le jour de Paris — refusé à partir de l'échéance (Q3).
   * @param returnedDebtors les payeurs dont la ligne a un retour enregistré.
   * @throws {BatchNotDepositedError} le lot n'est pas déposé.
   * @throws {InvalidBankRejectionReasonError} motif vide ou trop long.
   * @throws {RejectedBatchHasReturnsError} une ligne est revenue : la remise est partie.
   * @throws {BankRejectionAfterCollectionDayError} l'échéance est atteinte.
   */
  rejectByBank(
    rejection: BankRejectionStamp,
    today: string,
    returnedDebtors: readonly string[],
  ): void {
    if (this.state.status !== "deposited") {
      throw new BatchNotDepositedError(this.state.id, this.state.status);
    }
    const reason = rejection.reason.trim();
    if (reason === "" || reason.length > BANK_REJECTION_REASON_MAX) {
      throw new InvalidBankRejectionReasonError(reason.length);
    }
    if (returnedDebtors.length > 0) {
      throw new RejectedBatchHasReturnsError(returnedDebtors);
    }
    const day = this.state.requestedCollectionDay;
    if (day === null || day <= today) {
      throw new BankRejectionAfterCollectionDayError(this.state.id, day);
    }
    this.state = {
      ...this.state,
      status: "rejected_by_bank",
      rejected: { ...rejection, reason },
    };
  }

  /**
   * Le fichier vient d'être servi. Tout état l'accepte : le fichier d'un lot
   * déposé, annulé ou rejeté se retélécharge (préfixe `ANNULE-` ou `REJETE-`), seul « déposé »
   * lit l'instant.
   */
  recordDownload(at: Date): void {
    this.state = { ...this.state, lastDownloadedAt: at };
  }

  /** Le lot partirait-il tel quel ? Une ligne au moins, aucune société sans mandat. */
  get depositable(): boolean {
    return isBatchDepositable(this.state.lines.length, this.state.unmandatedCompanies);
  }

  get id(): string {
    return this.state.id;
  }
  get status(): CollectionBatchStatus {
    return this.state.status;
  }
  get lines(): readonly CollectionBatchLine[] {
    return this.state.lines;
  }
  get totalCents(): number {
    return this.state.lines.reduce((sum, line) => sum + line.amountCents, 0);
  }

  toPersistence(): CollectionBatchState {
    return this.state;
  }

  private assertConstituted(): void {
    if (this.state.status !== "constituted") {
      throw new BatchNotConstitutedError(this.state.id, this.state.status);
    }
  }
}
