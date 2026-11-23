import type { JournalFact } from "../../../../platform/journal/journal-fact.js";
import type { ExportReaderKey } from "../entities/export-reader-key.js";

/** Le sujet des faits d'une clé d'export, au journal d'activité. */
const SUBJECT_TYPE = "export_reader_key";

/**
 * La clé est créée. Ni secret ni haché ; les adresses admises sont comptées,
 * pas citées : une adresse n'a rien à faire dans un journal qu'on relit des
 * années après.
 */
export function exportKeyCreatedFact(key: ExportReaderKey): JournalFact {
  return {
    type: "export_key.created",
    subjectType: SUBJECT_TYPE,
    subjectId: key.id,
    payload: {
      subjectLabel: key.label,
      expiresAt: key.expiresAt.toISOString(),
      allowedIpCount: key.allowedIps.length,
    },
  };
}

/** La clé est révoquée. */
export function exportKeyRevokedFact(key: ExportReaderKey): JournalFact {
  return {
    type: "export_key.revoked",
    subjectType: SUBJECT_TYPE,
    subjectId: key.id,
    payload: { subjectLabel: key.label },
  };
}
