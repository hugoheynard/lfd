import type { CreditorSnapshot } from "../creditor-snapshot.js";
import {
  CollectionTestFileDuplicateDebtorError,
  CollectionTestFileEmptyError,
  CollectionTestFileMixedCreditorsError,
  CollectionTestFileMixedSchemesError,
  CollectionTestFileTooManyDebtorsError,
} from "../errors/collection-test-file-errors.js";
import {
  CollectionTestDayClosedError,
  CollectionTestDayTooEarlyError,
  CollectionTestFileIncoherentError,
  CollectionTestRemittanceEmptyError,
} from "../errors/collection-test-errors.js";
import type { TestDebtorVerdict } from "../services/collection-test-debtor.js";
import {
  earliestTestCollectionDay,
  renderTestFile,
  testRemittanceOf,
  type TestFileDebit,
} from "../services/collection-test-file.js";
import { testFileSepaIdentifiers } from "../services/collection-test-identifiers.js";
import type { PriorCollectionTest } from "../services/collection-test-lookalike.js";
import { isAuditCoherent } from "../services/pain008-audit.js";
import type { TestSequence } from "../services/pain008-document.js";
import { isTarget2BusinessDay, onOrAfterBusinessDay } from "../services/target2-calendar.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";
import type { StaffStamp } from "./collection-batch.js";
import { CollectionTest } from "./collection-test.js";

/** Le nombre de lignes d'un envoi d'essai, au plus (Hugo, 2026-11-18). */
export const MAX_DEBTORS_PER_TEST_FILE = 10;

/** Un débiteur de l'envoi, déjà jugé : montant et séquence sont PAR LIGNE. */
export interface TestFileLineInput {
  /** L'id de l'essai — il entre dans l'`EndToEndId`. */
  readonly testId: string;
  readonly debtorCompanyId: string;
  readonly debtorName: string;
  readonly verdict: Extract<TestDebtorVerdict, { kind: "eligible" }>;
  readonly sequence: TestSequence;
  readonly amountCents: number;
  /** Les essais récents sur son mandat (`lookalikeWindowStart`). */
  readonly recentOnMandate: readonly PriorCollectionTest[];
}

export interface GenerateCollectionTestFileInput {
  /** L'id de l'envoi, toujours distinct de celui de ses lignes. */
  readonly id: string;
  readonly created: StaffStamp;
  /** L'entité émettrice — celle du mandat de CHAQUE ligne. */
  readonly creditor: CreditorSnapshot;
  /** Échéance et libellé sont communs à l'envoi. */
  readonly requestedCollectionDay: string;
  readonly remittance: string | null;
  readonly lines: readonly TestFileLineInput[];
}

export interface CollectionTestFileState {
  readonly id: string;
  readonly legalEntityId: string;
  readonly scheme: SepaScheme;
  readonly requestedCollectionDay: string;
  readonly messageId: string;
  readonly created: StaffStamp;
  /** Le fichier tel qu'il a été rendu — il porte l'IBAN des débiteurs. */
  readonly xml: string;
  readonly fileSha256: string;
}

/**
 * **Un envoi d'essai** (plan `plan-essai-a-plusieurs-debiteurs.md`) — UN
 * fichier `pain.008` déposable, un `MsgId`, une empreinte, et de un à
 * `MAX_DEBTORS_PER_TEST_FILE` débits sur nos établissements, chacun gardé en
 * `CollectionTest` avec son propre suivi.
 *
 * Un envoi est figé : il naît avec ses lignes, et rien ne s'y ajoute ensuite.
 */
export class CollectionTestFile {
  private constructor(
    private readonly state: CollectionTestFileState,
    private readonly lines: readonly CollectionTest[],
  ) {}

