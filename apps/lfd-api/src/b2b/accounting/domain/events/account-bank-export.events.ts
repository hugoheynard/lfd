import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { AccountBankExport } from "../entities/account-bank-export.js";
import {
  BANK_LINE_CORRECTIONS,
  type BankLineCorrection,
} from "../entities/bank-line-correction.js";
import type { KnownBankAccountState } from "../entities/known-bank-account.js";
import type { ExportedAccountLine } from "../ports/account-bank-exports.reader.js";
import { ACCOUNT_BANK_EXPORT_FACT_TYPES } from "./accounting-facts.js";
import type { ExportEntity } from "./mandate-bank-export.events.js";

/** Ce que fait un geste sur un export : le type de fait qu'il inscrit. */
export type AccountBankExportGesture = Exclude<
  keyof typeof ACCOUNT_BANK_EXPORT_FACT_TYPES,
  "knownDeclared" | "reportedKnown" | "rejected"
>;

/**
 * **Un geste sur un export des comptes** — préparé, téléchargé, marqué
 * importé, abandonné. Une seule classe pour quatre faits de même forme : le
 * sujet est l'ENTITÉ (sa fiche porte la carte), la charge le nombre de
 * comptes, et l'auteur celui de la ligne (`publishTraced`). Jamais un IBAN.
 */
export class AccountBankExportEvent implements JournaledEvent {
  constructor(
    readonly gesture: AccountBankExportGesture,
    readonly bankExport: AccountBankExport,
    readonly entity: ExportEntity,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ACCOUNT_BANK_EXPORT_FACT_TYPES[this.gesture],
      subjectType: "legal_entity",
      subjectId: this.entity.id,
      occurredAt: this.at,
      payload: { subjectLabel: this.entity.name, accountCount: this.bankExport.accountCount },
    };
  }
}

/** Un compte est déclaré connu de la banque, sans fichier — avec sa raison. */
export class BankAccountDeclaredKnownEvent implements JournaledEvent {
  constructor(
    readonly account: KnownBankAccountState,
    readonly companyName: string,
    readonly entity: ExportEntity,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ACCOUNT_BANK_EXPORT_FACT_TYPES.knownDeclared,
      subjectType: "legal_entity",
      subjectId: this.entity.id,
      occurredAt: this.account.declared.at,
      payload: {
        subjectLabel: this.entity.name,
        company: { id: this.account.companyId, name: this.companyName },
        reason: this.account.reason,
      },
    };
  }
}

/**
 * Le compte rendu d'import CENET, reporté sur un compte d'un export déposé :
 * « signalé connu » ou « rejeté », avec le motif du rejet. Jamais un IBAN.
 */
export class AccountBankLineCorrectedEvent implements JournaledEvent {
  constructor(
    readonly line: ExportedAccountLine,
    readonly correction: BankLineCorrection,
    readonly companyName: string,
    readonly entity: ExportEntity,
  ) {}

  journalFact(): JournalFact {
    const rejected = this.correction.kind === BANK_LINE_CORRECTIONS.rejected;
    return {
      type: rejected
        ? ACCOUNT_BANK_EXPORT_FACT_TYPES.rejected
        : ACCOUNT_BANK_EXPORT_FACT_TYPES.reportedKnown,
      subjectType: "legal_entity",
      subjectId: this.entity.id,
      occurredAt: this.correction.stamp.at,
      payload: {
        subjectLabel: this.entity.name,
        company: { id: this.line.companyId, name: this.companyName },
        ...(rejected ? { rejectionReason: this.correction.rejectionReason } : {}),
      },
    };
  }
}
