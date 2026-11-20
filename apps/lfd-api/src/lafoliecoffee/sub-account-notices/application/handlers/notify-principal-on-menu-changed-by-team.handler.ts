import { Injectable } from "@nestjs/common";

import {
  SiteGestureFact,
  SUB_ACCOUNT_MENU_SET,
} from "../../../account/domain/events/site-gesture.fact.js";
import { AcceptedMembersReader } from "../../../account/domain/ports/accepted-members.reader.js";
import { CompanyLifecycleReader } from "../../../account/domain/ports/company-lifecycle.reader.js";
import { Mail } from "../../../../mail/channels/requests/mail.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  MENU_CHANGE_NOTIFIED_ROLES,
  menuChangeNoticeTarget,
} from "../../domain/menu-change-notice.js";
import { noticeRecipients, principalStillWritten } from "../../domain/notice-recipients.js";
import { NoticeSendJournal } from "../../domain/ports/notice-send.journal.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const NOTIFY_PRINCIPAL_ON_MENU_CHANGED_BY_TEAM =
  "b2b.sub-account-notices.on-menu-changed-by-team";

/**
 * **L'équipe a changé la carte d'un site → son principal est prévenu**
 * (`carte-des-sites.md`, Q3). Rien quand le principal l'a posée
 * lui-même. Destinataires : le propriétaire et l'administrateur ACCEPTÉS du
 * principal figé au geste, une fois chacun (journal d'envoi). Le mail ne dit
 * rien de la carte : il nomme le site et renvoie à « Mes sites ».
 */
@Injectable()
@DurableHandler({
  type: SUB_ACCOUNT_MENU_SET,
  subscriber: NOTIFY_PRINCIPAL_ON_MENU_CHANGED_BY_TEAM,
})
export class NotifyPrincipalOnMenuChangedByTeam implements DurableSubscriber {
  constructor(
    private readonly lifecycle: CompanyLifecycleReader,
    private readonly members: AcceptedMembersReader,
    private readonly journal: NoticeSendJournal,
    private readonly clock: Clock,
    private readonly mail: Mail,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const stamp = SiteGestureFact.stampOf(delivery.payload);
    const principalId = menuChangeNoticeTarget(stamp);
    if (principalId === null) {
      return;
    }
    if (!principalStillWritten(await this.lifecycle.statusOf(principalId))) {
      return;
    }
    const recipients = noticeRecipients(
      await this.members.withRoles(principalId, MENU_CHANGE_NOTIFIED_ROLES),
      null,
    );
    for (const recipient of recipients) {
      if (!(await this.journal.claim(delivery.eventId, recipient.userId, this.clock.now()))) {
        continue;
      }
      await this.mail.send({
        to: recipient.email,
        template: "customer.sub-account-gesture",
        data: { gesture: "menu_changed", siteName: stamp.siteName, reference: null, byTeam: true },
        subjects: [{ type: "company", id: principalId }],
        idempotencyKey: `sub-account-menu-notice:${delivery.eventId}:${recipient.userId}`,
      });
    }
  }
}
