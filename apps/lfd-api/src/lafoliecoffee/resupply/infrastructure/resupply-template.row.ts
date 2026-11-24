import { resupplyTemplateLineSchema } from "@lfd/contracts";
import { z } from "zod";

import type { ResupplyListLine } from "../domain/resupply-line-list.js";
import type { ResupplyTemplate, ResupplyTemplateSnapshot } from "../domain/resupply-template.js";
import { UnreadableResupplyTemplateError } from "../domain/resupply-template-errors.js";
import type { ResupplyTrace } from "../domain/resupply-trace.js";
import { resupplyTargetOf } from "../domain/site-resupply.js";
import { wholeTraceOf } from "./trace-columns.js";

const LINES = z.array(resupplyTemplateLineSchema);

/** La ligne telle que Prisma la rend. */
export interface ResupplyTemplateRow {
  readonly id: string;
  readonly siteId: string;
  readonly name: string;
  readonly target: string;
  readonly arrivalBy: string | null;
  readonly lines: unknown;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdByStaffId: string;
  readonly createdByName: string;
  readonly createdByRole: string;
  readonly updatedAt: Date;
  readonly updatedByStaffId: string;
  readonly updatedByName: string;
  readonly updatedByRole: string;
  readonly archivedAt: Date | null;
  readonly archivedByStaffId: string | null;
  readonly archivedByName: string | null;
  readonly archivedByRole: string | null;
}

/** Les lignes relues à travers le contrat ; illisibles : une erreur technique, jamais un modèle vidé. */
function linesOf(row: ResupplyTemplateRow): readonly ResupplyListLine[] {
  const parsed = LINES.safeParse(row.lines);
  if (!parsed.success) {
    throw new UnreadableResupplyTemplateError(row.id, parsed.error);
  }
  return parsed.data;
}

function trace(at: Date, staffUserId: string, name: string, role: string): ResupplyTrace {
  return { at, author: { staffUserId, name, role } };
}

/** Ligne → instantané du domaine : la visée et le contenu revalident. */
export function templateSnapshotOf(row: ResupplyTemplateRow): ResupplyTemplateSnapshot {
  return {
    id: row.id,
    siteId: row.siteId,
    version: row.version,
    content: {
      name: row.name,
      target: resupplyTargetOf(row.target),
      arrivalBy: row.arrivalBy,
      lines: linesOf(row),
    },
    created: trace(row.createdAt, row.createdByStaffId, row.createdByName, row.createdByRole),
    updated: trace(row.updatedAt, row.updatedByStaffId, row.updatedByName, row.updatedByRole),
    archived: wholeTraceOf(
      {
        at: row.archivedAt,
        staffUserId: row.archivedByStaffId,
        name: row.archivedByName,
        role: row.archivedByRole,
      },
      { table: "resupply_templates", rowId: row.id, gesture: "archivage" },
    ),
  };
}

/** Agrégat → colonnes réécrites à chaque écriture. Le point ne change jamais. */
export function templateColumnsOf(template: ResupplyTemplate) {
  const { content, updated, archived } = template;
  return {
    name: content.name,
    target: content.target,
    arrivalBy: content.arrivalBy ?? null,
    lines: content.lines.map((line) => ({
      sku: line.sku,
      quantity: line.quantity,
      saleUnit: line.saleUnit,
    })),
    updatedAt: updated.at,
    updatedByStaffId: updated.author.staffUserId,
    updatedByName: updated.author.name,
    updatedByRole: updated.author.role,
    archivedAt: archived?.at ?? null,
    archivedByStaffId: archived?.author.staffUserId ?? null,
    archivedByName: archived?.author.name ?? null,
    archivedByRole: archived?.author.role ?? null,
  };
}
