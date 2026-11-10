import type { SubjectRefundOutcomeDraft } from "../../channels/subjects/index.js";
import type { CardRefundLine, CardRefundReport } from "../../domain/entities/card-refund-ledger.js";
import type { CardRefundRejection } from "../../domain/errors/card-refund-errors.js";
import type { CardRefundStatus } from "../../domain/value-objects/card-refund-values.js";

/** Ce qu'un genre de ligne reçoit : la ligne, réduite, et son statut d'avant. */
interface LineBase {
  readonly refundId: string;
  readonly providerRef: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly requestId: string | null;
}

type LineOutcome = (base: LineBase, before: CardRefundStatus | null) => SubjectRefundOutcomeDraft;

/** Un genre par statut — une table, pas un aiguillage. */
const BY_STATUS: Readonly<Record<CardRefundStatus, LineOutcome>> = {
  pending: (base) => ({ ...base, kind: "recorded", status: "pending" }),
  requires_action: (base) => ({ ...base, kind: "recorded", status: "requires_action" }),
  succeeded: (base) => ({ ...base, kind: "succeeded" }),
  failed: (base, before) =>
    before === "succeeded"
      ? { ...base, kind: "reversed", status: "failed" }
      : { ...base, kind: "failed", status: "failed" },
  canceled: (base) => ({ ...base, kind: "failed", status: "canceled" }),
};

/**
 * **L'issue d'une ligne du carnet, pour le sujet** (plan M2, §3.3) : son
 * genre suit son statut — en attente (`recorded`), réussie (`succeeded`),
 * morte (`failed`), ou réussie PUIS morte (`reversed`, §6.2 : `succeeded →
 * failed` seulement). `providerRef` est ici le `re_…`.
 */
export function lineOutcome(
  line: CardRefundLine,
  before: CardRefundStatus | null,
): SubjectRefundOutcomeDraft {
  return BY_STATUS[line.status](
    {
      refundId: line.id,
      providerRef: line.providerRef ?? "",
      amountCents: line.amountCents,
      currency: line.currency,
      requestId: line.requestId,
    },
    before,
  );
}

/** Le carnet a refusé le remboursement : rien d'écrit, le sujet le dit et sonne. */
export function rejectedOutcome(
  report: CardRefundReport,
  reason: CardRefundRejection,
  requestId: string | null,
): SubjectRefundOutcomeDraft {
  return {
    kind: "rejected",
    requestId,
    providerRef: report.providerRef,
    amountCents: report.amountCents,
    currency: report.currency,
    status: report.status,
    reason,
  };
}
