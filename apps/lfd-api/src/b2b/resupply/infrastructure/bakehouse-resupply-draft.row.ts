import { bakehouseResupplyDraftLineSchema } from "@lfd/contracts";
import { z } from "zod";

import { UnreadableBakehouseResupplyDraftError } from "../domain/bakehouse-resupply-draft-errors.js";
import {
  type BakehouseResupplyDraft,
  type BakehouseResupplyDraftLine,
  type BakehouseResupplyDraftSnapshot,
  bakehouseDraftStatusOf,
} from "../domain/bakehouse-resupply-draft.js";
import { resupplyTargetOf, type SiteResupplyTrace } from "../domain/site-resupply.js";

const LINES = z.array(bakehouseResupplyDraftLineSchema);

/** La ligne telle que Prisma la rend. */
export interface BakehouseResupplyDraftRow {
  readonly id: string;
  readonly siteId: string;
  readonly target: string;
  readonly name: string | null;
  readonly lines: unknown;
  readonly status: string;
  readonly sentResupplyId: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly createdByStaffId: string;
  readonly createdByName: string;
  readonly createdByRole: string;
  readonly updatedAt: Date;
  readonly updatedByStaffId: string;
  readonly updatedByName: string;
  readonly updatedByRole: string;
  readonly closedAt: Date | null;
  readonly closedByStaffId: string | null;
  readonly closedByName: string | null;
  readonly closedByRole: string | null;
}

/** Les lignes relues à travers le contrat ; illisibles : une erreur technique, jamais un brouillon vidé. */
function linesOf(row: BakehouseResupplyDraftRow): readonly BakehouseResupplyDraftLine[] {
  const parsed = LINES.safeParse(row.lines);
  if (!parsed.success) {
    throw new UnreadableBakehouseResupplyDraftError(row.id, parsed.error);
  }
  return parsed.data;
}

function trace(at: Date, staffUserId: string, name: string, role: string): SiteResupplyTrace {
  return { at, author: { staffUserId, name, role } };
}

/** Ligne → instantané du domaine : la visée et le statut revalident. */
export function draftSnapshotOf(row: BakehouseResupplyDraftRow): BakehouseResupplyDraftSnapshot {
  return {
    id: row.id,
    version: row.version,
    status: bakehouseDraftStatusOf(row.status),
    content: {
      siteId: row.siteId,
      target: resupplyTargetOf(row.target),
      name: row.name,
      lines: linesOf(row),
    },
    created: trace(row.createdAt, row.createdByStaffId, row.createdByName, row.createdByRole),
    updated: trace(row.updatedAt, row.updatedByStaffId, row.updatedByName, row.updatedByRole),
    closed:
      row.closedAt === null
        ? null
        : trace(
            row.closedAt,
            row.closedByStaffId ?? "",
            row.closedByName ?? "",
            row.closedByRole ?? "",
          ),
    sentResupplyId: row.sentResupplyId,
  };
}

/** Agrégat → colonnes réécrites à chaque enregistrement. */
export function draftColumnsOf(draft: BakehouseResupplyDraft) {
  const { content, updated, closed } = draft;
  return {
    siteId: content.siteId,
    target: content.target,
    name: content.name,
    lines: content.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
    status: draft.status,
    sentResupplyId: draft.sentResupplyId,
    updatedAt: updated.at,
    updatedByStaffId: updated.author.staffUserId,
    updatedByName: updated.author.name,
    updatedByRole: updated.author.role,
    closedAt: closed?.at ?? null,
    closedByStaffId: closed?.author.staffUserId ?? null,
    closedByName: closed?.author.name ?? null,
    closedByRole: closed?.author.role ?? null,
  };
}
