import { Inject, Injectable } from "@nestjs/common";
import type { SubAccountNoticeKind } from "@lfd/contracts";

import { AcceptedMembersReader } from "../../../account/domain/ports/accepted-members.reader.js";
import { CompanyLifecycleReader } from "../../../account/domain/ports/company-lifecycle.reader.js";
import { SubAccountNoticeSwitchReader } from "../../../account/domain/ports/sub-account-notice-switch.js";
import { SubAccountNoticeRulesReader } from "../../../account/domain/ports/sub-account-notice-rules.reader.js";
import type { B2bMails } from "../../../../platform/mailer/mail-templates.js";
import { MAILER, type B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import { Clock } from "../../../../platform/time/clock.js";
import { noticeRecipients, principalStillWritten } from "../../domain/notice-recipients.js";
import { notifiedRoles } from "../../domain/notified-roles.js";
import { NoticeSendJournal } from "../../domain/ports/notice-send.journal.js";

/** Les deux gabarits d'un avis au principal : la commande (N2), le geste (N4). */
export type PrincipalNoticeTemplate =
  "customer.sub-account-activity" | "customer.sub-account-gesture";

/** À qui l'avis s'adresse, et de quoi. */
export interface PrincipalNoticeTarget {
  /** L'identifiant du fait dans la boîte d'envoi — clé du journal d'envoi. */
  readonly eventId: string;
  readonly kind: SubAccountNoticeKind;
  /** Le principal FIGÉ par le fait ou par la commande — jamais relu dans la hiérarchie. */
  readonly principalId: string;
  /** Qui a fait le geste ; `null` : personne côté client (l'équipe, le système). */
  readonly authorUserId: string | null;
}

/**
 * **La fin commune de tout avis au principal** (`plan-notifications-sous-comptes.md`,
 * §2, N4 « Le socle ») : les avis de ce principal sont-ils ACTIVÉS
 * (« Interrupteur bâti » — désactivés par défaut, et rien n'est rattrapé à la
 * réactivation : ni mail, ni ligne du journal d'envoi pendant la coupure), le
 * principal est-il encore écrit (Q2), quels rôles
 * sont cochés, quels membres ACCEPTÉS les tiennent moins l'auteur, puis, par
 * destinataire, la ligne du journal d'envoi d'abord, l'envoi ensuite.
 *
 * Extraite du dispatcher de N2 : la commande et les gestes de N4 ne
 * diffèrent que par ce qu'ils lisent avant et par le gabarit.
 */
@Injectable()
export class PrincipalNoticeSender {
  constructor(
    private readonly switches: SubAccountNoticeSwitchReader,
    private readonly lifecycle: CompanyLifecycleReader,
    private readonly rules: SubAccountNoticeRulesReader,
    private readonly members: AcceptedMembersReader,
    private readonly journal: NoticeSendJournal,
    private readonly clock: Clock,
    @Inject(MAILER) private readonly mailer: B2bMailer,
  ) {}

  async send<K extends PrincipalNoticeTemplate>(
    target: PrincipalNoticeTarget,
    template: K,
    data: B2bMails[K],
  ): Promise<void> {
    if (!(await this.switches.isEnabled(target.principalId))) {
      return;
    }
    if (!principalStillWritten(await this.lifecycle.statusOf(target.principalId))) {
      return;
    }
    const roles = notifiedRoles(target.kind, await this.rules.overridesOf(target.principalId));
    const recipients = noticeRecipients(
      await this.members.withRoles(target.principalId, roles),
      target.authorUserId,
    );
    for (const recipient of recipients) {
      if (!(await this.journal.claim(target.eventId, recipient.userId, this.clock.now()))) {
        continue;
      }
      await this.mailer.send({
        to: recipient.email,
        template,
        data,
        // Seconde ligne, chez le fournisseur : le journal est annulé avec la
        // transaction de la garde si un envoi suivant lève (cf. le plan, N2 bâti).
        idempotencyKey: `sub-account-notice:${target.eventId}:${recipient.userId}`,
      });
    }
  }
}
