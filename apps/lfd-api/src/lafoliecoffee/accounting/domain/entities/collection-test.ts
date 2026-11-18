import {
  CollectionTestAlreadyRefundedError,
  CollectionTestAlreadyReturnedError,
  CollectionTestAmountOutOfRangeError,
  CollectionTestNothingToRefundError,
  CollectionTestRefundDayInvalidError,
} from "../errors/collection-test-errors.js";
import { admittedSequence, type TestDebtorVerdict } from "../services/collection-test-debtor.js";
import { parisDayOf } from "../services/collection-test-file.js";
import { testEndToEndId } from "../services/collection-test-identifiers.js";
import {
  assertNoLookalike,
  type PriorCollectionTest,
} from "../services/collection-test-lookalike.js";
import type { TestSequence } from "../services/pain008-document.js";
import type { BankReturnKind } from "../value-objects/bank-return-reason.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";
import type { StaffStamp } from "./collection-batch.js";
import { collectionTestStatus, type CollectionTestStatus } from "./collection-test-status.js";

/** Le plafond d'un essai, en centimes, PAR LIGNE d'un envoi — 1 € (Hugo, 2026-10-22 et 2026-11-18). */
export const MAX_COLLECTION_TEST_CENTS = 100;

/** Le retour que la banque a fait d'un essai — sans IBAN. */
export interface TestBankReturn {
  readonly kind: BankReturnKind;
  readonly reasonCode: string;
  readonly reasonLabel: string | null;
  readonly returnedOn: string;
  readonly amountCents: number;
  readonly source: "manual" | "pain002" | "camt054";
  readonly recorded: StaffStamp;
}

/** « Marqué remboursé » : le jour du virement, et qui l'a dit quand (Q4). */
export interface TestRefund {
  readonly refundedOn: string;
  readonly recorded: StaffStamp;
}

export interface CollectionTestState {
  readonly id: string;
  /** L'envoi qui porte ce débit. */
  readonly fileId: string;
  readonly legalEntityId: string;
  readonly debtorCompanyId: string;
  readonly debtorName: string;
  readonly mandateId: string;
  readonly mandateReference: string;
  readonly scheme: SepaScheme;
  readonly sequence: TestSequence;
  readonly amountCents: number;
  readonly requestedCollectionDay: string;
  readonly remittance: string;
  /** Le `MsgId` de l'envoi — le fichier déposé, que la banque cite. */
  readonly messageId: string;
  /** `ESS-<ULID de l'essai>` — ce qui désigne CE débit dans le fichier. */
  readonly endToEndId: string;
  readonly created: StaffStamp;
  readonly bankReturn: TestBankReturn | null;
  readonly refund: TestRefund | null;
}

/** Une ligne de l'envoi, telle que l'envoi la fait naître. */
export interface GenerateCollectionTestInput {
  readonly id: string;
  readonly fileId: string;
  /** Le `MsgId` de l'envoi. */
  readonly messageId: string;
  readonly created: StaffStamp;
  readonly debtorCompanyId: string;
  readonly debtorName: string;
  readonly verdict: Extract<TestDebtorVerdict, { kind: "eligible" }>;
  readonly sequence: TestSequence;
  readonly amountCents: number;
  /** Commune à l'envoi, déjà admise par lui. */
  readonly requestedCollectionDay: string;
  /** Commun à l'envoi, déjà passé au jeu SEPA. */
  readonly remittance: string;
  /**
   * Les essais déjà générés sur le même mandat dans la fenêtre anti-doublon
   * (`lookalikeWindowStart`) — la ligne refuse d'en répéter le montant.
   */
  readonly recentOnMandate: readonly PriorCollectionTest[];
}

/**
 * **Un prélèvement d'essai** — UN débit sur un de nos établissements, l'une
 * des lignes d'un envoi (`CollectionTestFile`, qui porte le fichier).
 *
 * 🔴 Ce n'est pas un lot : il ne touche ni facture, ni bon, ni lot, ni état
 * d'encaissement. Si la banque le prélève, l'argent arrive sans pièce :
 * l'essai passe « à rembourser » jusqu'au geste « Marqué remboursé » (Q4).
 * Son retour, son remboursement et son statut sont les siens, jamais ceux de
 * l'envoi.
 */
export class CollectionTest {
  private constructor(private state: CollectionTestState) {}

