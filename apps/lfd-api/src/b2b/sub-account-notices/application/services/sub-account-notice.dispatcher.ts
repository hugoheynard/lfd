import { Inject, Injectable } from "@nestjs/common";

import { AcceptedMembersReader } from "../../../account/domain/ports/accepted-members.reader.js";
import { CompanyLifecycleReader } from "../../../account/domain/ports/company-lifecycle.reader.js";
import { SubAccountNoticeRulesReader } from "../../../account/domain/ports/sub-account-notice-rules.reader.js";
import {
  OrderNoticeSummaryReader,
  type OrderNoticeSummary,
} from "../../../orders/domain/ports/order-notice-summary.reader.js";
import { MAILER, type B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import type { SubAccountActivity } from "../../../../platform/mailer/sub-account-activity-mail.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  chargedToPrincipal,
  noticeRecipients,
  principalStillWritten,
} from "../../domain/notice-recipients.js";
import { notifiedRoles } from "../../domain/notified-roles.js";
import { NoticeSendJournal } from "../../domain/ports/notice-send.journal.js";

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
 * Tourne dans l'unité de travail de la garde du relais. Pour chaque
 * destinataire : la ligne du journal d'envoi d'abord, l'envoi ensuite ; une
 * ligne déjà là saute ce destinataire.
 */
@Injectable()
export class SubAccountNoticeDispatcher {
  constructor(
    private readonly orders: OrderNoticeSummaryReader,
    private readonly lifecycle: CompanyLifecycleReader,
    private readonly rules: SubAccountNoticeRulesReader,
    private readonly members: AcceptedMembersReader,
    private readonly journal: NoticeSendJournal,
    private readonly clock: Clock,
    @Inject(MAILER) private readonly mailer: B2bMailer,
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
    if (!principalStillWritten(await this.lifecycle.statusOf(principalId))) {
      return;
    }
    const roles = notifiedRoles(notice.kind, await this.rules.overridesOf(principalId));
    const recipients = noticeRecipients(
      await this.members.withRoles(principalId, roles),
      notice.authorOf(summary),
    );
    for (const recipient of recipients) {
      await this.sendOnce(notice, summary, summary.companyName, recipient);
    }
  }

  private async sendOnce(
    notice: OrderNotice,
    summary: OrderNoticeSummary,
    siteName: string,
    recipient: { readonly userId: string; readonly email: string },
  ): Promise<void> {
    if (!(await this.journal.claim(notice.eventId, recipient.userId, this.clock.now()))) {
      return;
    }
    await this.mailer.send({
      to: recipient.email,
      template: "customer.sub-account-activity",
      data: {
        activity: notice.activity,
        siteName,
        orderNumber: summary.orderNumber,
        totalCents: summary.principalSeesAmount ? summary.totalCents : null,
        requestedFor: summary.requestedFor,
        enteredByTeam: summary.enteredByTeam,
      },
      // Seconde ligne, chez le fournisseur : le journal est annulé avec la
      // transaction de la garde si un envoi suivant lève (cf. le plan, N2 bâti).
      idempotencyKey: `sub-account-notice:${notice.eventId}:${recipient.userId}`,
    });
  }
}
