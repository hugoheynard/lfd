import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { MandateBankExport } from "../entities/mandate-bank-export.js";
import {
  BANK_LINE_CORRECTIONS,
  type BankLineCorrection,
} from "../entities/bank-line-correction.js";
import type { ExportedMandateLine } from "../ports/mandate-bank-exports.reader.js";
import { MANDATE_BANK_EXPORT_FACT_TYPES } from "./accounting-facts.js";

/** L'entité émettrice de l'export, avec son nom du moment. */
export interface ExportEntity {
  readonly id: string;
  readonly name: string;
}

/**
 * Le sujet est l'ENTITÉ, pas l'export : c'est sa fiche qui porte la carte
 * « Mandats à la banque », et un export n'a pas de nom à citer. L'auteur est
 * celui de la ligne du journal (`publishTraced`).
 */
function exportFact(
  type: JournalFact["type"],
  bankExport: MandateBankExport,
  entity: ExportEntity,
  at: Date,
): JournalFact {
  return {
    type,
    subjectType: "legal_entity",
    subjectId: entity.id,
    occurredAt: at,
    payload: {
      subjectLabel: entity.name,
      mandateCount: bankExport.mandateCount,
      reference: bankExport.reference,
    },
  };
}

/** Un export des mandats est préparé — son fichier peut se télécharger. */
export class MandateBankExportCreatedEvent implements JournaledEvent {
  constructor(
    readonly bankExport: MandateBankExport,
    readonly entity: ExportEntity,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    return exportFact(
      MANDATE_BANK_EXPORT_FACT_TYPES.created,
      this.bankExport,
      this.entity,
      this.at,
    );
  }
}

/** Quelqu'un a dit que la banque a importé l'export. */
export class MandateBankExportImportedEvent implements JournaledEvent {
  constructor(
    readonly bankExport: MandateBankExport,
    readonly entity: ExportEntity,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    return exportFact(
      MANDATE_BANK_EXPORT_FACT_TYPES.imported,
      this.bankExport,
      this.entity,
      this.at,
    );
  }
}

/**
 * Le fichier de l'export a été téléchargé (R8, `prerequis-export-ribs.md`) :
 * il porte les IBAN en clair, chaque sortie est donc tracée.
 */
export class MandateBankExportDownloadedEvent implements JournaledEvent {
  constructor(
    readonly bankExport: MandateBankExport,
    readonly entity: ExportEntity,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    return exportFact(
      MANDATE_BANK_EXPORT_FACT_TYPES.downloaded,
      this.bankExport,
      this.entity,
      this.at,
    );
  }
}

/** La banque a rejeté l'export : quelqu'un l'a abandonné. */
export class MandateBankExportAbandonedEvent implements JournaledEvent {
  constructor(
    readonly bankExport: MandateBankExport,
    readonly entity: ExportEntity,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    return exportFact(
      MANDATE_BANK_EXPORT_FACT_TYPES.abandoned,
      this.bankExport,
      this.entity,
      this.at,
    );
  }
}

/**
 * Le compte rendu d'import CENET, reporté sur un mandat d'un export déposé :
 * « signalé connu » ou « rejeté », avec le motif du rejet. La RUM, jamais
 * l'IBAN.
 */
export class MandateBankLineCorrectedEvent implements JournaledEvent {
  constructor(
    readonly line: ExportedMandateLine,
    readonly correction: BankLineCorrection,
    readonly entity: ExportEntity,
  ) {}

  journalFact(): JournalFact {
    const rejected = this.correction.kind === BANK_LINE_CORRECTIONS.rejected;
    return {
      type: rejected
        ? MANDATE_BANK_EXPORT_FACT_TYPES.rejected
        : MANDATE_BANK_EXPORT_FACT_TYPES.reportedKnown,
      subjectType: "legal_entity",
      subjectId: this.entity.id,
      occurredAt: this.correction.stamp.at,
      payload: {
        subjectLabel: this.entity.name,
        rum: this.line.rum,
        ...(rejected ? { rejectionReason: this.correction.rejectionReason } : {}),
      },
    };
  }
}
