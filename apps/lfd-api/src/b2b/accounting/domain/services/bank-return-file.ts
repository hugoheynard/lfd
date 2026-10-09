import { InvalidBankReturnFileError } from "../errors/bank-return-file-errors.js";
import type { BankReturnKind } from "../value-objects/bank-return-reason.js";
import { NARRATIVE_REASON } from "../value-objects/bank-return-reason.js";
import { at, childrenNamed, parseXml, textAt, type XmlElement } from "./xml-tree.js";

export type BankReturnFileFormat = "pain002" | "camt054";

/** Une transaction que la banque dit revenue — avant tout appariement. */
export interface BankFileEntry {
  readonly endToEndId: string;
  readonly kind: BankReturnKind;
  /** Le code tel que lu ; `NARR` quand la banque n'a mis qu'un motif propriétaire. */
  readonly reasonCode: string;
  /** `AddtlInf`, ou le motif propriétaire ; `null` si la banque n'a rien dit de plus. */
  readonly reasonLabel: string | null;
  /** `AAAA-MM-JJ`. */
  readonly returnedOn: string;
  /** Ce que la banque dit du montant, en centimes. */
  readonly amountCents: number;
}

export interface BankReturnFile {
  readonly format: BankReturnFileFormat;
  readonly entries: readonly BankFileEntry[];
}

/** Ce qu'on garde au plus d'un fichier : au-delà, ce n'est pas un relevé de retours. */
export const BANK_FILE_MAX_ENTRIES = 500;

const AMOUNT = /^\d{1,12}(?:\.\d{1,2})?$/u;
const DAY = /^\d{4}-\d{2}-\d{2}/u;
const REFUND_REASON = "MD06";
const CENTS_PER_EURO = 100;
const PAIN002_REJECTED = "RJCT";

/**
 * **Lit un fichier de retours de la banque** (plan
 * `retours-bancaires.md`) : un `pain.002` (CstmrPmtStsRpt, rejets
 * avant règlement) ou un `camt.054` (BkToCstmrDbtCdtNtfctn, retours après).
 * Écrit d'après la norme ISO 20022 — versions `pain.002.001.03` et
 * `camt.054.001.02` ; **à éprouver sur un vrai fichier de la Caisse
 * d'Épargne**, que personne n'a encore vu (`question-banque.md`).
 *
 * Il ne décide RIEN : il dit ce que le fichier contient. L'appariement et les
 * refus sont l'affaire de l'agrégat, à la confirmation.
 *
 * @throws {InvalidBankReturnFileError} ni l'un ni l'autre, ou une transaction illisible.
 */
export function readBankReturnFile(xml: string): BankReturnFile {
  const root = parseXml(xml);
  const report = at(root, "CstmrPmtStsRpt");
  if (report !== null) {
    return bounded({ format: "pain002", entries: pain002Entries(report) });
  }
  const notification = at(root, "BkToCstmrDbtCdtNtfctn");
  if (notification !== null) {
    return bounded({ format: "camt054", entries: camt054Entries(notification) });
  }
  throw new InvalidBankReturnFileError(
    "ni CstmrPmtStsRpt (pain.002) ni BkToCstmrDbtCdtNtfctn (camt.054) sous Document",
  );
}

function bounded(file: BankReturnFile): BankReturnFile {
  if (file.entries.length > BANK_FILE_MAX_ENTRIES) {
    throw new InvalidBankReturnFileError(
      `${file.entries.length} transactions, au-delà de ${BANK_FILE_MAX_ENTRIES}`,
    );
  }
  return file;
}

