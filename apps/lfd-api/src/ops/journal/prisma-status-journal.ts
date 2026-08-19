import { Injectable, Logger } from "@nestjs/common";
import { healthStatusSchema, isHealthReason } from "@lfd/ops-contract";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { IdGenerator } from "../../platform/id/id-generator.js";
import { StatusJournal, type StatusTransition } from "./status-journal.port.js";

/**
 * Le journal, dans le schéma `ops`.
 *
 * **Rien de ce qui se passe ici n'a le droit de faire échouer une lecture de la
 * carte.** L'écriture est un effet de bord du diagnostic, pas son objet : si la
 * base refuse, on perd une ligne d'historique — on ne perd pas l'écran qui
 * servait justement à comprendre pourquoi la base refuse.
 */
@Injectable()
export class PrismaStatusJournal extends StatusJournal {
  private readonly logger = new Logger(PrismaStatusJournal.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  async record(transitions: readonly StatusTransition[]): Promise<void> {
    if (transitions.length === 0) {
      return;
    }
    try {
      await this.prisma.nodeStatusLog.createMany({
        data: transitions.map((transition) => ({
          id: `nodestatus_${this.ids.next()}`,
          node: transition.node,
          status: transition.status,
          reason: transition.reason,
          detail: transition.detail,
          at: transition.at,
        })),
      });
    } catch (error) {
      this.logger.warn("Journal de statuts : écriture impossible", error);
    }
  }

  /**
   * Le dernier état de chaque nœud, en **une** requête.
   *
   * `DISTINCT ON` est du SQL brut parce que Prisma ne l'exprime pas : l'écrire
   * en `groupBy` puis re-lire chaque ligne ferait N+1 requêtes au démarrage
   * pour un résultat identique — et ce serait le seul endroit de l'application
   * où le nombre de requêtes suivrait le nombre de nœuds de la carte.
   */
  async latest(): Promise<ReadonlyMap<string, StatusTransition>> {
    try {
      const rows = await this.prisma.$queryRaw<readonly LatestRow[]>`
        SELECT DISTINCT ON (node) node, status, reason, detail, at
        FROM ops.node_status_log
        ORDER BY node, at DESC
      `;
      return new Map(rows.map((row) => [row.node, toTransition(row)]));
    } catch (error) {
      // Sans mémoire, `since` repart de maintenant : on rajeunit un incident,
      // on n'en invente pas. C'est la dégradation acceptable.
      this.logger.warn("Journal de statuts : relecture impossible", error);
      return new Map();
    }
  }
}

interface LatestRow {
  readonly node: string;
  readonly status: string;
  readonly reason: string;
  readonly detail: string;
  readonly at: Date;
}

/**
 * Les colonnes sont du **texte**, pas des énumérations : un statut retiré du
 * contrat ne doit pas rendre illisible l'historique écrit avant lui.
 *
 * On relit donc en VÉRIFIANT, pas en affirmant. Une valeur d'hier que le
 * contrat d'aujourd'hui ne connaît plus retombe sur « on ne sait pas » — ce qui
 * est la vérité — au lieu d'être promue de force en statut valide.
 */
function toTransition(row: LatestRow): StatusTransition {
  const status = healthStatusSchema.safeParse(row.status);
  return {
    node: row.node,
    status: status.success ? status.data : "unknown",
    reason: isHealthReason(row.reason) ? row.reason : "no-evidence",
    detail: row.detail,
    at: row.at,
  };
}
