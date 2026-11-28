import type { PlanVersion } from "../entities/plan-version.js";
import type { PlanVersionAuthor, PlanVersionCause } from "../entities/plan-version.content.js";

/** La seule cause dont la version n'a pas de papier propre (§ 1.14). */
const WITHOUT_OWN_PAPER: PlanVersionCause = "order_withdrawn";

/**
 * Une version telle que la liste la montre : laquelle, pourquoi, qui, quand,
 * son tirage, son nombre d'envois, et la version dont le papier la représente.
 */
export interface PlanVersionEntry {
  readonly version: number;
  readonly cause: PlanVersionCause;
  readonly recordedAt: Date;
  readonly recordedBy: PlanVersionAuthor;
  /** L'arrêt auquel elle appartient : il change après une réouverture. */
  readonly closedAt: Date;
  /** Le « tirage m » de son papier. */
  readonly printRun: number;
  readonly shipmentCount: number;
  /**
   * La version dont le papier sert : elle-même, ou — pour un retrait, qui ne
   * change ni les commandes ni le compte — la dernière version d'avant qui a
   * un papier propre. `null` : aucune (un retrait en première version, sur
   * une journée arrêtée avant qu'on garde les versions).
   */
  readonly paperVersion: number | null;
}

/**
 * **La liste des versions d'une journée** (`documentation/fournil/plan-historique-des-tirages.md`,
 * § 1.12 et § 1.14) — pure : chaque version, et le papier qui la représente.
 *
 * @param versions la chaîne de la journée, de la première à la dernière.
 */
export function planVersionEntriesOf(
  versions: readonly PlanVersion[],
): readonly PlanVersionEntry[] {
  let lastPaper: number | null = null;
  return versions.map((version) => {
    const record = version.toRecord();
    if (record.cause !== WITHOUT_OWN_PAPER) {
      lastPaper = record.version;
    }
    return {
      version: record.version,
      cause: record.cause,
      recordedAt: record.recordedAt,
      recordedBy: record.recordedBy,
      closedAt: record.closedAt,
      printRun: record.printRun,
      shipmentCount: record.content.shipments.length,
      paperVersion: lastPaper,
    };
  });
}
