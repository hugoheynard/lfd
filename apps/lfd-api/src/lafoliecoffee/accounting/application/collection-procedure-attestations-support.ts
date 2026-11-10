import type { CollectionBatchAttestationsView } from "@lfd/contracts";

import type { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import type { CollectionBatchAttestationsReader } from "../domain/ports/collection-batch-attestations.reader.js";
import {
  BATCH_ATTESTATION_KINDS,
  standingAttestationOf,
  type BatchAttestationLine,
} from "../domain/services/collection-batch-attestations.js";

/** Les attestations des lots de la procédure : les lignes, et ce que l'écran en montre. */
export interface ProcedureAttestations {
  readonly lines: readonly BatchAttestationLine[];
  /** Par lot : chaque sorte lue par sa dernière ligne, avec son auteur nommé. */
  readonly views: ReadonlyMap<string, CollectionBatchAttestationsView>;
}

const NONE: CollectionBatchAttestationsView = {
  audit_reviewed: null,
  remittance_signed: null,
  psr_read: null,
};

/** Les attestations d'un lot telles que l'écran les lit ; aucune si le lot n'en a pas. */
export function attestationsViewOf(
  views: ReadonlyMap<string, CollectionBatchAttestationsView>,
  batchId: string,
): CollectionBatchAttestationsView {
  return views.get(batchId) ?? NONE;
}

/**
 * Les attestations des lots (plan `plan-page-procedure-de-prelevement.md`
 * § 1.2, P3) : la dernière ligne de chaque (lot, sorte) fait foi, et ses
 * auteurs sont nommés d'un seul appel à l'annuaire.
 */
export async function readProcedureAttestations(
  readers: {
    readonly attestations: CollectionBatchAttestationsReader;
    readonly authors: StaffAuthorDirectory;
  },
  batchIds: readonly string[],
): Promise<ProcedureAttestations> {
  const lines = batchIds.length === 0 ? [] : await readers.attestations.ofBatches(batchIds);
  const standing = BATCH_ATTESTATION_KINDS.flatMap((kind) =>
    batchIds.flatMap((batchId) => {
      const line = standingAttestationOf(
        lines.filter((row) => row.batchId === batchId),
        kind,
      );
      return line === null ? [] : [line];
    }),
  );
  const names = await readers.authors.identify(standing.map((line) => line.staffId));
  const views = new Map<string, CollectionBatchAttestationsView>();
  for (const line of standing) {
    views.set(line.batchId, {
      ...attestationsViewOf(views, line.batchId),
      [line.kind]: { at: line.at.toISOString(), byName: names.nameOf(line.staffId) },
    });
  }
  return { lines, views };
}