  /**
   * Fait naître une ligne d'envoi. Refuse ce qui ne regarde qu'elle : montant
   * (et son doublon récent sur le mandat), séquence permise par le mandat.
   * Seul `CollectionTestFile.generate` l'appelle : une ligne n'existe pas
   * sans son fichier.
   */
  static generate(input: GenerateCollectionTestInput): CollectionTest {
    const { verdict } = input;
    assertAmount(input.amountCents);
    assertNoLookalike(input.recentOnMandate, input.amountCents, input.created.at);
    const sequence = admittedSequence(verdict, input.sequence);
    const { mandate } = verdict;
    return new CollectionTest({
      id: input.id,
      fileId: input.fileId,
      legalEntityId: mandate.creditorId,
      debtorCompanyId: input.debtorCompanyId,
      debtorName: input.debtorName,
      mandateId: mandate.mandateId,
      mandateReference: mandate.reference,
      scheme: mandate.scheme,
      sequence,
      amountCents: input.amountCents,
      requestedCollectionDay: input.requestedCollectionDay,
      remittance: input.remittance,
      messageId: input.messageId,
      endToEndId: testEndToEndId(input.id),
      created: input.created,
      bankReturn: null,
      refund: null,
    });
  }

  static rehydrate(state: CollectionTestState): CollectionTest {
    return new CollectionTest(state);
  }

  get id(): string {
    return this.state.id;
  }

  get fileId(): string {
    return this.state.fileId;
  }

  get endToEndId(): string {
    return this.state.endToEndId;
  }

  get amountCents(): number {
    return this.state.amountCents;
  }

  get debtorCompanyId(): string {
    return this.state.debtorCompanyId;
  }

  get sequence(): TestSequence {
    return this.state.sequence;
  }

  get debtorName(): string {
    return this.state.debtorName;
  }

  get hasBankReturn(): boolean {
    return this.state.bankReturn !== null;
  }

  statusOn(today: string): CollectionTestStatus {
    return collectionTestStatus(this.state, today);
  }

  /**
   * Rattache le retour de la banque. Accepté même après « Marqué remboursé » :
   * un retour est un fait, et le taire cacherait un double remboursement — le
   * statut le dit (`refunded_and_returned`).
   *
   * @throws {CollectionTestAlreadyReturnedError}
   */
  recordBankReturn(bankReturn: TestBankReturn): void {
    if (this.state.bankReturn !== null) {
      throw new CollectionTestAlreadyReturnedError(this.state.endToEndId);
    }
    this.state = { ...this.state, bankReturn };
  }

  /**
   * « Marqué remboursé » (Q4) — une fois, après l'échéance, sans retour de la
   * banque, à un jour qui n'est ni futur ni antérieur à l'échéance.
   */
  markRefunded(refundedOn: string, recorded: StaffStamp): void {
    const { refund, bankReturn, requestedCollectionDay } = this.state;
    if (refund !== null) {
      throw new CollectionTestAlreadyRefundedError(refund.refundedOn);
    }
    if (bankReturn !== null) {
      throw new CollectionTestNothingToRefundError(
        `la banque a déjà rejeté ou retourné ce débit (le ${bankReturn.returnedOn})`,
      );
    }
    const today = parisDayOf(recorded.at);
    if (today < requestedCollectionDay) {
      throw new CollectionTestNothingToRefundError(
        `son échéance (${requestedCollectionDay}) n'est pas encore passée`,
      );
    }
    if (refundedOn > today) {
      throw new CollectionTestRefundDayInvalidError(refundedOn, "elle est dans le futur");
    }
    if (refundedOn < requestedCollectionDay) {
      throw new CollectionTestRefundDayInvalidError(
        refundedOn,
        `elle précède l'échéance du prélèvement (${requestedCollectionDay})`,
      );
    }
    this.state = { ...this.state, refund: { refundedOn, recorded } };
  }

  toPersistence(): CollectionTestState {
    return this.state;
  }
}

function assertAmount(amountCents: number): void {
  if (
    !Number.isInteger(amountCents) ||
    amountCents <= 0 ||
    amountCents > MAX_COLLECTION_TEST_CENTS
  ) {
    throw new CollectionTestAmountOutOfRangeError(amountCents, MAX_COLLECTION_TEST_CENTS);
  }
}