  /**
   * Génère le fichier et les essais qu'il porte. Refuse avant de rendre quoi
   * que ce soit : nombre de lignes, établissement en double, créancier ou
   * schéma mélangés, puis chaque ligne (montant, doublon, séquence), puis
   * l'échéance et le libellé communs ; relit enfin le fichier par le contrôle
   * des lots avant de le garder.
   */
  static generate(input: GenerateCollectionTestFileInput): CollectionTestFile {
    const [head, ...rest] = assertLines(input.lines);
    const scheme = assertSingleCreditorAndScheme(input.creditor, [head, ...rest]);
    assertCollectionDay(input.requestedCollectionDay, earliestTestCollectionDay(input.created.at));
    const remittance = testRemittanceOf(input.remittance);
    if (remittance === "") {
      throw new CollectionTestRemittanceEmptyError();
    }
    const { messageId } = testFileSepaIdentifiers(input.id);
    const draft = (line: TestFileLineInput): DraftedLine => ({
      line,
      test: CollectionTest.generate({
        ...line,
        id: line.testId,
        fileId: input.id,
        messageId,
        created: input.created,
        requestedCollectionDay: input.requestedCollectionDay,
        remittance,
      }),
    });
    const first = draft(head);
    const others = rest.map(draft);
    const file = renderTestFile({
      fileId: input.id,
      creditor: input.creditor,
      scheme,
      createdAt: input.created.at,
      requestedCollectionDay: input.requestedCollectionDay,
      remittance,
      debits: [debitOf(first), ...others.map(debitOf)],
    });
    if (!isAuditCoherent(file.xml)) {
      throw new CollectionTestFileIncoherentError();
    }
    const state: CollectionTestFileState = {
      id: input.id,
      legalEntityId: input.creditor.legalEntityId,
      scheme,
      requestedCollectionDay: input.requestedCollectionDay,
      messageId: file.messageId,
      created: input.created,
      xml: file.xml,
      fileSha256: file.sha256,
    };
    return new CollectionTestFile(state, [first.test, ...others.map(({ test }) => test)]);
  }

  get id(): string {
    return this.state.id;
  }

  get messageId(): string {
    return this.state.messageId;
  }

  /** Ses lignes, dans l'ordre où elles ont été données. */
  get tests(): readonly CollectionTest[] {
    return this.lines;
  }

  toPersistence(): CollectionTestFileState {
    return this.state;
  }
}

/** Une ligne donnée, et l'essai qu'elle a fait naître. */
interface DraftedLine {
  readonly line: TestFileLineInput;
  readonly test: CollectionTest;
}

/** Le débit qu'une ligne pose dans le fichier. */
function debitOf({ line, test }: DraftedLine): TestFileDebit {
  return {
    endToEndId: test.endToEndId,
    sequence: test.sequence,
    debtorName: line.debtorName,
    amountCents: test.amountCents,
    mandate: line.verdict.mandate,
  };
}

function assertLines(
  lines: readonly TestFileLineInput[],
): readonly [TestFileLineInput, ...TestFileLineInput[]] {
  const [head, ...rest] = lines;
  if (head === undefined) {
    throw new CollectionTestFileEmptyError();
  }
  if (lines.length > MAX_DEBTORS_PER_TEST_FILE) {
    throw new CollectionTestFileTooManyDebtorsError(lines.length, MAX_DEBTORS_PER_TEST_FILE);
  }
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.debtorCompanyId)) {
      throw new CollectionTestFileDuplicateDebtorError(line.debtorName);
    }
    seen.add(line.debtorCompanyId);
  }
  return [head, ...rest];
}

/**
 * Un fichier n'a qu'un créancier (`GrpHdr`, `CdtrSchmeId`) et qu'un schéma
 * (`LclInstrm`) : chaque mandat doit être signé chez l'entité de l'envoi, et
 * tous dans le schéma de la première ligne. Rend ce schéma.
 */
function assertSingleCreditorAndScheme(
  creditor: CreditorSnapshot,
  lines: readonly [TestFileLineInput, ...TestFileLineInput[]],
): SepaScheme {
  const scheme = lines[0].verdict.mandate.scheme;
  for (const { verdict, debtorName } of lines) {
    if (verdict.mandate.creditorId !== creditor.legalEntityId) {
      throw new CollectionTestFileMixedCreditorsError(debtorName, verdict.mandate.reference);
    }
    if (verdict.mandate.scheme !== scheme) {
      throw new CollectionTestFileMixedSchemesError(debtorName, verdict.mandate.scheme, scheme);
    }
  }
  return scheme;
}

function assertCollectionDay(day: string, earliest: string): void {
  if (!isTarget2BusinessDay(day)) {
    throw new CollectionTestDayClosedError(day, onOrAfterBusinessDay(day));
  }
  if (day < earliest) {
    throw new CollectionTestDayTooEarlyError(day, earliest);
  }
}
