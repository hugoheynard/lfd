import {
  BatchHasUnmandatedCompaniesError,
  BatchNotConstitutedError,
  ClosureNotAfterPreviousError,
  CycleNotClosedError,
  DepositRecheckFailedError,
  FirstClosureNotOnFirstOfMonthError,
} from "../errors/collection-errors.js";
import {
  CollectionNoticesNotSentError,
  type UnsentNotice,
} from "../errors/collection-notice-errors.js";
import { isCalendarClosure, type BillingCycle } from "../services/billing-cycle.js";
import type { SequenceType } from "../services/pain008-document.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";
import type { CollectionNoticeStatus } from "./collection-notice.js";

export type CollectionBatchStatus = "constituted" | "deposited" | "cancelled";

/**
 * Une ligne du fichier : UN débiteur, le mandat **figé** — IBAN compris — et
 * les commandes qu'elle prélève. Un futur rejet bancaire sur son `endToEndId`
 * sait ainsi quelles commandes il touche (plan §1).
 */
export interface CollectionBatchLine {
  readonly rank: number;
  readonly endToEndId: string;
  readonly mandateId: string;
  readonly mandateReference: string;
  readonly mandateSignedAt: Date;
  /** Le payeur — la société débitée. */
  readonly debtorCompanyId: string;
  readonly debtorName: string;
  /** En clair EN MÉMOIRE seulement : l'adaptateur le scelle à l'écriture. */
  readonly debtorIban: string;
  readonly debtorBic: string | null;
  readonly sequence: SequenceType;
  /** Le total TTC de la facture de ses bons, calculée en une fois (F2). */
  readonly amountCents: number;
  /**
   * Σ des totaux de ses bons — l'écart `amountCents − ordersTotalCents` est
   * celui de la LIGNE, jamais d'un bon. `null` pour une ligne d'un lot
   * constitué avant F2 (2026-10-08) : la colonne n'existait pas, et on
   * n'invente pas sa valeur (plan `plan-le-prelevement-suit-la-facture.md`).
   */
  readonly ordersTotalCents: number | null;
  readonly orderIds: readonly string[];
  /** Dont commandes d'un cycle antérieur, reprises. */
  readonly priorOrderCount: number;
}

/** Un instant et la fiche staff (identifiant LOCAL, jamais un `sub`). */
export interface StaffStamp {
  readonly at: Date;
  readonly staffId: string;
}

/**
 * Qui a préparé le lot : une fiche staff, ou l'automatisme (plan
 * `plan-prelevement-automatique.md`, PA3). Deux formes, pas un identifiant
 * nullable : un lot `system` n'a pas de fiche à joindre à l'annuaire, et un
 * lot `staff` ne peut pas en manquer.
 */
export type ConstitutionAuthor =
  { readonly kind: "staff"; readonly staffId: string } | { readonly kind: "system" };

/** L'instant de la constitution et son auteur. */
export interface ConstitutionStamp {
  readonly at: Date;
  readonly by: ConstitutionAuthor;
}

export interface CollectionBatchState {
  readonly id: string;
  readonly legalEntityId: string;
  readonly scheme: SepaScheme;
  readonly cycle: BillingCycle;
  readonly status: CollectionBatchStatus;
  readonly constituted: ConstitutionStamp;
  readonly deposited: StaffStamp | null;
  readonly cancelled: StaffStamp | null;
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
   * place (plan `plan-prelevement-automatique.md`, PA1).
   */
  readonly requestedCollectionDay: string | null;
  /**
   * L'échéance du calendrier (clôture + N) quand une constitution tardive l'a
   * repoussée pour tenir le préavis (D4) ; `null` sinon, et avant PA2.
   */
  readonly postponedFromDay: string | null;
}

export interface ConstituteBatchInput {
  readonly id: string;
  readonly legalEntityId: string;
  readonly scheme: SepaScheme;
  readonly cycle: BillingCycle;
  /** La dernière clôture enregistrée avant celle-ci, `null` s'il n'y en a pas. */
  readonly previousClosure: Date | null;
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
 * schéma, d'un cycle (plan `plan-lot-de-prelevement-fige.md`, §2).
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
   * @throws {FirstClosureNotOnFirstOfMonthError} première clôture hors calendrier.
   * @throws {ClosureNotAfterPreviousError} la clôture ne suit pas la précédente.
   */
  static constitute(input: ConstituteBatchInput): CollectionBatch {
    const { cycle, previousClosure, constituted } = input;
    if (cycle.closesAt.getTime() > constituted.at.getTime()) {
      throw new CycleNotClosedError(cycle.closesAt);
    }
    if (previousClosure === null && !isCalendarClosure(cycle.closesAt)) {
      throw new FirstClosureNotOnFirstOfMonthError(cycle.closesAt);
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
      unmandatedCompanies: [...input.unmandatedCompanies],
      lines: [...input.lines],
      xml: input.xml,
      fileSha256: input.fileSha256,
      requestedCollectionDay: input.requestedCollectionDay,
      postponedFromDay: input.postponedFromDay,
    });
  }

  /** Réhydrate depuis la persistance — aucune règle de constitution rejouée. */
  static rehydrate(state: CollectionBatchState): CollectionBatch {
    return new CollectionBatch(state);
  }

  /** Avant dépôt seulement. Ses commandes repassent `due` (`OrderCollection.release`). */
  cancel(stamp: StaffStamp): void {
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

  /** Le lot partirait-il tel quel ? Une ligne au moins, aucune société sans mandat. */
  get depositable(): boolean {
    return this.state.lines.length > 0 && this.state.unmandatedCompanies.length === 0;
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
