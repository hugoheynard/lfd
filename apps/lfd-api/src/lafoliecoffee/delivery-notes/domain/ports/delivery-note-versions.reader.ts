import type { KeptVersion } from "../services/delivery-note-version.js";
import type { RenderedClientNote } from "../services/rendered-client-note.js";

/** Une version d'un bon, telle que la liste des documents la nomme. */
export type DeliveryNoteVersionSummary = KeptVersion;

/**
 * Port de **lecture** de l'historique des versions — pour la liste des
 * documents de la fiche. Séparé du rendu d'une version (ISP).
 */
export abstract class DeliveryNoteVersionsReader {
  /** Les versions de ces bons, par bon, dans l'ordre des versions ; absent = aucune. */
  abstract versionsOf(
    noteIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly DeliveryNoteVersionSummary[]>>;
}

/** Port de **lecture** d'une version figée, pour rendre son PDF. */
export abstract class DeliveryNoteVersionRenderedReader {
  /** L'entrée figée de cette version ; `null` = non conservée. */
  abstract renderedOf(noteId: string, contentVersion: number): Promise<RenderedClientNote | null>;
}
