import type { CreditorSnapshot } from "../creditor-snapshot.js";
import {
  CollectionTestAlreadyRefundedError,
  CollectionTestAlreadyReturnedError,
  CollectionTestAmountOutOfRangeError,
  CollectionTestDayClosedError,
  CollectionTestDayTooEarlyError,
  CollectionTestFileIncoherentError,
  CollectionTestNothingToRefundError,
  CollectionTestRefundDayInvalidError,
  CollectionTestRemittanceEmptyError,
} from "../errors/collection-test-errors.js";
import { admittedSequence, type TestDebtorVerdict } from "../services/collection-test-debtor.js";
import {
  earliestTestCollectionDay,
  parisDayOf,
  renderTestFile,
  testRemittanceOf,
} from "../services/collection-test-file.js";
import { isAuditCoherent } from "../services/pain008-audit.js";
import type { TestSequence } from "../services/pain008-document.js";
import { isTarget2BusinessDay, onOrAfterBusinessDay } from "../services/target2-calendar.js";
import type { BankReturnKind } from "../value-objects/bank-return-reason.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";
import type { StaffStamp } from "./collection-batch.js";
import { collectionTestStatus, type CollectionTestStatus } from "./collection-test-status.js";

/** Le plafond d'un essai, en centimes — 1 € (Hugo, 2026-10-22, Q2 révisée). */
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
  readonly messageId: string;
  readonly endToEndId: string;
  readonly created: StaffStamp;
  /** Le fichier tel qu'il a été rendu — il porte l'IBAN du débiteur. */
  readonly xml: string;
  readonly fileSha256: string;
  readonly bankReturn: TestBankReturn | null;
  readonly refund: TestRefund | null;
}

export interface GenerateCollectionTestInput {
  readonly id: string;
  readonly created: StaffStamp;
  readonly creditor: CreditorSnapshot;
  readonly debtorCompanyId: string;
  readonly debtorName: string;
  readonly verdict: Extract<TestDebtorVerdict, { kind: "eligible" }>;
  readonly sequence: TestSequence;
  readonly amountCents: number;
  readonly requestedCollectionDay: string;
  readonly remittance: string | null;
}

/**
 * **Un prélèvement d'essai** (plan `plan-prelevement-d-essai.md`) — un fichier
 * `pain.008` d'UN débit sur un de nos établissements, gardé et tracé.
 *
 * 🔴 Ce n'est pas un lot : il ne touche ni facture, ni bon, ni lot, ni état
 * d'encaissement. Il se télécharge, il ne se dépose pas par l'outil. Si la
 * banque le prélève, l'argent arrive sans pièce : l'essai passe « à
 * rembourser » jusqu'au geste « Marqué remboursé » (Q4).
 */
export class CollectionTest {
  private constructor(private state: CollectionTestState) {}

  /**
   * Génère le fichier et l'essai qui le garde. Refuse avant de rendre quoi
   * que ce soit : montant, séquence, échéance, libellé ; puis relit le fichier
   * par le contrôle des lots avant de le garder.
   */
  static generate(input: GenerateCollectionTestInput): CollectionTest {
    const { verdict, creditor } = input;
    assertAmount(input.amountCents);
    const sequence = admittedSequence(verdict, input.sequence);
    assertCollectionDay(
      input.requestedCollectionDay,
      earliestTestCollectionDay(input.created.at, creditor),
    );
    const remittance = testRemittanceOf(input.remittance);
    if (remittance === "") {
      throw new CollectionTestRemittanceEmptyError();
    }
    const { mandate } = verdict;
    const file = renderTestFile({
      testId: input.id,
      creditor,
      scheme: mandate.scheme,
      sequence,
      createdAt: input.created.at,
      requestedCollectionDay: input.requestedCollectionDay,
      debtorName: input.debtorName,
      amountCents: input.amountCents,
      mandate,
      remittance,
    });
    if (!isAuditCoherent(file.xml)) {
      throw new CollectionTestFileIncoherentError();
    }
    return new CollectionTest({
      id: input.id,
      legalEntityId: mandate.creditorId,
      debtorCompanyId: input.debtorCompanyId,
      debtorName: input.debtorName,
      mandateId: mandate.mandateId,
      mandateReference: mandate.reference,
      scheme: mandate.scheme,
      sequence,
      amountCents: input.amountCents,
      requestedCollectionDay: input.requestedCollectionDay,
      remittance,
      messageId: file.messageId,
      endToEndId: file.endToEndId,
      created: input.created,
      xml: file.xml,
      fileSha256: file.sha256,
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

  get endToEndId(): string {
    return this.state.endToEndId;
  }

  get amountCents(): number {
    return this.state.amountCents;
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

function assertCollectionDay(day: string, earliest: string): void {
  if (!isTarget2BusinessDay(day)) {
    throw new CollectionTestDayClosedError(day, onOrAfterBusinessDay(day));
  }
  if (day < earliest) {
    throw new CollectionTestDayTooEarlyError(day, earliest);
  }
}