/** `pain.002` : les transactions rejetées (`TxSts` = `RJCT`), datées du rapport. */
function pain002Entries(report: XmlElement): readonly BankFileEntry[] {
  const created = textAt(report, "GrpHdr", "CreDtTm");
  const returnedOn = dayOf(created, "GrpHdr/CreDtTm");
  return childrenNamed(report, "OrgnlPmtInfAndSts").flatMap((block) =>
    childrenNamed(block, "TxInfAndSts")
      .filter((tx) => textAt(tx, "TxSts") === PAIN002_REJECTED)
      .map((tx) => ({
        endToEndId: required(textAt(tx, "OrgnlEndToEndId"), "OrgnlEndToEndId"),
        kind: "reject" as const,
        ...reasonOf(at(tx, "StsRsnInf")),
        returnedOn,
        amountCents: amountOf(
          at(tx, "OrgnlTxRef", "Amt", "InstdAmt") ?? at(tx, "OrgnlInstdAmt"),
          "OrgnlTxRef/Amt/InstdAmt",
        ),
      })),
  );
}

/** `camt.054` : les détails de transaction qui portent un `RtrInf`. */
function camt054Entries(notification: XmlElement): readonly BankFileEntry[] {
  return childrenNamed(notification, "Ntfctn").flatMap((ntfctn) =>
    childrenNamed(ntfctn, "Ntry").flatMap((entry) => {
      const booked =
        textAt(entry, "BookgDt", "Dt") ??
        textAt(entry, "BookgDt", "DtTm") ??
        textAt(entry, "ValDt", "Dt");
      const details = childrenNamed(at(entry, "NtryDtls") ?? entry, "TxDtls");
      return details
        .filter((tx) => at(tx, "RtrInf") !== null)
        .map((tx) => camt054Entry(tx, entry, details.length, booked));
    }),
  );
}

function camt054Entry(
  tx: XmlElement,
  entry: XmlElement,
  siblings: number,
  booked: string | null,
): BankFileEntry {
  const reason = reasonOf(at(tx, "RtrInf"));
  const amount =
    at(tx, "AmtDtls", "TxAmt", "Amt") ??
    at(tx, "Amt") ??
    (siblings === 1 ? at(entry, "Amt") : null);
  return {
    endToEndId: required(textAt(tx, "Refs", "EndToEndId"), "Refs/EndToEndId"),
    kind: reason.reasonCode === REFUND_REASON ? "refund_request" : "return",
    ...reason,
    returnedOn: dayOf(booked, "BookgDt/Dt"),
    amountCents: amountOf(amount, "AmtDtls/TxAmt/Amt"),
  };
}

/**
 * `StsRsnInf` ou `RtrInf` : `Rsn/Cd` (ISO), sinon `Rsn/Prtry` (propre à la
 * banque, donc « autre » avec ses mots), et `AddtlInf` en libellé.
 */
function reasonOf(info: XmlElement | null): Pick<BankFileEntry, "reasonCode" | "reasonLabel"> {
  const additional = info === null ? null : textAt(info, "AddtlInf");
  const code = info === null ? null : textAt(info, "Rsn", "Cd");
  if (code !== null) {
    return { reasonCode: code, reasonLabel: additional };
  }
  const proprietary = info === null ? null : textAt(info, "Rsn", "Prtry");
  return {
    reasonCode: NARRATIVE_REASON,
    reasonLabel: proprietary ?? additional ?? "Motif non donné par la banque",
  };
}

/** `"123.45"` en EUR → 12345, sans flottant. */
function amountOf(element: XmlElement | null, where: string): number {
  const raw = element?.text.trim() ?? "";
  if (element === null || !AMOUNT.test(raw)) {
    throw new InvalidBankReturnFileError(`montant illisible en ${where} (« ${raw.slice(0, 20)} »)`);
  }
  const currency = element.attributes.get("Ccy");
  if (currency !== undefined && currency !== "EUR") {
    throw new InvalidBankReturnFileError(`montant en ${currency} en ${where}, EUR attendu`);
  }
  const [euros = "0", cents = ""] = raw.split(".");
  return Number(euros) * CENTS_PER_EURO + Number(cents.padEnd(2, "0"));
}

function dayOf(raw: string | null, where: string): string {
  if (raw === null || !DAY.test(raw)) {
    throw new InvalidBankReturnFileError(`date illisible en ${where}`);
  }
  return raw.slice(0, 10);
}

function required(value: string | null, where: string): string {
  if (value === null) {
    throw new InvalidBankReturnFileError(`${where} manquant sur une transaction`);
  }
  return value;
}
