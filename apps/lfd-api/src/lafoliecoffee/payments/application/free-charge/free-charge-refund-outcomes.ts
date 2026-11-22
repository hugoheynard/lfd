import { Injectable } from "@nestjs/common";

import type { SubjectRefundOutcome } from "../../../../payment/channels/subjects/index.js";
import { Journal } from "../../../../platform/journal/journal.js";
import type { PaymentLink } from "../../domain/entities/payment-link.js";
import { PaymentLinkCompanyReader } from "../../domain/ports/payment-link-company.reader.js";
import { type FailedPaymentLinkRefund, PaymentLinkBell, ringingOf } from "../payment-link-bell.js";

/** Le statut que le journal écrit pour un remboursement constaté. */
type JournalRefundStatus = "pending" | "requires_action" | "succeeded" | "failed" | "canceled";

/** Ce qu'un genre d'issue demande : une ligne de journal, une cloche, ou rien. */
interface RefundReaction {
  readonly journal: { readonly amountCents: number; readonly status: JournalRefundStatus } | null;
  readonly bell: FailedPaymentLinkRefund | null;
}

const NOTHING: RefundReaction = { journal: null, bell: null };

/**
 * **Chaque genre d'issue, et ce qu'il fait d'une demande de paiement libre** — exhaustif :
 * un genre de plus sans sa réaction ne compile pas. Ce qui a rendu de
 * l'argent, ou dit où il en est, va au journal ; ce qui ne l'a pas rendu
 * sonne. Un essai accepté par le prestataire (`issued`) attend son constat.
 */
function reactionTo(o: SubjectRefundOutcome): RefundReaction {
  switch (o.kind) {
    case "recorded":
      return { journal: { amountCents: o.amountCents, status: o.status }, bell: null };
    case "succeeded":
    case "settled_elsewhere":
      return { journal: { amountCents: o.amountCents, status: "succeeded" }, bell: null };
    case "failed":
      return {
        journal: { amountCents: o.amountCents, status: o.status },
        bell: { reference: o.refundId, amountCents: o.amountCents },
      };
    case "reversed":
      return {
        journal: { amountCents: o.amountCents, status: o.status },
        bell: { reference: `${o.refundId}:reversed`, amountCents: o.amountCents },
      };
    case "rejected":
      return {
        journal: null,
        bell: { reference: `rejected:${o.providerRef}`, amountCents: o.amountCents },
      };
    case "attempted":
      return {
        journal: null,
        bell: {
          reference: `attempt:${o.requestId ?? o.position.subject.id}:${String(o.generation)}`,
          amountCents: null,
        },
      };
    case "issued":
      return NOTHING;
  }
}

/**
 * **Un remboursement d'une demande de paiement libre** (plan du lien vers un sujet,
 * §5.5) : la demande de paiement libre ne change pas d'état — l'argent rendu ne la rouvre
 * pas, et l'avoir éventuel est un geste humain. Le journal de la société le
 * dit (`payment_link.refunded`) ; un remboursement qui n'a pas rendu l'argent
 * sonne la cloche. Appelé dans la transaction de `payment` : une panne lève,
 * et le constat se rejoue.
 */
@Injectable()
export class FreeChargeRefundOutcomes {
  constructor(
    private readonly journal: Journal,
    private readonly companies: PaymentLinkCompanyReader,
    private readonly bell: PaymentLinkBell,
  ) {}

  async apply(link: PaymentLink, outcome: SubjectRefundOutcome): Promise<void> {
    const reaction = reactionTo(outcome);
    if (reaction.journal !== null) {
      await this.note(link, reaction.journal, outcome.position.refundedCents);
    }
    if (reaction.bell !== null) {
      await this.bell.refundFailed(ringingOf(link), reaction.bell);
    }
  }

  private async note(
    link: PaymentLink,
    entry: NonNullable<RefundReaction["journal"]>,
    refundedCents: number,
  ): Promise<void> {
    await this.journal.append({
      type: "payment_link.refunded",
      subjectType: "company",
      subjectId: link.companyId,
      payload: {
        subjectLabel: (await this.companies.nameOf(link.companyId)) ?? link.companyId,
        paymentLink: { id: link.id, name: link.terms.label },
        amountCents: entry.amountCents,
        refundedCents,
        status: entry.status,
      },
    });
  }
}
