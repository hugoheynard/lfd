import { Injectable } from "@nestjs/common";

import {
  OrderNoticeSummaryReader,
  type OrderNoticeSummary,
} from "../../../orders/domain/ports/order-notice-summary.reader.js";
import type { SubAccountActivity } from "../../../../platform/mailer/sub-account-activity-mail.js";
import { chargedToPrincipal } from "../../domain/notice-recipients.js";
import { PrincipalNoticeSender } from "./principal-notice.sender.js";

/** Les trois clés du tableau qu'un fait de commande peut toucher (N2). */
export type OrderNoticeKind = "order_placed" | "order_cancelled" | "payment_failed";

/** Un fait de commande, tel qu'un abonné le remet à l'avis. */
export interface OrderNotice {
  /** L'identifiant du fait dans la boîte d'envoi — clé du journal d'envoi. */
  readonly eventId: string;
  readonly kind: OrderNoticeKind;
  readonly activity: SubAccountActivity;
  readonly orderId: string;
  /** Qui a fait le geste, lu sur la commande ou sur le fait ; `null` : personne côté client. */
  readonly authorOf: (summary: OrderNoticeSummary) => string | null;
  /** Ce fait parle-t-il de cette commande-là ? Absent : oui. */
  readonly concerns?: (summary: OrderNoticeSummary) => boolean;
}

/**
 * **Prévenir le principal d'un geste de commande d'un de ses sites**
 * (`plan-notifications-sous-comptes.md`, §2, §3). Partagé par les trois
 * abonnés : ils ne diffèrent que par le fait lu et la clé du tableau.
 *
 * Il ne fait que lire la commande — le principal y est COPIÉ — et trier ;
 * destinataires, journal d'envoi et mail sont la fin commune à tous les avis
 * (`PrincipalNoticeSender`, extraite en N4a).
 */
@Injectable()
export class SubAccountNoticeDispatcher {
  constructor(
    private readonly orders: OrderNoticeSummaryReader,
    private readonly sender: PrincipalNoticeSender,
  ) {}

  async notify(notice: OrderNotice): Promise<void> {
    const summary = await this.orders.summaryOf(notice.orderId);
    const principalId = summary?.principalCompanyId ?? null;
    if (summary === null || principalId === null || summary.companyName === null) {
      return;
    }
    if (notice.concerns !== undefined && !notice.concerns(summary)) {
      return;
    }
    if (
      notice.kind === "payment_failed" &&
      !chargedToPrincipal(summary.billedCompanyId, principalId)
    ) {
      return;
    }
    await this.sender.send(
      {
        eventId: notice.eventId,
        kind: notice.kind,
        principalId,
        authorUserId: notice.authorOf(summary),
      },
      "customer.sub-account-activity",
      {
        activity: notice.activity,
        siteName: summary.companyName,
        orderNumber: summary.orderNumber,
        totalCents: summary.principalSeesAmount ? summary.totalCents : null,
        requestedFor: summary.requestedFor,
        enteredByTeam: summary.enteredByTeam,
      },
    );
  }
}
