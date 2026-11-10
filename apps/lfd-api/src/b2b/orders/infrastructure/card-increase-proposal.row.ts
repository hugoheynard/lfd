import type { OrderRevisionProposal, Prisma } from "../../../platform/database/client/client.js";
import type {
  FrozenIncreaseContent,
  FrozenIncreaseRules,
} from "../domain/entities/card-increase-proposal.js";
import type { RevisionActor } from "../domain/entities/order-revision.js";
import { UnreadableCardIncreaseProposalError } from "../domain/errors/card-increase-proposal-row.error.js";

/** La ligne `order_revision_proposal`, telle que Prisma la rend. */
export type ProposalRow = OrderRevisionProposal;

/** Les colonnes `revised_by_*` — le CHECK d'`order_revision`. */
export function authorColumnsOf(author: RevisionActor) {
  return author.kind === "customer"
    ? { revisedByKind: "customer", revisedByUserId: author.userId, revisedByStaffId: null }
    : { revisedByKind: "staff", revisedByUserId: null, revisedByStaffId: author.staffId };
}

export function authorOf(row: ProposalRow): RevisionActor {
  if (row.revisedByKind === "customer" && row.revisedByUserId !== null) {
    return { kind: "customer", userId: row.revisedByUserId };
  }
  if (row.revisedByKind === "staff" && row.revisedByStaffId !== null) {
    return { kind: "staff", staffId: row.revisedByStaffId };
  }
  throw new UnreadableCardIncreaseProposalError(row.id, "auteur");
}

function isRecord(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Le contenu saisi, opaque ici : un objet JSON. */
export function contentOf(proposalId: string, value: Prisma.JsonValue): FrozenIncreaseContent {
  if (!isRecord(value)) {
    throw new UnreadableCardIncreaseProposalError(proposalId, "contenu");
  }
  return value;
}

export function rulesOf(proposalId: string, value: Prisma.JsonValue): FrozenIncreaseRules {
  if (!isRecord(value)) {
    throw new UnreadableCardIncreaseProposalError(proposalId, "règles");
  }
  const kind = value["rulesOf"];
  if (kind !== "customer" && kind !== "staff") {
    throw new UnreadableCardIncreaseProposalError(proposalId, "règles de l'auteur");
  }
  return { rulesOf: kind };
}
