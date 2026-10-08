import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { MandateBankExport } from "../entities/mandate-bank-export.js";
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
    payload: { subjectLabel: entity.name, mandateCount: bankExport.mandateCount },
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
